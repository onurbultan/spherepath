import { describe, expect, it } from "vitest";
import { createOpportunity, opportunityDraftSchema, opportunityPath, opportunityStageLabel, suggestOpportunityTypeForRoles } from "./opportunity-draft.js";
import { opportunityCriteriaSummary, opportunityCriteriaUpdateSchema, opportunityTransactionType } from "./opportunity-situation.js";
import { emptyVoicePropertyPreferences } from "../voice/voice-note.js";

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

  it("keeps owner and customer journeys explicit", () => {
    expect(opportunityPath("seller_listing").map((step) => step.label)).toContain("Yeni portföy adayı");
    expect(opportunityPath("buyer_requirement").map((step) => step.label)).toContain("İhtiyaç görüşmesi");
    expect(opportunityPath("buyer_requirement").map((step) => step.label)).not.toContain("Yetki alındı");
  });

  it("suggests the journey from the selected contact role", () => {
    expect(suggestOpportunityTypeForRoles(["buyer"])).toBe("buyer_requirement");
    expect(suggestOpportunityTypeForRoles(["investor"])).toBe("buyer_requirement");
    expect(suggestOpportunityTypeForRoles(["tenant"])).toBe("tenant_requirement");
    expect(suggestOpportunityTypeForRoles(["seller"])).toBe("seller_listing");
    expect(suggestOpportunityTypeForRoles(["landlord"])).toBe("landlord_listing");
    expect(suggestOpportunityTypeForRoles(["unknown"])).toBeNull();
  });

  it("validates editable criteria and keeps the opportunity purpose authoritative", () => {
    const preferences = { ...emptyVoicePropertyPreferences, preferredLocations: ["Karşıyaka"], bedroomCountMin: 2, livingRoomCountMin: 1 };
    expect(opportunityCriteriaUpdateSchema.safeParse({ opportunityId: "opportunity-1", preferences }).success).toBe(true);
    expect(opportunityTransactionType("tenant_requirement")).toBe("rent");
    expect(opportunityCriteriaSummary("tenant_requirement", preferences)).toBe("Karşıyaka · 2+1 · kiralama talebi");
  });
});
