import { describe, expect, it } from "vitest";
import { parseWhatsAppGroupConfigurationRecord, whatsappGroupConfigurationSchema } from "./whatsapp-group";

describe("whatsappGroupConfigurationSchema", () => {
  it("accepts a Meta Groups API configuration", () => {
    expect(whatsappGroupConfigurationSchema.parse({
      businessPhoneNumberId: "12784358810",
      subject: "Spherepath Ofis Havuzu",
      description: "Portföy ve talep notları",
      joinApprovalMode: "approval_required",
    }).subject).toBe("Spherepath Ofis Havuzu");
  });

  it("enforces Meta subject and phone identifier limits", () => {
    expect(whatsappGroupConfigurationSchema.safeParse({ businessPhoneNumberId: "abc", subject: "A", description: "", joinApprovalMode: "auto_approve" }).success).toBe(false);
    expect(whatsappGroupConfigurationSchema.safeParse({ businessPhoneNumberId: "12345", subject: "x".repeat(129), description: "", joinApprovalMode: "auto_approve" }).success).toBe(false);
  });

  it("reads configuration from a tenant-owned persistence record", () => {
    const parsed = parseWhatsAppGroupConfigurationRecord({
      officeId: "office-1",
      ownerUid: "owner-1",
      status: "configured",
      businessPhoneNumberId: "12784358810",
      subject: "Spherepath Ofis Havuzu",
      description: "Portföy ve talep notları",
      joinApprovalMode: "approval_required",
      updatedAt: 123,
    });

    expect(parsed.success).toBe(true);
  });
});
