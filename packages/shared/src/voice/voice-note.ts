import { z } from "zod";
import {
  askOutcomes,
  interactionChannels,
  interactionObjectives,
  manualInteractionSchema,
  nextActionTypes,
} from "../interactions/manual-interaction.js";

export const voiceNoteStatuses = ["queued", "processing", "needs_review", "confirmed", "failed"] as const;
export type VoiceNoteStatus = (typeof voiceNoteStatuses)[number];

export const sensitiveDataCategories = [
  "health",
  "religion",
  "ethnicity",
  "political_opinion",
  "union_membership",
] as const;
export type SensitiveDataCategory = (typeof sensitiveDataCategories)[number];

export const registerVoiceNoteSchema = z.object({
  contactId: z.string().min(1).max(160),
  storagePath: z.string().min(1).max(500),
  durationMs: z.number().int().min(10_000).max(45_000),
  mimeType: z.enum(["audio/mp4", "audio/m4a", "audio/webm", "audio/wav", "audio/x-wav"]),
  conversationEndedConfirmed: z.literal(true),
  emulatorTranscript: z.string().trim().min(2).max(4_000).optional(),
}).strict();

export const voiceInteractionDraftSchema = z.object({
  channel: z.enum(interactionChannels).nullable(),
  objective: z.enum(interactionObjectives).nullable(),
  direction: z.enum(["outbound", "inbound", "mutual"]).nullable(),
  outcome: z.string().trim().max(500).nullable(),
  askOutcome: z.enum(askOutcomes).nullable(),
  noteSummary: z.string().trim().max(1_000).nullable(),
  nextActionType: z.enum(nextActionTypes).nullable(),
  daysFromNow: z.number().int().min(0).max(3_650).nullable(),
}).strict();

export const voiceExtractionSchema = z.object({
  isUnclear: z.boolean(),
  interaction: voiceInteractionDraftSchema,
  confidence: z.array(z.object({
    path: z.string().min(1).max(160),
    score: z.number().min(0).max(1),
  }).strict()).max(32),
}).strict();

export const confirmVoiceNoteSchema = z.object({
  voiceNoteId: z.string().min(1).max(160),
  interaction: manualInteractionSchema,
}).strict();

export const getVoiceNoteSchema = z.object({
  voiceNoteId: z.string().min(1).max(160),
}).strict();

export type RegisterVoiceNoteInput = z.infer<typeof registerVoiceNoteSchema>;
export type VoiceExtraction = z.infer<typeof voiceExtractionSchema>;
export type ConfirmVoiceNoteInput = z.infer<typeof confirmVoiceNoteSchema>;

export interface VoiceNoteView {
  id: string;
  contactId: string;
  status: VoiceNoteStatus;
  durationMs: number;
  maskedTranscript: string | null;
  maskedCategories: SensitiveDataCategory[];
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
