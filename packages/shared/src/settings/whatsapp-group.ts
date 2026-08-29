import { z } from "zod";

export const whatsappGroupStatuses = ["not_configured", "configured", "creating", "active", "error"] as const;
export type WhatsAppGroupStatus = (typeof whatsappGroupStatuses)[number];

export const whatsappGroupConfigurationSchema = z.object({
  businessPhoneNumberId: z.string().trim().regex(/^\d{5,32}$/u, "Meta işletme telefon numarası kimliği geçersiz."),
  subject: z.string().trim().min(2, "Grup adı en az 2 karakter olmalı.").max(128),
  description: z.string().trim().max(2_048),
  joinApprovalMode: z.enum(["approval_required", "auto_approve"]),
}).strict();

export type WhatsAppGroupConfiguration = z.infer<typeof whatsappGroupConfigurationSchema>;

export function parseWhatsAppGroupConfigurationRecord(record: Record<string, unknown>) {
  return whatsappGroupConfigurationSchema.safeParse({
    businessPhoneNumberId: record.businessPhoneNumberId,
    subject: record.subject,
    description: record.description,
    joinApprovalMode: record.joinApprovalMode,
  });
}

export interface WhatsAppGroupIntegrationView extends WhatsAppGroupConfiguration {
  officeId: string;
  webhookUrl: string;
  status: WhatsAppGroupStatus;
  groupId: string | null;
  inviteLink: string | null;
  lastMessageAt: number | null;
  lastError: string | null;
  updatedAt: number | null;
}

export const emptyWhatsAppGroupIntegration = (officeId: string): WhatsAppGroupIntegrationView => ({
  officeId,
  webhookUrl: "",
  businessPhoneNumberId: "",
  subject: "Spherepath Ofis Havuzu",
  description: "Ofis içi portföy ve talep notları",
  joinApprovalMode: "approval_required",
  status: "not_configured",
  groupId: null,
  inviteLink: null,
  lastMessageAt: null,
  lastError: null,
  updatedAt: null,
});
