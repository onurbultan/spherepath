import { afterEach, describe, expect, it, vi } from "vitest";
import { createVerimorSource, parseVerimorEvent } from "./verimor.js";
import { parseProviderDurationMs, parseProviderInstant } from "./provider.js";

const hangup = {
  event_type: "hangup",
  call_uuid: "651f8a68-782e-11e7-a6b6-5bedc26e2ab3",
  direction: "inbound",
  caller_id_number: "05321234567",
  destination_number: "1001",
  dialed_user: "1001",
  connected_user: "1023",
  start_stamp: "2026-09-01T14:03:11+03:00",
  answer_stamp: "2026-09-01T14:03:19+03:00",
  end_stamp: "2026-09-01T14:11:47+03:00",
  answered: "true",
  duration: "516",
  queue_wait_duration: "12",
  recording_present: "true",
  hangup_cause: "NORMAL_CLEARING",
};

afterEach(() => vi.unstubAllGlobals());

describe("parseVerimorEvent", () => {
  it("reads a completed inbound call", () => {
    const event = parseVerimorEvent(hangup)!;
    expect(event.providerCallId).toBe("651f8a68-782e-11e7-a6b6-5bedc26e2ab3");
    expect(event.eventType).toBe("hangup");
    expect(event.direction).toBe("inbound");
    expect(event.fromNumber).toBe("05321234567");
    expect(event.answered).toBe(true);
    // Talk time runs from answer to hangup, not from the first ring.
    expect(event.talkDurationMs).toBe(508_000);
    expect(event.durationMs).toBe(516_000);
    expect(event.queueWaitMs).toBe(12_000);
    expect(event.hangupCause).toBe("NORMAL_CLEARING");
  });

  it("attributes the call to the extension that took it, not the one it rang", () => {
    expect(parseVerimorEvent(hangup)?.extension).toBe("1023");
    // A missed call never connects, so only the extension it rang is left.
    expect(parseVerimorEvent({ ...hangup, connected_user: "" })?.extension).toBe("1001");
  });

  it("treats an extension dropping its own leg as a hangup", () => {
    expect(parseVerimorEvent({ ...hangup, event_type: "user_hangup" })?.eventType).toBe("hangup");
  });

  it("keeps a missed call but gives it no talk time", () => {
    const event = parseVerimorEvent({
      ...hangup,
      answered: "false",
      answer_stamp: "",
      duration: "0",
      recording_present: "false",
    })!;
    expect(event.answered).toBe(false);
    expect(event.talkDurationMs).toBe(0);
  });

  it("falls back to the reported duration when no answer stamp arrives", () => {
    const event = parseVerimorEvent({ ...hangup, answer_stamp: "" })!;
    expect(event.talkDurationMs).toBe(516_000);
  });

  it("rejects a payload with no call id or no known event", () => {
    expect(parseVerimorEvent({ ...hangup, call_uuid: "" })).toBeNull();
    expect(parseVerimorEvent({ ...hangup, event_type: "park" })).toBeNull();
  });
});

describe("provider value parsing", () => {
  it("reads the stamp formats a switch might send", () => {
    expect(parseProviderInstant("2026-09-01T14:03:11+03:00")).toBe(Date.parse("2026-09-01T14:03:11+03:00"));
    // A zone-less stamp is the switch's own wall clock, not the server's. Pinning
    // it to a real instant is the point: comparing against another zone-less
    // parse would agree with itself in any zone and could never fail.
    expect(parseProviderInstant("2026-09-01 14:03:11")).toBe(Date.parse("2026-09-01T14:03:11+03:00"));
    expect(parseProviderInstant("2026-09-01 14:03:11 +0300")).toBe(Date.parse("2026-09-01T14:03:11+03:00"));
    expect(parseProviderInstant("2026-09-01 14:03:11 +0000")).toBe(Date.parse("2026-09-01T14:03:11Z"));
    expect(parseProviderInstant("1788268866")).toBe(1_788_268_866_000);
    expect(parseProviderInstant(1_788_268_866_000)).toBe(1_788_268_866_000);
    expect(parseProviderInstant("")).toBeNull();
    expect(parseProviderInstant("0")).toBeNull();
  });

  it("reads seconds as seconds without inflating an already-millisecond value", () => {
    expect(parseProviderDurationMs("516")).toBe(516_000);
    expect(parseProviderDurationMs(516_000)).toBe(516_000);
    expect(parseProviderDurationMs("")).toBe(0);
  });
});

describe("outbound call privacy", () => {
  it("explicitly disables provider recording", async () => {
    const fetchMock = vi.fn(async () => new Response("provider-call-1", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createVerimorSource(() => "secret").startCall({
      source: "905551112233",
      destination: "905559998877",
      callerId: null,
    });

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(new URL(requestedUrl).searchParams.get("recording_enabled")).toBe("false");
    expect(requestedUrl).not.toContain("announcement");
  });
});
