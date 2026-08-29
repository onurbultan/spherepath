import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildWhatsAppGroupCreateBody, extractWhatsAppGroupLifecycleEvents, extractWhatsAppGroupMessages, verifyMetaSignature } from "./webhook-payload";

describe("WhatsApp group webhook", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "12784358810" },
      messages: [{ id: "wamid.1", group_id: "group-1", timestamp: "1788021000", type: "text", text: { body: " Urla'da   bahçeli ev var. " } }],
    } }] }],
  };

  it("extracts only supported group text messages", () => {
    expect(extractWhatsAppGroupMessages(payload)).toEqual([{
      messageId: "wamid.1",
      groupId: "group-1",
      businessPhoneNumberId: "12784358810",
      occurredAt: 1_788_021_000_000,
      text: "Urla'da bahçeli ev var.",
    }]);
    expect(extractWhatsAppGroupMessages({ object: "whatsapp_business_account", entry: [] })).toEqual([]);
  });

  it("verifies the exact raw request body", () => {
    const raw = Buffer.from(JSON.stringify(payload));
    const signature = `sha256=${createHmac("sha256", "secret").update(raw).digest("hex")}`;
    expect(verifyMetaSignature(raw, signature, "secret")).toBe(true);
    expect(verifyMetaSignature(raw, signature, "wrong-secret")).toBe(false);
  });

  it("extracts asynchronous group creation results", () => {
    expect(extractWhatsAppGroupLifecycleEvents({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "group_lifecycle_update", value: { metadata: { phone_number_id: "12784358810" }, groups: [{ type: "group_create", request_id: "request-1", group_id: "group-1", invite_link: "https://chat.whatsapp.com/example" }] } }] }] })).toEqual([{
      businessPhoneNumberId: "12784358810", type: "group_create", requestId: "request-1", groupId: "group-1", inviteLink: "https://chat.whatsapp.com/example", error: null,
    }]);
  });

  it("builds the Meta group creation request without client-only fields", () => {
    expect(buildWhatsAppGroupCreateBody({ businessPhoneNumberId: "12784358810", subject: "Spherepath Ofis Havuzu", description: "Portföy ve talep notları", joinApprovalMode: "approval_required" })).toEqual({
      messaging_product: "whatsapp", subject: "Spherepath Ofis Havuzu", description: "Portföy ve talep notları", join_approval_mode: "approval_required",
    });
  });
});
