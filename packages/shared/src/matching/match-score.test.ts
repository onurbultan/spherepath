import { describe, expect, it } from "vitest";
import { formatMatchScore, matchScoreSchema } from "./portfolio-match.js";

describe("match score contract", () => {
  it("formats the shared 0–100 score without scaling it twice", () => {
    expect(formatMatchScore(76)).toBe("%76");
  });

  it("rejects ratios and values outside the wire contract", () => {
    expect(matchScoreSchema.safeParse(0.76).success).toBe(false);
    expect(matchScoreSchema.safeParse(101).success).toBe(false);
  });
});
