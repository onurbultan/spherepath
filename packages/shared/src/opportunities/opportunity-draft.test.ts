import { describe, expect, it } from "vitest";
import { createOpportunity, opportunityDraftSchema, opportunityStageLabel } from "./opportunity-draft.js";

describe("opportunity draft", () => {
  it("creates a new lead with a required next action", () => {
    const opportunity = createOpportunity({
      subjectContactId: "contact-1",
      type: "seller_listing",
      nextActionType: "call",
      nextActionAt: 2_000,
    }, { officeId: "office-1", ownerUid: "user-1" }, 1_000);
    expect(opportunity).toMatchObject({ stage: "new_lead", qualifiedAt: 1_000, nextActionType: "call", nextActionAt: 2_000 });
  });

  it("rejects a lead without its next action", () => {
    expect(opportunityDraftSchema.safeParse({ subjectContactId: "contact-1", type: "seller_listing" }).success).toBe(false);
  });

  it("uses client language for buyer and tenant outcomes", () => {
    expect(opportunityStageLabel("won", "buyer_requirement")).toBe("Müşteri kazanıldı");
    expect(opportunityStageLabel("mandate_offer", "tenant_requirement")).toBe("Hizmet konuşuluyor");
    expect(opportunityStageLabel("won", "seller_listing")).toBe("Yetki alındı");
  });
});
