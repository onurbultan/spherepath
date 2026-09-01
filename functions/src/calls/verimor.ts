import { logger } from "firebase-functions";
import type { CallDirection, CallEventType } from "../../../packages/shared/src/index";
import {
  parseProviderBoolean,
  parseProviderDurationMs,
  parseProviderInstant,
  parseProviderNumber,
  type CallRecordingSource,
  type FetchedRecording,
  type ParsedCallEvent,
} from "./provider.js";

const apiBase = "https://api.bulutsantralim.com";
const recordingUrlEndpoint = `${apiBase}/recording_url/`;
const originateEndpoint = `${apiBase}/originate`;
/** The switch caps ring time at a minute; long enough for an advisor to reach the handset. */
const originateTimeoutSeconds = 45;

/**
 * `user_hangup` is the extension dropping its own leg; both it and `hangup`
 * mean the conversation is over, which is the only moment we act on.
 */
const eventTypes: Record<string, CallEventType> = {
  ringing: "ringing",
  answer: "answer",
  hangup: "hangup",
  user_hangup: "hangup",
};

const directions: Record<string, CallDirection> = {
  inbound: "inbound",
  outbound: "outbound",
  internal: "internal",
};

export function parseVerimorEvent(body: Record<string, unknown>): ParsedCallEvent | null {
  const providerCallId = parseProviderNumber(body.call_uuid);
  const eventType = eventTypes[String(body.event_type ?? "").trim().toLowerCase()];
  if (!providerCallId || !eventType) return null;

  const startedAt = parseProviderInstant(body.start_stamp);
  const answeredAt = parseProviderInstant(body.answer_stamp);
  const endedAt = parseProviderInstant(body.end_stamp);
  // `answered` is the switch's own verdict; an answer stamp is corroboration for
  // payloads that omit the flag.
  const answered = parseProviderBoolean(body.answered) || answeredAt !== null;
  const durationMs = parseProviderDurationMs(body.duration);

  return {
    providerCallId,
    eventType,
    direction: directions[String(body.direction ?? "").trim().toLowerCase()] ?? "inbound",
    fromNumber: parseProviderNumber(body.caller_id_number),
    toNumber: parseProviderNumber(body.destination_number),
    // `connected_user` is the extension that took the call; `dialed_user` is the
    // one it rang for, which is all a missed call leaves behind.
    extension: parseProviderNumber(body.connected_user) ?? parseProviderNumber(body.dialed_user),
    answered,
    startedAt,
    answeredAt,
    endedAt,
    durationMs,
    talkDurationMs: answeredAt !== null && endedAt !== null && endedAt > answeredAt
      ? endedAt - answeredAt
      : answered ? durationMs : 0,
    queueWaitMs: parseProviderDurationMs(body.queue_wait_duration),
    recordingPresent: parseProviderBoolean(body.recording_present),
    hangupCause: parseProviderNumber(body.hangup_cause) ?? parseProviderNumber(body.failure_phrase),
  };
}

/**
 * Fetching is two calls: the switch mints a link that lives an hour, then the
 * audio is downloaded from it. The link is never persisted, because it expires
 * long before anyone would reuse it.
 */
export function createVerimorSource(apiKey: () => string): CallRecordingSource {
  return {
    provider: "verimor",
    parseEvent: parseVerimorEvent,
    async fetchRecording(providerCallId: string): Promise<FetchedRecording | null> {
      const key = apiKey();
      if (!key) throw new Error("verimor_api_key_missing");
      const urlResponse = await fetch(recordingUrlEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ key, call_uuid: providerCallId }),
      });
      if (urlResponse.status === 404) return null;
      if (!urlResponse.ok) throw new Error(`verimor_recording_url_failed_${urlResponse.status}`);
      const mediaUrl = (await urlResponse.text()).trim();
      if (!/^https:\/\//u.test(mediaUrl)) throw new Error("verimor_recording_url_invalid");

      const media = await fetch(mediaUrl);
      if (!media.ok) throw new Error(`verimor_recording_download_failed_${media.status}`);
      const contentType = media.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "audio/wav";
      const bytes = Buffer.from(await media.arrayBuffer());
      if (!bytes.length) throw new Error("verimor_recording_empty");
      logger.info("Call recording downloaded", { providerCallId, contentType, byteLength: bytes.length });
      return {
        bytes,
        contentType,
        extension: contentType.includes("mpeg") || contentType.includes("mp3") ? "mp3" : "wav",
      };
    },
    async startCall(request): Promise<string> {
      const key = apiKey();
      if (!key) throw new Error("verimor_api_key_missing");
      const query = new URLSearchParams({
        key,
        extension: request.extension,
        destination: request.destination,
        timeout: String(originateTimeoutSeconds),
      });
      if (request.callerId) query.set("caller_id", request.callerId);
      // Played to the customer once they pick up, which is where the recording
      // notice belongs.
      if (request.announcementId !== null) query.set("announcement_to_callee", String(request.announcementId));

      const response = await fetch(`${originateEndpoint}?${query.toString()}`);
      if (!response.ok) throw new Error(`verimor_originate_failed_${response.status}`);
      const providerCallId = (await response.text()).trim();
      if (!providerCallId) throw new Error("verimor_originate_no_call_id");
      return providerCallId;
    },
  };
}
