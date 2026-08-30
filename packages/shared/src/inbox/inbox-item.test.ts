import { describe, expect, it } from "vitest";
import { classifyInboxText, maskSensitiveInboxText, processInboxItemSchema, updateInboxItemSchema } from "./inbox-item";

describe("inbox classification", () => {
  it("suggests a requirement and detects a location", () => {
    const result = classifyInboxText("Urla'da bahçeli ev arıyor. Bütçe 12 milyon.");
    expect(result.kind).toBe("requirement");
    expect(result.needsLocation).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.92);
  });

  it("asks for location on a property note without one", () => {
    const result = classifyInboxText("Satılık üç artı bir bahçeli ev duydum.");
    expect(result.kind).toBe("property");
    expect(result.needsLocation).toBe(true);
  });

  it("masks a complete sensitive sentence", () => {
    const result = maskSensitiveInboxText("Bahçeli ev arıyor. Sağlık sorunu var. Haftaya ara.");
    expect(result.masked).toBe(true);
    expect(result.text).not.toContain("Sağlık sorunu");
  });

  it("only treats an explicit name and phone pair as an auto-creatable person", () => {
    expect(classifyInboxText("Kişi: Derya Kaya Telefon: +90 532 111 22 33").explicitContact).toEqual({ fullName: "Derya Kaya", phone: "+905321112233" });
    expect(classifyInboxText("Derya ile tanıştım").explicitContact).toBeNull();
  });

  it("allows the advisor to edit and link a note", () => {
    expect(updateInboxItemSchema.parse({ inboxItemId: "note-1", text: "Düzeltilmiş not", linkedContactId: "contact-1" })).toMatchObject({ text: "Düzeltilmiş not", linkedContactId: "contact-1" });
  });

  it("validates a requirement conversion as one trusted command", () => {
    expect(processInboxItemSchema.parse({ inboxItemId: "note-1", action: "requirement", contactId: "contact-1", opportunityType: "buyer_requirement", nextActionType: "call", nextActionAt: Date.now() + 86_400_000 }).action).toBe("requirement");
    expect(processInboxItemSchema.safeParse({ inboxItemId: "note-1", action: "requirement", contactId: "contact-1", opportunityType: "seller_listing", nextActionType: "call", nextActionAt: Date.now() + 86_400_000 }).success).toBe(false);
  });
});
