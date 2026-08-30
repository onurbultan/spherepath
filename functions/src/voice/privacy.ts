import {
  emptyVoicePropertyPreferences,
  voiceExtractionSchema,
  type SensitiveDataCategory,
  type VoiceExtraction,
} from "../../../packages/shared/src/index.js";

interface SensitivePattern {
  category: SensitiveDataCategory;
  pattern: RegExp;
}

// Turkish is agglutinative, so these roots must still match their inflected forms
// ("hastalığı", "dinine", "Lazlar"). The negative lookaheads carve out everyday words
// that merely share a prefix with a sensitive root -- "lazım", "Türkiye", "Rumeli",
// "hastane", "dinlenme" -- which would otherwise be masked as special-category data.
const sensitivePatterns: SensitivePattern[] = [
  { category: "health", pattern: /\b(hastalık|hasta(?!ne)|kanser|tansiyon|diyabet|depresyon|psikiyatr|engelli|hamile|ilaç|ameliyat|sağlık)\w*/iu },
  { category: "religion", pattern: /\b(müslüman|hristiyan|yahudi|alevi|sünni|ateist|din(?!le|len|am|az|gil)(?:i|e|den)?|mezhep|inanç)\w*/iu },
  { category: "ethnicity", pattern: /\b(etnik|ırk|kürt|türk(?!iye|çe|iyat)|rum(?!eli|uz)|ermeni|laz(?!ım|er)|çerkes)\w*/iu },
  { category: "political_opinion", pattern: /\b(siyasi|politik|parti(?:li|ye|den)?|muhafazakâr|muhafazakar|milliyetçi|sosyalist|liberal)\w*/iu },
  { category: "union_membership", pattern: /\b(sendika|sendikalı|sendika üyesi)\w*/iu },
];

export const sensitiveMask = "[HASSAS İÇERİK MASKELENDİ]";

export interface MaskedTranscript {
  text: string;
  categories: SensitiveDataCategory[];
  maskedRanges: Array<{ category: SensitiveDataCategory; start: number; end: number }>;
}

export function maskSensitiveTranscript(rawTranscript: string): MaskedTranscript {
  const source = rawTranscript.replace(/\s+/gu, " ").trim();
  const hits: Array<{ start: number; end: number; category: SensitiveDataCategory }> = [];

  for (const { category, pattern } of sensitivePatterns) {
    const scanner = new RegExp(pattern.source, `${pattern.flags}g`);
    for (const match of source.matchAll(scanner)) {
      if (match.index === undefined || !match[0]) continue;
      hits.push({ start: match.index, end: match.index + match[0].length, category });
    }
  }
  if (!hits.length) return { text: source, categories: [], maskedRanges: [] };

  hits.sort((left, right) => left.start - right.start || left.end - right.end);
  const spans: Array<{ start: number; end: number; categories: SensitiveDataCategory[] }> = [];
  for (const hit of hits) {
    const previous = spans.at(-1);
    if (previous && hit.start <= previous.end) {
      previous.end = Math.max(previous.end, hit.end);
      if (!previous.categories.includes(hit.category)) previous.categories.push(hit.category);
      continue;
    }
    spans.push({ start: hit.start, end: hit.end, categories: [hit.category] });
  }

  const categories = new Set<SensitiveDataCategory>();
  const ranges: MaskedTranscript["maskedRanges"] = [];
  let text = "";
  let cursor = 0;
  for (const span of spans) {
    text += source.slice(cursor, span.start);
    const start = text.length;
    text += sensitiveMask;
    for (const category of span.categories) {
      categories.add(category);
      ranges.push({ category, start, end: text.length });
    }
    cursor = span.end;
  }
  text += source.slice(cursor);

  return { text, categories: [...categories], maskedRanges: ranges };
}

// The transcript keeps its surrounding facts, but an extracted value is stored on the
// contact, so any sensitive hit drops the whole value rather than leaving a fragment.
function safeExtractedText(value: string | null): string | null {
  if (value === null) return null;
  const masked = maskSensitiveTranscript(value);
  if (masked.maskedRanges.length > 0) return null;
  const text = masked.text.trim();
  return text ? text : null;
}

function safeExtractedList(values: string[]): string[] {
  return values.flatMap((value) => {
    const safe = safeExtractedText(value);
    return safe ? [safe] : [];
  });
}

