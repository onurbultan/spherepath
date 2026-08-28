import { z } from "zod";
import type { Referral, TenantOwned } from "../domain/entities.js";

export const referralDraftSchema = z.object({
  sourceContactId: z.string().trim().min(1).max(160),
  referredContactId: z.string().trim().min(1).max(160).nullable(),
  referredLabel: z.string().trim().min(2).max(160).nullable(),
}).strict().superRefine((value, context) => {
  if (!value.referredContactId && !value.referredLabel) context.addIssue({ code: "custom", message: "Referans verilen kişi veya kısa tanım gerekli." });
  if (value.referredContactId === value.sourceContactId) context.addIssue({ code: "custom", path: ["referredContactId"], message: "Kaynak ve referans verilen kişi farklı olmalı." });
});
export type ReferralDraft = z.infer<typeof referralDraftSchema>;

export function createReferral(draft: ReferralDraft, tenant: TenantOwned, now: number): Referral {
  const parsed = referralDraftSchema.parse(draft);
  return { ...tenant, sourceContactId: parsed.sourceContactId, referredContactId: parsed.referredContactId, referredLabel: parsed.referredLabel, opportunityId: null, status: "first_contact_pending", firstNoticeCompletedAt: null, deletedAt: null, createdAt: now, updatedAt: now };
}
