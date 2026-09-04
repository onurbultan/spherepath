import { z } from "zod";
import { contactDraftSchema } from "../contacts/contact-draft.js";

export const dataSubjectRequestTypes = ["access", "correction", "deletion", "profiling_objection"] as const;
export type DataSubjectRequestType = (typeof dataSubjectRequestTypes)[number];
export const dataSubjectRequestStatuses = ["pending_verification", "approved", "processing", "completed", "rejected", "failed"] as const;
export type DataSubjectRequestStatus = (typeof dataSubjectRequestStatuses)[number];

export const dataSubjectRequestStatusLabels: Record<DataSubjectRequestStatus, string> = {
  pending_verification: "Kimlik doğrulaması bekliyor",
  approved: "Onaylandı",
  processing: "İşleniyor",
  completed: "Tamamlandı",
  rejected: "Reddedildi",
  failed: "İşlem başarısız",
};

export const dataSubjectRequestTypeLabels: Record<DataSubjectRequestType, string> = {
  access: "Erişim / veri kopyası",
  correction: "Düzeltme",
  deletion: "Silme",
  profiling_objection: "Otomatik analize itiraz",
};

export const createDataSubjectRequestSchema = z.object({
  contactId: z.string().min(1).max(160),
  type: z.enum(dataSubjectRequestTypes),
  requesterReference: z.string().trim().max(160),
  details: z.string().trim().max(2_000),
}).strict().superRefine((value, context) => {
  if (value.type === "correction" && value.details.length < 2) {
    context.addIssue({ code: "custom", path: ["details"], message: "Düzeltme talebinde açıklama gerekli." });
  }
});

export const resolveDataSubjectRequestSchema = z.object({
  requestId: z.string().min(1).max(160),
  decision: z.enum(["approved", "rejected"]),
  resolutionNote: z.string().trim().min(2).max(2_000),
  correctedContact: contactDraftSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.decision === "approved" && value.correctedContact === null) return;
  if (value.decision === "rejected" && value.correctedContact !== null) {
    context.addIssue({ code: "custom", path: ["correctedContact"], message: "Reddedilen talepte düzeltme verisi bulunamaz." });
  }
});

export type CreateDataSubjectRequestInput = z.infer<typeof createDataSubjectRequestSchema>;
export type ResolveDataSubjectRequestInput = z.infer<typeof resolveDataSubjectRequestSchema>;

export const contactDataExportSchema = z.object({
  requestId: z.string().min(1).max(160),
}).strict();
export type ContactDataExportInput = z.infer<typeof contactDataExportSchema>;

export interface DataSubjectRequestView {
  id: string;
  contactId: string;
  contactName: string;
  type: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  requesterReference: string | null;
  details: string | null;
  dueAt: number;
  resolutionNote: string | null;
  resolvedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ContactDataExport {
  generatedAt: number;
  contact: Record<string, unknown>;
  relationshipSignals: Array<{ label: string; value: string }>;
  interactions: Array<Record<string, unknown>>;
  referrals: Array<Record<string, unknown>>;
  opportunities: Array<Record<string, unknown>>;
  presentations: Array<Record<string, unknown>>;
  deals: Array<Record<string, unknown>>;
  voiceNotes: Array<Record<string, unknown>>;
  inboxItems: Array<Record<string, unknown>>;
}
