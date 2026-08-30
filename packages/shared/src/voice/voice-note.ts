import { z } from "zod";
import {
  askOutcomes,
  interactionChannels,
  interactionObjectives,
  manualInteractionSchema,
  nextActionTypes,
} from "../interactions/manual-interaction.js";
import type { ContactMemory, PropertyTransactionType } from "../domain/entities.js";
import { opportunityDraftSchema } from "../opportunities/opportunity-draft.js";

export const voiceNoteStatuses = ["queued", "processing", "needs_review", "confirmed", "discarded", "failed"] as const;
export type VoiceNoteStatus = (typeof voiceNoteStatuses)[number];
export type VoiceNoteInputMode = "audio" | "manual_text" | "text_test";

export const sensitiveDataCategories = [
  "health",
  "religion",
  "ethnicity",
  "political_opinion",
  "union_membership",
] as const;
export type SensitiveDataCategory = (typeof sensitiveDataCategories)[number];

export const propertyTransactionTypes = ["buy", "sell", "rent", "let", "invest"] as const;

export const voicePropertyTypes = ["apartment", "villa", "detached_house", "land", "commercial"] as const;

export const voicePropertyContexts = ["search_preference", "subject_property"] as const;

export const voicePropertyPreferencesSchema = z.object({
  transactionType: z.enum(propertyTransactionTypes).nullable(),
  propertyTypes: z.array(z.enum(voicePropertyTypes)).max(5),
  preferredLocations: z.array(z.string().trim().min(1).max(120)).max(8),
  budgetRange: z.object({
    min: z.number().nonnegative().nullable(),
    max: z.number().positive().nullable(),
    currency: z.enum(["TRY", "GBP", "USD", "EUR"]),
  }).strict().nullable(),
  bedroomCountMin: z.number().nonnegative().max(100).nullable().default(null),
  livingRoomCountMin: z.number().nonnegative().max(20).nullable().default(null),
  /** @deprecated Kept while existing contact memories migrate to bedroom/living-room counts. */
  roomCountMin: z.number().nonnegative().max(100).nullable(),
  areaMinM2: z.number().positive().max(100_000).nullable(),
  areaMaxM2: z.number().positive().max(100_000).nullable().default(null),
  mustHaves: z.array(z.string().trim().min(1).max(160)).max(8),
  dealBreakers: z.array(z.string().trim().min(1).max(160)).max(8),
  timeline: z.string().trim().min(1).max(180).nullable(),
}).strict().superRefine((value, context) => {
  const budget = value.budgetRange;
  if (budget?.min !== null && budget?.min !== undefined && budget.max !== null && budget.max < budget.min) {
    context.addIssue({ code: "custom", message: "Maximum budget cannot be lower than minimum budget.", path: ["budgetRange", "max"] });
  }
  if (value.areaMinM2 !== null && value.areaMaxM2 !== null && value.areaMaxM2 < value.areaMinM2) {
    context.addIssue({ code: "custom", message: "Maximum area cannot be lower than minimum area.", path: ["areaMaxM2"] });
  }
});

export const emptyVoicePropertyPreferences: VoicePropertyPreferences = {
  transactionType: null,
  propertyTypes: [],
  preferredLocations: [],
  budgetRange: null,
  bedroomCountMin: null,
  livingRoomCountMin: null,
  roomCountMin: null,
  areaMinM2: null,
  areaMaxM2: null,
  mustHaves: [],
  dealBreakers: [],
  timeline: null,
};

export const voiceInsightsSchema = z.object({
  keyThingsToRemember: z.array(z.string().trim().min(2).max(180)).max(8),
  propertyContext: z.enum(voicePropertyContexts).nullable().default(null),
  propertyPreferences: voicePropertyPreferencesSchema,
  suggestedActionReason: z.string().trim().min(2).max(240).nullable(),
}).strict();

export const emptyVoiceInsights: VoiceInsights = {
  keyThingsToRemember: [],
  propertyContext: null,
  propertyPreferences: emptyVoicePropertyPreferences,
  suggestedActionReason: null,
};

export const contactMemorySchema = z.object({
  keyThingsToRemember: z.array(z.string().trim().min(2).max(180)).max(12),
  propertyPreferences: voicePropertyPreferencesSchema,
  updatedAt: z.number().int().positive().nullable(),
}).strict();

export const registerVoiceNoteSchema = z.object({
  contactId: z.string().min(1).max(160),
  storagePath: z.string().min(1).max(500),
  durationMs: z.number().int().min(5_000).max(90_000),
  mimeType: z.enum(["audio/mp4", "audio/m4a", "audio/webm", "audio/wav", "audio/x-wav"]),
  conversationEndedConfirmed: z.literal(true),
  emulatorTranscript: z.string().trim().min(2).max(4_000).optional(),
}).strict();

export const registerVoiceTextTestSchema = z.object({
  contactId: z.string().min(1).max(160),
  transcript: z.string().trim().min(2).max(4_000),
}).strict();

export const registerInteractionTextSchema = registerVoiceTextTestSchema;

export const voiceInteractionDraftSchema = z.object({
  channel: z.enum(interactionChannels).nullable(),
  objective: z.enum(interactionObjectives).nullable(),
  direction: z.enum(["outbound", "inbound", "mutual"]).nullable(),
  outcome: z.string().trim().max(500).nullable(),
  askOutcome: z.enum(askOutcomes).nullable(),
  noteSummary: z.string().trim().max(1_000).nullable(),
  nextActionType: z.enum(nextActionTypes).nullable(),
  daysFromNow: z.number().int().min(0).max(3_650).nullable(),
  actionTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u).nullable().default(null),
}).strict();

