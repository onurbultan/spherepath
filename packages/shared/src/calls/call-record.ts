import type { VoiceNoteStatus } from "../voice/voice-note.js";
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
  /** Set when the note is opened, which is before it has been transcribed. */
  voiceNoteId: string | null;
  /**
   * The note's own status, because `voiceNoteId` alone says only that work
   * started. Without it the UI cannot tell a summary that exists from one that
   * is still being written.
   */
  noteStatus: VoiceNoteStatus | null;
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

/**
 * What the list may claim about the summary. A note id only proves the work
 * started, so saying "Özet çıkarıldı" the moment one exists promises a summary
 * that is still being written; each state gets its own words instead.
 */
export function callSummaryLabel(
  call: Pick<CallRecordView, "recordingStatus" | "voiceNoteId" | "noteStatus">,
): string | null {
  if (call.recordingStatus === "pending") return "Kayıt alınıyor";
  if (!call.voiceNoteId) return null;
  switch (call.noteStatus) {
    case "queued":
    case "processing":
      return "Özet hazırlanıyor";
    case "needs_review":
      return "Özet hazır · onay bekliyor";
    case "confirmed":
      return "Özet işlendi";
    case "failed":
      return "Özet çıkarılamadı";
    // A discarded note is deliberately gone, and an absent status says nothing.
    default:
      return null;
  }
}

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
/**
 * The switch reports `recording_present` at hangup, before it has finished
 * writing the file: a recorded call arrives saying false and only turns true a
 * minute or two later. Requiring it here dropped real conversations, so the
 * decision rests on what the hangup event does know reliably -- that someone
 * answered and talked. A recording that genuinely does not exist costs a few
 * retries, which is the cheaper mistake.
 */
export function shouldIngestRecording(answered: boolean, talkDurationMs: number): boolean {
  return answered && talkDurationMs >= 5_000;
}
