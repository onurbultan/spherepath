import { z } from "zod";
import type { CountryCode, UserRole } from "../domain/entities.js";

export const verbisStatuses = ["unknown", "exempt", "registered"] as const;
export type VerbisStatus = (typeof verbisStatuses)[number];

export const workspaceSettingsSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40),
  defaultRegions: z.array(z.string().trim().min(2).max(120)).max(5),
  monthlyPortfolioTarget: z.number().int().min(1).max(100).nullable(),
  weeklyCapacity: z.number().int().min(1).max(100).nullable(),
  country: z.enum(["TR", "TRNC"]),
  dataControllerName: z.string().trim().min(2).max(160),
  verbisStatus: z.enum(verbisStatuses),
  trncFilingConfirmed: z.boolean(),
  trncTransferLicenseConfirmed: z.boolean(),
  dailyPlanReminderEnabled: z.boolean(),
  dailyPlanReminderHour: z.number().int().min(0).max(23),
  dailyPlanReminderMinute: z.number().int().min(0).max(59),
}).strict().superRefine((value, context) => {
  if (value.country === "TRNC" && (!value.trncFilingConfirmed || !value.trncTransferLicenseConfirmed)) {
    context.addIssue({
      code: "custom",
      path: ["country"],
      message: "KKTC çalışma alanı için dosyalama bildirimi ve yurt dışı aktarım ruhsatı birlikte doğrulanmalı.",
    });
  }
});

export type WorkspaceSettingsDraft = z.infer<typeof workspaceSettingsSchema>;

export interface WorkspaceSettingsView extends WorkspaceSettingsDraft {
  officeId: string;
  role: UserRole;
  retentionPolicyVersion: string;
  trncFilingConfirmedAt: number | null;
  trncTransferLicenseConfirmedAt: number | null;
  updatedAt: number;
}

export const countryLabels: Record<CountryCode, string> = { TR: "Türkiye", TRNC: "Kuzey Kıbrıs Türk Cumhuriyeti" };
export const verbisStatusLabels: Record<VerbisStatus, string> = {
  unknown: "Henüz değerlendirilmedi",
  exempt: "Eşik altında / muaf",
  registered: "VERBİS kaydı tamamlandı",
};
