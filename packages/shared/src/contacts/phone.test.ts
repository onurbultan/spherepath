import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone.js";

describe("normalizePhone", () => {
  it("collapses every way an advisor types a Turkish mobile number", () => {
    for (const raw of [
      "0532 123 45 67",
      "05321234567",
      "532 123 45 67",
      "5321234567",
      "+90 532 123 45 67",
      "+905321234567",
      "0090 532 123 45 67",
      "905321234567",
      "(0532) 123-45-67",
    ]) {
      expect(normalizePhone(raw), raw).toBe("+905321234567");
    }
  });

  it("keeps geographic and corporate numbers", () => {
    expect(normalizePhone("0232 123 45 67")).toBe("+902321234567");
    expect(normalizePhone("+90 850 123 45 67")).toBe("+908501234567");
  });

  it("keeps a foreign number that was dialled with a country code", () => {
    expect(normalizePhone("+1 555 123 4567")).toBe("+15551234567");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects a number that claims to be Turkish but is the wrong length", () => {
    expect(normalizePhone("+9053212345")).toBeNull();
    expect(normalizePhone("+90 532 123 45 67 89")).toBeNull();
  });

  it("rejects malformed and empty input", () => {
    expect(normalizePhone("0532123456")).toBeNull();
    expect(normalizePhone("0032 123 45 67")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("telefon yok")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("is stable, so a saved contact and an inbound caller resolve to one value", () => {
    expect(normalizePhone("0532 123 45 67")).toBe(normalizePhone("+905321234567"));
  });
});
