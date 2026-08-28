import { z } from "zod";
import type { IysStatus, LegalBasis, MarketingChannel } from "../domain/entities.js";

export const legalBases = ["legitimate_interest", "contract", "legal_obligation", "explicit_consent"] as const satisfies readonly LegalBasis[];
export const marketingChannels = ["phone", "whatsapp", "sms", "email"] as const satisfies readonly MarketingChannel[];
export const iysStatuses = ["unknown", "approved", "rejected", "exempt"] as const satisfies readonly IysStatus[];
export const legalBasisLabels: Record<LegalBasis, string> = { legitimate_interest: "Meşru menfaat", contract: "Sözleşme", legal_obligation: "Kanuni yükümlülük", explicit_consent: "Açık rıza" };
export const marketingChannelLabels: Record<MarketingChannel, string> = { phone: "Telefon", whatsapp: "WhatsApp", sms: "SMS", email: "E-posta" };
export const iysStatusLabels: Record<IysStatus, string> = { unknown: "Bilinmiyor", approved: "Onaylı", rejected: "Ret", exempt: "Muaf" };

export const contactPrivacyDraftSchema = z.object({
  contactId: z.string().trim().min(1).max(160),
  coreCrmLegalBasis: z.enum(legalBases),
  noticeStatus: z.enum(["pending", "completed"]),
  noticeMethod: z.enum(["verbal", "written", "electronic"]).nullable(),
  noticeVersion: z.string().trim().min(1).max(80).nullable(),
  marketingConsent: z.enum(["unknown", "granted", "withdrawn"]),
  marketingChannels: z.array(z.enum(marketingChannels)).max(4),
  iysStatus: z.enum(iysStatuses),
  profilingObjection: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.noticeStatus === "completed" && (!value.noticeMethod || !value.noticeVersion)) context.addIssue({ code: "custom", path: ["noticeStatus"], message: "Tamamlanan aydınlatma için yöntem ve sürüm gerekli." });
  if (value.marketingConsent === "granted" && value.marketingChannels.length === 0) context.addIssue({ code: "custom", path: ["marketingChannels"], message: "Pazarlama rızası için en az bir kanal seçilmeli." });
});
export type ContactPrivacyDraft = z.infer<typeof contactPrivacyDraftSchema>;

export function canMarketOnChannel(privacy: { noticeStatus: string; marketingConsent: string; marketingChannels: MarketingChannel[]; iysStatus: IysStatus; profilingObjection: boolean }, channel: MarketingChannel): { allowed: boolean; reason: string | null } {
  if (privacy.noticeStatus !== "completed") return { allowed: false, reason: "Aydınlatma tamamlanmadı." };
  if (privacy.marketingConsent !== "granted") return { allowed: false, reason: "Pazarlama rızası verilmedi." };
  if (!privacy.marketingChannels.includes(channel)) return { allowed: false, reason: "Kanal pazarlama izni kapsamında değil." };
  if (privacy.iysStatus !== "approved" && privacy.iysStatus !== "exempt") return { allowed: false, reason: "İYS durumu onaylı veya muaf değil." };
  if (privacy.profilingObjection) return { allowed: false, reason: "Otomatik eşleştirme itirazı var." };
  return { allowed: true, reason: null };
}
