import { voiceExtractionSchema, type VoiceExtraction } from "../../../packages/shared/src/index.js";

const timeZone = "Europe/Istanbul";
const weekdayIndexes: Record<string, number> = {
  pazar: 0,
  pazartesi: 1,
  salı: 2,
  çarşamba: 3,
  perşembe: 4,
  cuma: 5,
  cumartesi: 6,
};

const turkishNumberWords: Record<string, number> = {
  bir: 1,
  iki: 2,
  üç: 3,
  dört: 4,
  beş: 5,
  altı: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
  on: 10,
};

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

function localDateParts(date: Date): LocalDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: weekdays[value("weekday")] ?? 0,
  };
}

export function voiceReferenceContext(date: Date): string {
  const local = localDateParts(date);
  const isoDate = `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
  const weekday = new Intl.DateTimeFormat("tr-TR", { timeZone, weekday: "long" }).format(date);
  return `Reference date: ${isoDate} (${weekday}), time zone: ${timeZone}.`;
}

function explicitDaysInText(text: string, referenceDate: Date): number | null {
  const explicitlyFutureWeekdays = [...text.matchAll(/(?:^|\s)(?:önümüzdeki|gelecek)\s+(pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar)(?:\s+günü)?/giu)];
  if (explicitlyFutureWeekdays.length === 1) {
    const currentWeekday = localDateParts(referenceDate).weekday;
    const targetWeekday = weekdayIndexes[explicitlyFutureWeekdays[0]?.[1]?.toLocaleLowerCase("tr-TR") ?? ""];
    if (targetWeekday !== undefined) {
      const delta = (targetWeekday - currentWeekday + 7) % 7;
      return delta === 0 ? 7 : delta;
    }
  }
  if (/\bbugün\b/iu.test(text)) return 0;
  if (/\b(?:yarın|ertesi gün)\b/iu.test(text)) return 1;
  if (/\böbür gün\b/iu.test(text)) return 2;

  const numericDay = text.match(/\b(\d{1,3})\s*gün\s+(?:sonra|içinde)\b/iu);
  if (numericDay?.[1]) return Math.min(Number(numericDay[1]), 3_650);
  const writtenDay = text.match(/(?:^|\s)(bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)\s+gün\s+(?:sonra|içinde)(?=\s|[,.!?;]|$)/iu);
  if (writtenDay?.[1]) return turkishNumberWords[writtenDay[1].toLocaleLowerCase("tr-TR")] ?? null;
  const writtenWeek = text.match(/(?:^|\s)(bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)\s+hafta\s+(?:sonra|içinde)(?=\s|[,.!?;]|$)/iu);
  if (writtenWeek?.[1]) return (turkishNumberWords[writtenWeek[1].toLocaleLowerCase("tr-TR")] ?? 0) * 7;
  if (/\b(?:bir hafta sonra|haftaya)\b/iu.test(text)) return 7;

  const weekdayMatches = [...text.matchAll(/(?:(önümüzdeki|gelecek)\s+)?(pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar)(?:\s+günü)?/giu)];
  if (weekdayMatches.length !== 1) return null;
  const currentWeekday = localDateParts(referenceDate).weekday;
  const targetWeekday = weekdayIndexes[weekdayMatches[0]?.[2]?.toLocaleLowerCase("tr-TR") ?? ""];
  if (targetWeekday === undefined) return null;
  const nextWeekExplicit = Boolean(weekdayMatches[0]?.[1]);
  const delta = (targetWeekday - currentWeekday + 7) % 7;
  return delta === 0 && nextWeekExplicit ? 7 : delta;
}

function actionClauses(text: string): string[] {
  return text
    .split(/(?<=[.!?;,])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function describesCompletedInteraction(clause: string): boolean {
  return /\b(?:görüştüm|görüştük|konuştum|konuştuk|aradım|aradı|arandım|gerçekleşti)\b/iu.test(clause);
}

function explicitDaysFromNow(
  text: string,
  referenceDate: Date,
  nextActionType: VoiceExtraction["interaction"]["nextActionType"],
): number | null {
  const matching = actionClauses(text)
    .filter((clause) => actionSentenceMatches(clause, nextActionType) && !describesCompletedInteraction(clause))
    .map((clause) => explicitDaysInText(clause, referenceDate))
    .filter((value): value is number => value !== null);
  const unique = [...new Set(matching)];
  if (unique.length === 1) return unique[0]!;
  if (unique.length > 1) return null;
  return explicitDaysInText(text, referenceDate);
}

function actionSentenceMatches(sentence: string, nextActionType: VoiceExtraction["interaction"]["nextActionType"]): boolean {
  if (nextActionType === "message") return /(?:e-?posta|mail|mesaj|whatsapp|gönder|ilet|paylaş)/iu.test(sentence);
  if (nextActionType === "valuation") return /(?:değerleme|ekspertiz)/iu.test(sentence);
  if (nextActionType === "appointment") return /(?:randevu|buluş|görüş)/iu.test(sentence);
  if (nextActionType === "call") return /(?:ara|telefon)/iu.test(sentence);
  return true;
}

function normalizeSplitTimes(text: string): string {
  return text.replace(
    /\b(saat\s+)([01]?\d|2[0-3])\.\s+([0-5]\d)(?=(?:['’](?:te|ta|de|da))?\b)/giu,
    (_match, prefix: string, hour: string, minute: string) => `${prefix}${hour}:${minute}`,
  );
}

function explicitActionTime(
  text: string,
  nextActionType: VoiceExtraction["interaction"]["nextActionType"],
): string | null | undefined {
  const normalizedText = normalizeSplitTimes(text);
  const matches = [...normalizedText.matchAll(/\b(?:saat\s*)?([01]?\d|2[0-3])[:.]([0-5]\d)(?:['’](?:te|ta|de|da))?\b/giu)];
  if (matches.length === 0) return undefined;
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  const start = match.index ?? 0;
  const sentenceStart = Math.max(
    normalizedText.lastIndexOf(".", start),
    normalizedText.lastIndexOf("!", start),
    normalizedText.lastIndexOf("?", start),
    normalizedText.lastIndexOf(",", start),
    normalizedText.lastIndexOf(";", start),
  ) + 1;
  const sentenceEndCandidates = [normalizedText.indexOf(".", start), normalizedText.indexOf("!", start), normalizedText.indexOf("?", start), normalizedText.indexOf(",", start), normalizedText.indexOf(";", start)].filter((index) => index >= 0);
  const sentenceEnd = sentenceEndCandidates.length > 0 ? Math.min(...sentenceEndCandidates) : normalizedText.length;
  const sentence = normalizedText.slice(sentenceStart, sentenceEnd);
  if (!actionSentenceMatches(sentence, nextActionType)) return null;
  return `${String(Number(matches[0]?.[1])).padStart(2, "0")}:${matches[0]?.[2]}`;
}

export function normalizeVoiceActionTiming(
  extraction: VoiceExtraction,
  maskedTranscript: string,
  referenceDate: Date,
): VoiceExtraction {
  if (!extraction.interaction.nextActionType) {
    return voiceExtractionSchema.parse({
      ...extraction,
      interaction: { ...extraction.interaction, daysFromNow: null, actionTime: null },
    });
  }

  const daysFromNow = explicitDaysFromNow(maskedTranscript, referenceDate, extraction.interaction.nextActionType);
  const actionTime = explicitActionTime(maskedTranscript, extraction.interaction.nextActionType);
  return voiceExtractionSchema.parse({
    ...extraction,
    interaction: {
      ...extraction.interaction,
      daysFromNow: daysFromNow ?? extraction.interaction.daysFromNow,
      actionTime: actionTime === undefined ? extraction.interaction.actionTime : actionTime,
    },
  });
}
