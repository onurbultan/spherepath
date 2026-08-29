import { createHmac, timingSafeEqual } from "node:crypto";
import type { WhatsAppGroupConfiguration } from "../../../packages/shared/src/index.js";

export interface WhatsAppGroupMessage {
  messageId: string;
  groupId: string;
  businessPhoneNumberId: string;
  text: string;
  occurredAt: number;
}

export interface WhatsAppGroupLifecycleEvent {
  businessPhoneNumberId: string;
  type: "group_create" | "group_delete";
  requestId: string | null;
  groupId: string | null;
  inviteLink: string | null;
  error: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function extractWhatsAppGroupMessages(payload: unknown): WhatsAppGroupMessage[] {
  const root = record(payload);
  if (root?.object !== "whatsapp_business_account") return [];
  const messages: WhatsAppGroupMessage[] = [];
  for (const entryValue of array(root.entry)) {
    const entry = record(entryValue);
    for (const changeValue of array(entry?.changes)) {
      const change = record(changeValue);
      if (change?.field !== "messages") continue;
      const value = record(change.value);
      const metadata = record(value?.metadata);
      const businessPhoneNumberId = typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : "";
      for (const messageValue of array(value?.messages)) {
        const message = record(messageValue);
        const text = record(message?.text);
        if (message?.type !== "text" || typeof message.id !== "string" || typeof message.group_id !== "string" || typeof text?.body !== "string") continue;
        const timestamp = typeof message.timestamp === "string" ? Number(message.timestamp) * 1_000 : Number.NaN;
        const body = text.body.replace(/\s+/gu, " ").trim().slice(0, 4_000);
        if (!body || !businessPhoneNumberId) continue;
        messages.push({
          messageId: message.id.slice(0, 500),
          groupId: message.group_id.slice(0, 500),
          businessPhoneNumberId: businessPhoneNumberId.slice(0, 64),
          text: body,
          occurredAt: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now(),
        });
      }
    }
  }
  return messages;
}

export function extractWhatsAppGroupLifecycleEvents(payload: unknown): WhatsAppGroupLifecycleEvent[] {
  const root = record(payload); if (root?.object !== "whatsapp_business_account") return [];
  const events: WhatsAppGroupLifecycleEvent[] = [];
  for (const entryValue of array(root.entry)) {
    const entry = record(entryValue);
    for (const changeValue of array(entry?.changes)) {
      const change = record(changeValue); if (change?.field !== "group_lifecycle_update") continue;
      const value = record(change.value); const metadata = record(value?.metadata);
      const businessPhoneNumberId = typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : "";
      if (!businessPhoneNumberId) continue;
      for (const groupValue of array(value?.groups)) {
        const group = record(groupValue); if (group?.type !== "group_create" && group?.type !== "group_delete") continue;
        const firstError = record(array(group.errors)[0]);
        events.push({
          businessPhoneNumberId,
          type: group.type,
          requestId: typeof group.request_id === "string" ? group.request_id : null,
          groupId: typeof group.group_id === "string" ? group.group_id : null,
          inviteLink: typeof group.invite_link === "string" ? group.invite_link : null,
          error: typeof firstError?.message === "string" ? firstError.message.slice(0, 500) : null,
        });
      }
    }
  }
  return events;
}

export function verifyMetaSignature(rawBody: Uint8Array, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"), "utf8");
  const received = Buffer.from(signatureHeader.slice("sha256=".length), "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function buildWhatsAppGroupCreateBody(configuration: WhatsAppGroupConfiguration) {
  return {
    messaging_product: "whatsapp" as const,
    subject: configuration.subject,
    description: configuration.description,
    join_approval_mode: configuration.joinApprovalMode,
  };
}
