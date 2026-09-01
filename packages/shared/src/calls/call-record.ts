import { z } from "zod";

/**
 * Which switch the call came from. Recordings reach the same processing pipeline
 * whatever produced them, so the provider is data rather than a branch in code;
 * a second operator is a new adapter and a new value here, nothing more.
 */
export const callProviders = ["verimor"] as const;
export type CallProvider = (typeof callProviders)[number];

export const callDirections = ["inbound", "outbound", "internal"] as const;
export type CallDirection = (typeof callDirections)[number];

/**
 * `none` is a call the switch never recorded, which is a normal outcome and not
 * a failure. The rest track one recording from notification to stored audio.
 */
export const callRecordingStatuses = ["none", "pending", "stored", "failed"] as const;
export type CallRecordingStatus = (typeof callRecordingStatuses)[number];

export const callEventTypes = ["ringing", "answer", "hangup"] as const;
export type CallEventType = (typeof callEventTypes)[number];

export interface CallRecordView {
  id: string;
  provider: CallProvider;
  /** The switch's own call id. Also the idempotency key, because event delivery repeats. */
  providerCallId: string;
  direction: CallDirection;
  fromNumber: string | null;
  toNumber: string | null;
  /** The extension that handled the call. */
  extension: string | null;
  contactId: string | null;
  /** True when the caller was a stranger and this call opened the contact record. */
  contactCreatedFromCall: boolean;
  answered: boolean;
  startedAt: number | null;
  answeredAt: number | null;
  endedAt: number | null;
  durationMs: number;
  talkDurationMs: number;
  queueWaitMs: number;
  hangupCause: string | null;
  recordingStatus: CallRecordingStatus;
  /** Set once the recording has been transcribed into a reviewable note. */
  voiceNoteId: string | null;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
}

export const listCallsSchema = z.object({
  contactId: z.string().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();

export type ListCallsInput = z.infer<typeof listCallsSchema>;

export const startContactCallSchema = z.object({
  contactId: z.string().min(1).max(160),
}).strict();

export type StartContactCallInput = z.infer<typeof startContactCallSchema>;

/**
 * Switches take a destination as digits with the country code and no plus, so
 * the stored E.164 value is trimmed rather than re-derived.
 */
export function toDialableNumber(e164: string | null): string | null {
  return e164 && e164.startsWith("+") ? e164.slice(1) : null;
}

export const callDirectionLabels: Record<CallDirection, string> = {
  inbound: "Gelen",
  outbound: "Giden",
  internal: "Dahili",
};

export const callRecordingStatusLabels: Record<CallRecordingStatus, string> = {
  none: "Kayıt yok",
  pending: "Kayıt alınıyor",
  stored: "Kayıt hazır",
  failed: "Kayıt alınamadı",
};

/**
 * A call worth turning into a note is one that actually happened and that the
 * switch recorded. Missed calls still become records -- they are follow-up work
 * -- but they have nothing to transcribe.
 */
export function shouldIngestRecording(answered: boolean, recordingPresent: boolean, talkDurationMs: number): boolean {
  return answered && recordingPresent && talkDurationMs >= 5_000;
}
