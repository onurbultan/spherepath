import { describe, expect, it } from "vitest";
import { contactDraftSchema, createContact } from "./contact-draft.js";

describe("contact draft", () => {
  it("normalizes optional text and applies privacy-safe defaults", () => {
    const contact = createContact(
      { fullName: "  Ayşe Kaya ", phone: "", metAtPlace: "", source: "referral", role: "seller" },
      { officeId: "office-a", ownerUid: "alice" },
      1_725_000_000_000,
    );

    expect(contact.fullName).toBe("Ayşe Kaya");
    expect(contact.phone).toBeNull();
    expect(contact.roles).toEqual(["seller"]);
    expect(contact.relationship.stage).toBe("new");
    expect(contact.privacy.marketingConsent).toBe("unknown");
  });

  it("rejects an unusable identifier", () => {
    expect(() => contactDraftSchema.parse({
      fullName: "A",
      phone: "",
      metAtPlace: "",
      source: "other",
      role: "unknown",
    })).toThrow();
  });
});
