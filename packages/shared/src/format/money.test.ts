import { describe, expect, it } from "vitest";
import { formatMoneyAsTyped, moneyInputValue, parseMoneyInput } from "./money.js";

describe("formatMoneyAsTyped", () => {
  it("groups a price as it is typed", () => {
    expect(formatMoneyAsTyped("5")).toBe("5");
    expect(formatMoneyAsTyped("5500")).toBe("5.500");
    expect(formatMoneyAsTyped("5500000")).toBe("5.500.000");
    expect(formatMoneyAsTyped("55000000")).toBe("55.000.000");
  });

  it("ignores separators the advisor typed and re-groups from the digits", () => {
    expect(formatMoneyAsTyped("5.500.000")).toBe("5.500.000");
    expect(formatMoneyAsTyped("5 500 000 TL")).toBe("5.500.000");
  });

  it("drops leading zeroes so a mistyped price does not read as an octal", () => {
    expect(formatMoneyAsTyped("0005500")).toBe("5.500");
    expect(formatMoneyAsTyped("0")).toBe("0");
  });

  it("returns nothing for an empty or non-numeric field", () => {
    expect(formatMoneyAsTyped("")).toBe("");
    expect(formatMoneyAsTyped("abc")).toBe("");
  });
});

describe("parseMoneyInput", () => {
  it("reads the grouped field back to a number", () => {
    expect(parseMoneyInput("5.500.000")).toBe(5_500_000);
    expect(parseMoneyInput("5500000")).toBe(5_500_000);
  });

  it("treats only an empty field as nothing, because zero commission is a real answer", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("0")).toBe(0);
  });

  it("round-trips a stored amount", () => {
    expect(parseMoneyInput(moneyInputValue(12_750_000))).toBe(12_750_000);
    expect(moneyInputValue(null)).toBe("");
  });
});
