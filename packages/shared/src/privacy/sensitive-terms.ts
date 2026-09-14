import type { SensitiveDataCategory } from "../voice/voice-note.js";

/**
 * The special-category roots, in one place because two copies drifted. The
 * trusted masker carried the careful version with the lookaheads below; the
 * shared classifier carried an older list without them, and so read "hastaneye
 * yakın bir ev arıyor" and "Türkiye geneline yatırım yapıyor" as health and
 * ethnicity data. That was tolerable while it only lowered a note's confidence.
 * It is not tolerable now that the same rule decides whether an advisor is
 * allowed to save what they wrote.
 *
 * Turkish is agglutinative, so each root has to match its inflected forms
 * ("hastalığı", "dinine", "Lazlar"). The negative lookaheads carve out the
 * everyday words that merely share a prefix with a sensitive root -- "lazım",
 * "Türkiye", "Rumeli", "hastane", "dinlenme".
 */
export const sensitiveTermPatterns: ReadonlyArray<{ category: SensitiveDataCategory; pattern: RegExp }> = [
  { category: "health", pattern: /\b(hastalık|hasta(?!ne)|kanser|tansiyon|diyabet|depresyon|psikiyatr|engelli|hamile|ilaç|ameliyat|sağlık)\w*/iu },
  { category: "religion", pattern: /\b(müslüman|hristiyan|yahudi|alevi|sünni|ateist|din(?!le|len|am|az|gil)(?:i|e|den)?|mezhep|inanç)\w*/iu },
  { category: "ethnicity", pattern: /\b(etnik|ırk|kürt|türk(?!iye|çe|iyat)|rum(?!eli|uz)|ermeni|laz(?!ım|er)|çerkes)\w*/iu },
  { category: "political_opinion", pattern: /\b(siyasi|politik|parti(?:li|ye|den)?|muhafazakâr|muhafazakar|milliyetçi|sosyalist|liberal)\w*/iu },
  { category: "union_membership", pattern: /\b(sendika|sendikalı|sendika üyesi)\w*/iu },
];

/** One expression for callers that only need to know whether a sentence is affected. */
export const sensitiveTermExpression = new RegExp(
  sensitiveTermPatterns.map((entry) => entry.pattern.source).join("|"),
  "iu",
);

export const sensitiveMask = "[HASSAS İÇERİK MASKELENDİ]";
