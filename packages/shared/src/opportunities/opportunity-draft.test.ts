import { describe, expect, it } from "vitest";
import { createOpportunity, opportunityDraftSchema } from "./opportunity-draft.js";

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
});
