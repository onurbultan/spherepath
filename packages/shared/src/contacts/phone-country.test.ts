import { describe, expect, it } from "vitest";
import { formatNationalAsTyped, joinPhone, phoneCountryFlag, splitPhone } from "./phone-country.js";
import { normalizePhone } from "./phone.js";

describe("formatNationalAsTyped", () => {
  it("groups a Turkish subscriber number without its trunk zero", () => {
    expect(formatNationalAsTyped("5078727022", "90")).toBe("507 872 70 22");
    expect(formatNationalAsTyped("05078727022", "90")).toBe("507 872 70 22");
  });

  it("keeps a half-typed number readable", () => {
    expect(formatNationalAsTyped("507", "90")).toBe("507");
    expect(formatNationalAsTyped("50787", "90")).toBe("507 87");
  });

  it("falls back to threes where the national format is not known", () => {
    expect(formatNationalAsTyped("17612345678", "49")).toBe("176 123 456 78");
  });
});

describe("joinPhone and splitPhone", () => {
  it("round-trips a Turkish number", () => {
    const stored = joinPhone("90", "5078727022");
    expect(stored).toBe("+90 507 872 70 22");
    expect(splitPhone(stored)).toEqual({ dialCode: "90", national: "507 872 70 22" });
  });

  it("stores nothing when the number half is empty", () => {
    expect(joinPhone("90", "")).toBe("");
    expect(splitPhone("")).toEqual({ dialCode: "90", national: "" });
  });

  it("reads a foreign number back to its own country", () => {
    expect(splitPhone("+49 176 123 456 78")).toEqual({ dialCode: "49", national: "176 123 456 78" });
  });

  it("lands a number saved before the field was split on Türkiye", () => {
    expect(splitPhone("0532 123 45 67")).toEqual({ dialCode: "90", national: "532 123 45 67" });
    expect(splitPhone("05321234567")).toEqual({ dialCode: "90", national: "532 123 45 67" });
  });

  it("stays compatible with the canonical value the switch matches on", () => {
    expect(normalizePhone(joinPhone("90", "5078727022"))).toBe("+905078727022");
    expect(normalizePhone(joinPhone("49", "17612345678"))).toBe("+4917612345678");
  });
});

describe("phoneCountryFlag", () => {
  it("derives a flag from the country code", () => {
    expect(phoneCountryFlag("TR")).toBe("🇹🇷");
    expect(phoneCountryFlag("de")).toBe("🇩🇪");
  });
});
