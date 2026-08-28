import { describe, expect, it } from "vitest";
import { assertOpportunityTransition, canTransitionOpportunity } from "./transitions";
import { opportunityTransitionCommandSchema } from "./transitions.schema";

describe("opportunity transitions", () => {
  it("allows the observable forward path", () => {
    expect(canTransitionOpportunity("yeni_lead", "ilk_temas")).toBe(true);
    expect(canTransitionOpportunity("teklif_yetki", "kazanildi")).toBe(true);
  });

  it("blocks skipping stages", () => {
    expect(() => assertOpportunityTransition("yeni_lead", "kazanildi")).toThrow(
      "Invalid opportunity transition",
    );
  });

  it("requires a loss reason", () => {
    const result = opportunityTransitionCommandSchema.safeParse({
      opportunityId: "opportunity-1",
      commandId: "9cc4e9a1-d3ee-49f6-b9f8-c6a94ad47f31",
      toStage: "kayip",
      reason: null,
      lostReason: null,
    });

    expect(result.success).toBe(false);
  });
});
