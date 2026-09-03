import { describe, expect, it } from "vitest";
import { createContact } from "../../../packages/shared/src/index";
import { toStoredContact } from "./contact-store.js";

const tenant = { officeId: "o1", ownerUid: "u1" };

describe("storing a contact", () => {
  it("derives the lookup key the switch matches an incoming caller on", () => {
    const stored = toStoredContact(createContact(
      { fullName: "Elif Doğan", phone: "0533 214 65 08", metAtPlace: "Akış notu", source: "other", role: "unknown" },
      tenant, Date.now(),
    ));
    expect(stored.phoneHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("leaves it null when there is no number to key on", () => {
    const stored = toStoredContact(createContact(
      { fullName: "Elif Doğan", phone: "", metAtPlace: "Akış notu", source: "other", role: "unknown" },
      tenant, Date.now(),
    ));
    expect(stored.phoneHash).toBeNull();
  });
});
