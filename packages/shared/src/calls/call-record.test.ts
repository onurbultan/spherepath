import { describe, expect, it } from "vitest";
import { toDialableNumber } from "./call-record.js";

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
