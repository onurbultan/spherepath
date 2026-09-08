import { describe, expect, it } from "vitest";
import { contactNextStep, taskActionType } from "./next-step.js";
import { createContact } from "./contact-draft.js";

const contact = { ...createContact({ fullName: "Melis Şaşmaz", phone: "", metAtPlace: "", source: "in_person", role: "buyer" }, { officeId: "office", ownerUid: "advisor" }, 1), id: "melis" };
const opportunity = { id: "demand", subjectContactId: "melis", stage: "first_contact" as const, nextActionType: "appointment" as const, nextActionAt: 2_000 };
describe("contact next step", () => {
  it("shows an opportunity appointment without changing the independent reminder", () => {
    const original = JSON.stringify(contact);
    expect(contactNextStep(contact, [opportunity])).toMatchObject({ id: "opportunity-action-demand", type: "appointment", at: 2_000 });
    expect(JSON.stringify(contact)).toBe(original);
  });
  it("excludes closed work and other contacts", () => {
    expect(contactNextStep(contact, [{ ...opportunity, stage: "won" }, { ...opportunity, subjectContactId: "anil" }])).toBeNull();
  });
  it("keeps the earliest independent contact action", () => {
    expect(contactNextStep({ ...contact, relationship: { ...contact.relationship, nextActionType: "message", nextActionAt: 1_000 } }, [opportunity])?.type).toBe("message");
  });
  it("prefers the linked deal when equal dates represent the same appointment", () => {
    expect(contactNextStep(contact, [opportunity], [{ id: "deal", buyerContactId: "melis", stage: "offer", nextActionType: "appointment", nextActionAt: 2_000 }])?.dealId).toBe("deal");
  });
  it("keeps the existing action type when rescheduling old and new task payloads", () => {
    expect(taskActionType({ actionType: "appointment", reason: "Takip", type: "next_action" })).toBe("appointment");
    expect(taskActionType({ reason: "Randevu yap", type: "next_action" })).toBe("appointment");
  });
});
