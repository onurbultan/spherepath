import {
  voiceExtractionSchema,
  type SensitiveDataCategory,
  type VoiceExtraction,
} from "../../../packages/shared/src/index.js";

interface SensitivePattern {
  category: SensitiveDataCategory;
  pattern: RegExp;
}

const sensitivePatterns: SensitivePattern[] = [
  { category: "health", pattern: /\b(hastalık|hasta|kanser|tansiyon|diyabet|depresyon|psikiyatr|engelli|hamile|ilaç|ameliyat|sağlık)\w*/iu },
  { category: "religion", pattern: /\b(müslüman|hristiyan|yahudi|alevi|sünni|ateist|din(?:i|e|den)?|mezhep|inanç)\w*/iu },
  { category: "ethnicity", pattern: /\b(etnik|ırk|kürt|türk|rum|ermeni|laz|çerkes)\w*/iu },
  { category: "political_opinion", pattern: /\b(siyasi|politik|parti(?:li|ye|den)?|muhafazakâr|milliyetçi|sosyalist|liberal)\w*/iu },
  { category: "union_membership", pattern: /\b(sendika|sendikalı|sendika üyesi)\w*/iu },
];

export interface MaskedTranscript {
  text: string;
  categories: SensitiveDataCategory[];
  maskedRanges: Array<{ category: SensitiveDataCategory; start: number; end: number }>;
}

export function maskSensitiveTranscript(rawTranscript: string): MaskedTranscript {
  const sentences = rawTranscript
    .replace(/\s+/gu, " ")
    .trim()
    .match(/[^.!?]+[.!?]?/gu) ?? [];
  const categories = new Set<SensitiveDataCategory>();
  const ranges: MaskedTranscript["maskedRanges"] = [];
  let text = "";

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    const matches = sensitivePatterns.filter(({ pattern }) => pattern.test(sentence));
    const replacement = matches.length > 0 ? "[HASSAS İÇERİK MASKELENDİ]" : sentence;
    if (text) text += " ";
    const start = text.length;
    text += replacement;
    if (matches.length > 0) {
      for (const match of matches) {
        categories.add(match.category);
        ranges.push({ category: match.category, start, end: text.length });
      }
    }
  }

  return { text, categories: [...categories], maskedRanges: ranges };
}

function inferNextAction(text: string): VoiceExtraction["interaction"]["nextActionType"] {
  if (/\b(ara|arayacağım|arayacağiz|arayacağız|telefon edeceğim)\b/iu.test(text)) return "call";
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
    },
    confidence,
  });
}