export const voiceExtractionSchema = z.object({
  isUnclear: z.boolean(),
  interaction: voiceInteractionDraftSchema,
  insights: voiceInsightsSchema,
  confidence: z.array(z.object({
    path: z.string().min(1).max(160),
    score: z.number().min(0).max(1),
  }).strict()).max(32),
  provenance: z.object({
    engine: z.enum(["rules", "vertex_ai"]),
    model: z.string().min(1).max(120).nullable(),
    promptVersion: z.string().min(1).max(40),
  }).strict(),
}).strict();

export const aiVoiceExtractionSchema = voiceExtractionSchema.omit({ provenance: true });

export const confirmVoiceNoteSchema = z.object({
  voiceNoteId: z.string().min(1).max(160),
  interaction: manualInteractionSchema,
  approvedInsights: voiceInsightsSchema.default(emptyVoiceInsights),
  opportunity: opportunityDraftSchema.omit({ subjectContactId: true }).nullable().default(null),
}).strict();

export const getVoiceNoteSchema = z.object({
  voiceNoteId: z.string().min(1).max(160),
}).strict();

export const retryVoiceNoteProcessingSchema = getVoiceNoteSchema.extend({
  emulatorTranscript: z.string().trim().min(2).max(4_000).optional(),
});

export const discardVoiceNoteSchema = getVoiceNoteSchema;

export type RegisterVoiceNoteInput = z.infer<typeof registerVoiceNoteSchema>;
export type RegisterVoiceTextTestInput = z.infer<typeof registerVoiceTextTestSchema>;
export type RegisterInteractionTextInput = z.infer<typeof registerInteractionTextSchema>;
export type VoiceExtraction = z.infer<typeof voiceExtractionSchema>;
export type VoiceInsights = z.infer<typeof voiceInsightsSchema>;
export type VoicePropertyPreferences = z.infer<typeof voicePropertyPreferencesSchema>;
export type ConfirmVoiceNoteInput = z.infer<typeof confirmVoiceNoteSchema>;
export type DiscardVoiceNoteInput = z.infer<typeof discardVoiceNoteSchema>;
export type RetryVoiceNoteProcessingInput = z.infer<typeof retryVoiceNoteProcessingSchema>;

export interface VoiceNoteView {
  id: string;
  contactId: string;
  inputMode: VoiceNoteInputMode;
  status: VoiceNoteStatus;
  durationMs: number;
  maskedTranscript: string | null;
  maskedCategories: SensitiveDataCategory[];
  transcriptionWarning: "possibly_incomplete" | null;
  extraction: VoiceExtraction | null;
  interactionId: string | null;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
}

export const sensitiveDataCategoryLabels: Record<SensitiveDataCategory, string> = {
  health: "Sağlık bilgisi",
  religion: "Din veya inanç bilgisi",
  ethnicity: "Etnik köken bilgisi",
  political_opinion: "Siyasi görüş bilgisi",
  union_membership: "Sendika bilgisi",
};

export const lowConfidenceThreshold = 0.75;

export const propertyTransactionTypeLabels: Record<PropertyTransactionType, string> = {
  buy: "Satın alma",
  sell: "Satış",
  rent: "Kiralama",
  let: "Kiraya verme",
  invest: "Yatırım",
};

export const voicePropertyTypeLabels: Record<(typeof voicePropertyTypes)[number], string> = {
  apartment: "Daire",
  villa: "Villa",
  detached_house: "Müstakil ev",
  land: "Arsa",
  commercial: "Ticari gayrimenkul",
};

function mergeUnique(latest: string[], existing: string[], limit: number): string[] {
  const seen = new Set<string>();
  return [...latest, ...existing].filter((value) => {
    const key = value.trim().toLocaleLowerCase("tr-TR");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export function mergeVoiceInsightsIntoContactMemory(
  current: ContactMemory,
  insights: VoiceInsights,
  now: number,
): ContactMemory {
  const previous = current.propertyPreferences;
  const next = insights.propertyPreferences;
  const shouldMergePreferences = insights.propertyContext !== "subject_property";
  return contactMemorySchema.parse({
    keyThingsToRemember: mergeUnique(insights.keyThingsToRemember, current.keyThingsToRemember, 12),
    propertyPreferences: {
      transactionType: shouldMergePreferences ? next.transactionType ?? previous.transactionType : previous.transactionType,
      propertyTypes: shouldMergePreferences ? mergeUnique(next.propertyTypes, previous.propertyTypes, 5) : previous.propertyTypes,
      preferredLocations: shouldMergePreferences ? mergeUnique(next.preferredLocations, previous.preferredLocations, 8) : previous.preferredLocations,
      budgetRange: shouldMergePreferences ? next.budgetRange ?? previous.budgetRange : previous.budgetRange,
      bedroomCountMin: shouldMergePreferences ? next.bedroomCountMin ?? previous.bedroomCountMin : previous.bedroomCountMin,
      livingRoomCountMin: shouldMergePreferences ? next.livingRoomCountMin ?? previous.livingRoomCountMin : previous.livingRoomCountMin,
      roomCountMin: shouldMergePreferences ? next.roomCountMin ?? previous.roomCountMin : previous.roomCountMin,
      areaMinM2: shouldMergePreferences ? next.areaMinM2 ?? previous.areaMinM2 : previous.areaMinM2,
      areaMaxM2: shouldMergePreferences ? next.areaMaxM2 ?? previous.areaMaxM2 : previous.areaMaxM2,
      mustHaves: shouldMergePreferences ? mergeUnique(next.mustHaves, previous.mustHaves, 8) : previous.mustHaves,
      dealBreakers: shouldMergePreferences ? mergeUnique(next.dealBreakers, previous.dealBreakers, 8) : previous.dealBreakers,
      timeline: shouldMergePreferences ? next.timeline ?? previous.timeline : previous.timeline,
    },
    updatedAt: now,
  });
}
