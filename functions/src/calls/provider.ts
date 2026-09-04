import type { CallDirection, CallEventType, CallProvider } from "../../../packages/shared/src/index";

/**
 * What every switch has to tell us, whatever shape it sends it in. Adapters
 * translate into this and nothing downstream knows which operator was on the
 * other end.
 */
export interface ParsedCallEvent {
  providerCallId: string;
  eventType: CallEventType;
  direction: CallDirection;
  fromNumber: string | null;
  toNumber: string | null;
  /** The extension that actually handled the call, which is how it finds its advisor. */
  extension: string | null;
  answered: boolean;
  startedAt: number | null;
  answeredAt: number | null;
  endedAt: number | null;
  durationMs: number;
  /** Time on the call once answered. Only this metadata is stored. */
  talkDurationMs: number;
  queueWaitMs: number;
  /** Why the call ended, kept so a run of failures can be diagnosed without the switch's panel. */
  hangupCause: string | null;
}

export interface OriginateRequest {
  /**
   * The advisor's own phone, dialled first. Verimor's `originate` needs a
   * registered SIP device on the extension, which an advisor carrying only
   * their mobile does not have; `bridge` calls two ordinary numbers instead.
   */
  source: string;
  /** Digits with country code, no plus. */
  destination: string;
  callerId: string | null;
}

export interface CallProviderSource {
  readonly provider: CallProvider;
  /** Returns null for payloads that are well-formed but carry no event we act on. */
  parseEvent(body: Record<string, unknown>): ParsedCallEvent | null;
  /** Resolves to the switch's id for the new call. */
  startCall(request: OriginateRequest): Promise<string>;
  /**
   * Points the switch at our event endpoint. Doing this over the API rather than
   * by hand in a panel means the address cannot be mistyped, and rotating the
   * token stays a single action.
   */
  connectEvents(notificationUrl: string): Promise<void>;
  /** What the switch currently believes, so the app can show it rather than assume. */
  readEventConnection(): Promise<{ notificationUrl: string | null; events: string[] }>;
}

const secondsInDay = 86_400;

/**
 * Switches disagree on how they stamp time: epoch seconds, epoch milliseconds,
 * microseconds, or a formatted date. Reading the magnitude first avoids turning
 * seconds into 1970.
 */
/**
 * The switch stamps events in its own wall clock and sends no zone at all
 * ("2026-09-02 16:58:11"). Parsed bare, that is read in whatever zone the
 * container happens to run in -- UTC on Cloud Run -- which put every call three
 * hours into the future. Verimor's switch keeps Turkish time, which has had no
 * daylight saving since 2016, so the offset is a constant rather than a lookup.
 * Its CDR endpoint does send an offset, so an explicit one always wins.
 */
const switchZoneOffset = "+03:00";

export function parseProviderInstant(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return scaleEpoch(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "0") return null;
  if (/^\d+$/u.test(trimmed)) return scaleEpoch(Number(trimmed));

  const [date, time, zone] = trimmed.split(/\s+/u);
  if (date && time && /^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    // "+0300" from a CDR needs the colon before Date.parse will take it.
    const offset = (zone ?? switchZoneOffset).replace(/^([+-]\d{2})(\d{2})$/u, "$1:$2");
    const parsed = Date.parse(`${date}T${time}${offset}`);
    return Number.isNaN(parsed) ? null : parsed;
  }
  // Already ISO, with or without its own zone.
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function scaleEpoch(value: number): number | null {
  if (value <= 0) return null;
  if (value < 1e11) return Math.round(value * 1_000); // seconds
  if (value < 1e14) return Math.round(value); // milliseconds
  return Math.round(value / 1_000); // microseconds
}

export function parseProviderBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "evet"].includes(value.trim().toLowerCase());
}

/**
 * Durations arrive as seconds on every switch documented so far, but a value
 * large enough to be a day is far likelier to already be milliseconds.
 */
export function parseProviderDurationMs(value: unknown): number {
  const raw = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.round(raw > secondsInDay ? raw : raw * 1_000);
}

export function parseProviderNumber(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  return trimmed && trimmed !== "0" ? trimmed : null;
}
