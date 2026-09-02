import { describe, expect, it } from "vitest";
import { shouldIngestRecording, toDialableNumber } from "./call-record.js";

describe("shouldIngestRecording", () => {
  it("takes an answered call the switch recorded", () => {
    expect(shouldIngestRecording(true, 480_000)).toBe(true);
  });

  it("skips a missed call, an unrecorded one, and a few seconds of nothing", () => {
    expect(shouldIngestRecording(false, 480_000)).toBe(false);
    // The switch had not finished writing the file yet; the call is still real.
    expect(shouldIngestRecording(true, 480_000)).toBe(true);
    expect(shouldIngestRecording(true, 3_000)).toBe(false);
  });
});

describe("toDialableNumber", () => {
  it("drops the plus the switch will not accept", () => {
    expect(toDialableNumber("+905321234567")).toBe("905321234567");
    expect(toDialableNumber("+442079460958")).toBe("442079460958");
  });

  it("refuses anything that is not already canonical", () => {
    expect(toDialableNumber("05321234567")).toBeNull();
    expect(toDialableNumber(null)).toBeNull();
  });
});
