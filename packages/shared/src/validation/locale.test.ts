import { describe, expect, it } from "vitest";
import { z } from "zod";
import "./locale.js";

describe("validation messages", () => {
  it("speaks Turkish, because these strings reach the advisor", () => {
    const result = z.number().positive().safeParse(0);
    expect(result.success).toBe(false);
    // The exact wording is Zod's; what matters is that it is not English.
    expect(result.error!.issues[0]!.message).not.toMatch(/Too small|expected|Invalid/u);
  });
});
