import { z } from "zod";
import type { Opportunity, OpportunityStage, OpportunityType, TenantOwned } from "../domain/entities.js";
import { nextActionTypes } from "../interactions/manual-interaction.js";

export const opportunityTypes = ["seller_listing", "landlord_listing", "buyer_requirement", "tenant_requirement"] as const satisfies readonly OpportunityType[];
export const opportunityStages = ["new_lead", "first_contact", "appointment", "valuation", "mandate_offer", "won", "lost"] as const satisfies readonly OpportunityStage[];

export const opportunityTypeLabels: Record<OpportunityType, string> = {
  seller_listing: "Satılık portföy",
  landlord_listing: "Kiralık portföy",
  buyer_requirement: "Alıcı talebi",
  tenant_requirement: "Kiracı talebi",
};

export const opportunityStageLabels: Record<OpportunityStage, string> = {
  new_lead: "Yeni lead",
  first_contact: "İlk temas",
  appointment: "Randevu",
  valuation: "Değerleme",
  mandate_offer: "Yetki teklifi",
  won: "Kazanıldı",
  lost: "Kaybedildi",
};

export const opportunityDraftSchema = z.object({
  subjectContactId: z.string().min(1).max(160),
  type: z.enum(opportunityTypes),
  nextActionType: z.enum(nextActionTypes),
  nextActionAt: z.number().int().positive(),
}).strict();

export type OpportunityDraft = z.infer<typeof opportunityDraftSchema>;

export function createOpportunity(draft: OpportunityDraft, tenant: TenantOwned, now: number): Opportunity {
  const parsed = opportunityDraftSchema.parse(draft);
  return {
    ...tenant,
    type: parsed.type,
    subjectContactId: parsed.subjectContactId,
    sourceContactId: null,
    referralId: null,
    propertyId: null,
    stage: "new_lead",
    qualifiedAt: now,
    stageEnteredAt: now,
    nextActionAt: parsed.nextActionAt,
    nextActionType: parsed.nextActionType,
    lostReason: null,
    estimatedValue: null,
    closedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
