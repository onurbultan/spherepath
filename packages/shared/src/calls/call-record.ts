import { z } from "zod";

/** Which switch produced the metadata; call audio is never requested or stored. */
export const callProviders = ["verimor"] as const;
export type CallProvider = (typeof callProviders)[number];

export const callDirections = ["inbound", "outbound", "internal"] as const;
export type CallDirection = (typeof callDirections)[number];

/**
 * `none` is a call the switch never recorded, which is a normal outcome and not
 * a failure. The rest track one recording from notification to stored audio.
 */
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
