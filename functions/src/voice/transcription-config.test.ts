import { describe, expect, it } from "vitest";
import {
  emergencySpeechTarget,
  fallbackSpeechTarget,
  primarySpeechTarget,
  separateChannelRecognition,
  syncRecognitionLimitMs,
} from "./transcription-config.js";

describe("voice transcription configuration", () => {
  it("uses the EU multi-region endpoint and recognizer for Chirp 3", () => {
    expect(primarySpeechTarget).toEqual({
      model: "chirp_3",
      location: "eu",
      apiEndpoint: "eu-speech.googleapis.com",
    });
  });

  it("keeps a known-compatible global long-model fallback", () => {
    expect(fallbackSpeechTarget).toEqual({
      model: "long",
      location: "global",
      apiEndpoint: "speech.googleapis.com",
    });
    expect(emergencySpeechTarget).toEqual({
      model: "short",
      location: "global",
      apiEndpoint: "speech.googleapis.com",
    });
  });

  it("keeps the synchronous limit under the minute the recognize call accepts", () => {
    expect(syncRecognitionLimitMs).toBeLessThan(60_000);
  });

  it("leaves per-channel recognition off until recordings actually arrive in stereo", () => {
    expect(separateChannelRecognition).toBe(false);
  });
});
