import { describe, expect, it } from "vitest";
import { createReferral, referralDraftSchema } from "./referral-draft.js";

describe("referral draft", () => {
  it("keeps source and referred contacts distinct", () => {
    expect(referralDraftSchema.safeParse({ sourceContactId: "a", referredContactId: "a", referredLabel: null }).success).toBe(false);
  });
  it("supports a label-only pending referral", () => {
    const referral = createReferral({ sourceContactId: "a", referredContactId: null, referredLabel: "Komşusunun arkadaşı" }, { officeId: "o", ownerUid: "u" }, 1);
    expect(referral.status).toBe("first_contact_pending");
  });
});