export function sanitizeVoiceExtraction(extraction: VoiceExtraction): VoiceExtraction {
  const preferences = extraction.insights.propertyPreferences;
  return voiceExtractionSchema.parse({
    ...extraction,
    interaction: {
      ...extraction.interaction,
      outcome: safeExtractedText(extraction.interaction.outcome),
      noteSummary: safeExtractedText(extraction.interaction.noteSummary),
    },
    insights: {
      keyThingsToRemember: safeExtractedList(extraction.insights.keyThingsToRemember),
      propertySituations: extraction.insights.propertySituations.flatMap((situation) => {
        const summary = safeExtractedText(situation.summary);
        if (!summary) return [];
        return [{
          ...situation,
          summary,
          propertyPreferences: {
            ...situation.propertyPreferences,
            preferredLocations: safeExtractedList(situation.propertyPreferences.preferredLocations),
            mustHaves: safeExtractedList(situation.propertyPreferences.mustHaves),
            dealBreakers: safeExtractedList(situation.propertyPreferences.dealBreakers),
            timeline: safeExtractedText(situation.propertyPreferences.timeline),
          },
        }];
      }),
      propertyPreferences: {
        ...preferences,
        preferredLocations: safeExtractedList(preferences.preferredLocations),
        mustHaves: safeExtractedList(preferences.mustHaves),
        dealBreakers: safeExtractedList(preferences.dealBreakers),
        timeline: safeExtractedText(preferences.timeline),
      },
      suggestedActionReason: safeExtractedText(extraction.insights.suggestedActionReason),
    },
  });
}

function inferNextAction(text: string): VoiceExtraction["interaction"]["nextActionType"] {
  if (/\b(ara|aramak|arayıp|arayacağım|arayacağiz|arayacağız|telefon edeceğim)\b/iu.test(text)) return "call";
  if (/\b(mesaj|whatsapp|yazacağım|yazacağız)\b/iu.test(text)) return "message";
  if (/\b(randevu|buluşacağım|buluşacağız|görüşeceğiz)\b/iu.test(text)) return "appointment";
  if (/\b(değerleme|ekspertiz)\b/iu.test(text)) return "valuation";
  if (/\b(teklif)\b/iu.test(text)) return "offer";
  return null;
}

function inferDaysFromNow(text: string): number | null {
  if (/\bbugün\b/iu.test(text)) return 0;
  if (/\byarın\b/iu.test(text)) return 1;
  if (/\b(haftaya|bir hafta)\b/iu.test(text)) return 7;
  const match = text.match(/\b(\d{1,3})\s*gün\b/iu);
  return match?.[1] ? Math.min(Number(match[1]), 3650) : null;
}

export function extractVoiceDraft(maskedTranscript: string): VoiceExtraction {
  const text = maskedTranscript.replace(/\s+/gu, " ").trim();
  const visibleText = text.replace(/\[HASSAS İÇERİK MASKELENDİ\]/gu, "").trim();
  const isUnclear = visibleText.length < 2;
  const outcome = isUnclear ? null : text.slice(0, 500);
  const noteSummary = isUnclear ? null : text.slice(0, 1_000);
  const nextActionType = isUnclear ? null : inferNextAction(visibleText);
  const daysFromNow = nextActionType ? inferDaysFromNow(visibleText) : null;
  const confidence = [
    ...(outcome ? [{ path: "interaction.outcome", score: 0.9 }] : []),
    ...(noteSummary ? [{ path: "interaction.noteSummary", score: 0.9 }] : []),
    ...(nextActionType ? [{ path: "interaction.nextActionType", score: 0.7 }] : []),
    ...(daysFromNow !== null ? [{ path: "interaction.daysFromNow", score: 0.7 }] : []),
  ];

  return voiceExtractionSchema.parse({
    isUnclear,
    interaction: {
      channel: null,
      objective: null,
      direction: null,
      outcome,
      askOutcome: null,
      noteSummary,
      nextActionType,
      daysFromNow,
      actionTime: null,
    },
    insights: {
      keyThingsToRemember: [],
      propertyPreferences: emptyVoicePropertyPreferences,
      propertySituations: [],
      suggestedActionReason: null,
    },
    confidence,
    provenance: {
      engine: "rules",
      model: null,
      promptVersion: "rules-v1",
    },
  });
}
