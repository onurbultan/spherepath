import { describe, expect, it } from "vitest";
import { assertOpportunityTransition, canTransitionOpportunity } from "./transitions";
import { opportunityStageCorrectionSchema, opportunityTransitionSchema } from "./transitions.schema";

describe("opportunity transitions", () => {
  it("allows the observable forward path", () => {
    expect(canTransitionOpportunity("new_lead", "first_contact")).toBe(true);
    expect(canTransitionOpportunity("mandate_offer", "won")).toBe(true);
  });

  it("blocks skipping stages", () => {
    expect(() => assertOpportunityTransition("new_lead", "won")).toThrow(
      "Invalid opportunity transition",
    );
  });

  it("requires a loss reason", () => {
    const result = opportunityTransitionSchema.safeParse({
      opportunityId: "opportunity-1",
      toStage: "lost",
      reason: null,
      lostReason: null,
      nextActionType: null,
      nextActionAt: null,
    });

    expect(result.success).toBe(false);
  });

  it("requires the next action for an active stage", () => {
    expect(opportunityTransitionSchema.safeParse({
      opportunityId: "opportunity-1",
      toStage: "first_contact",
      reason: null,
      lostReason: null,
      nextActionType: null,
      nextActionAt: null,
    }).success).toBe(false);
  });
});

describe("opportunity stage correction", () => {
  it("requires an audit reason and a next action for an open stage", () => {
    expect(opportunityStageCorrectionSchema.safeParse({ opportunityId: "o", toStage: "appointment", reason: "", lostReason: null, nextActionType: null, nextActionAt: null }).success).toBe(false);
    expect(opportunityStageCorrectionSchema.safeParse({ opportunityId: "o", toStage: "appointment", reason: "Yanlışlıkla ilerletildi", lostReason: null, nextActionType: "call", nextActionAt: Date.now() + 1_000 }).success).toBe(true);
  });
});
