import { describe, expect, it } from "vitest";
import { contactDraftSchema, createContact, mergeContactRoles } from "./contact-draft.js";

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

  it("stores the internal label separately from the customer name", () => {
    const contact = createContact(
      { fullName: "Ayşe Kaya", internalLabel: "Marina açık ev", phone: "", metAtPlace: "", source: "in_person", role: "buyer" },
      { officeId: "office-a", ownerUid: "alice" },
      1_725_000_000_000,
    );
    expect(contact.fullName).toBe("Ayşe Kaya");
    expect(contact.internalLabel).toBe("Marina açık ev");
    expect(contact.label).toBeNull();
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

  it("can put a first follow-up directly on a new contact", () => {
    const nextActionAt = 1_725_086_400_000;
    const contact = createContact({ fullName: "Ayşe Kaya", phone: "", metAtPlace: "", source: "referral", role: "buyer", nextActionType: "call", nextActionAt }, { officeId: "office-a", ownerUid: "alice" }, 1_725_000_000_000);
    expect(contact.relationship).toMatchObject({ nextActionType: "call", nextActionAt });
  });

  it("does not accept a first action without its time", () => {
    expect(contactDraftSchema.safeParse({ fullName: "Ayşe Kaya", phone: "", metAtPlace: "", source: "referral", role: "buyer", nextActionType: "call", nextActionAt: null }).success).toBe(false);
  });
});

describe("merging a role into a contact", () => {
  it("keeps the roles work has already established", () => {
    expect(mergeContactRoles(["seller", "landlord"], "buyer")).toEqual(["buyer", "seller", "landlord"]);
  });

  it("leads with the chosen role so the form shows what was just picked", () => {
    expect(mergeContactRoles(["buyer", "seller"], "seller")).toEqual(["seller", "buyer"]);
  });

  it("drops the placeholder once a real role is known", () => {
    expect(mergeContactRoles(["unknown"], "investor")).toEqual(["investor"]);
  });

  it("keeps real roles when the form still reads unknown", () => {
    expect(mergeContactRoles(["buyer"], "unknown")).toEqual(["buyer"]);
  });

  it("falls back to the placeholder when nothing else is known", () => {
    expect(mergeContactRoles([], "unknown")).toEqual(["unknown"]);
  });
});
