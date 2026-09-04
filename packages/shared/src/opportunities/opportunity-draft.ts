import { z } from "zod";
import type { ContactRole, Opportunity, OpportunityStage, OpportunityType, TenantOwned } from "../domain/entities.js";
import { nextActionTypes } from "../interactions/manual-interaction.js";

export const opportunityTypes = ["seller_listing", "landlord_listing", "buyer_requirement", "tenant_requirement"] as const satisfies readonly OpportunityType[];
export const opportunityStages = ["new_lead", "first_contact", "appointment", "valuation", "mandate_offer", "won", "lost"] as const satisfies readonly OpportunityStage[];

export const opportunityTypeLabels: Record<OpportunityType, string> = {
  seller_listing: "Satılık portföy",
  landlord_listing: "Kiralık portföy",
  buyer_requirement: "Alıcı talebi",
  tenant_requirement: "Kiracı talebi",
};

const opportunityTypeByContactRole: Partial<Record<ContactRole, OpportunityType>> = {
  buyer: "buyer_requirement",
  investor: "buyer_requirement",
  tenant: "tenant_requirement",
  seller: "seller_listing",
  landlord: "landlord_listing",
};

/** Preselect the likely journey without preventing the advisor from changing it. */
export function suggestOpportunityTypeForRoles(roles: readonly ContactRole[]): OpportunityType | null {
  for (const role of roles) {
    const suggestion = opportunityTypeByContactRole[role];
    if (suggestion) return suggestion;
  }
  return null;
}

export const opportunityStageLabels: Record<OpportunityStage, string> = {
  new_lead: "Yeni talep",
  first_contact: "Görüşüldü",
  appointment: "Randevu",
  valuation: "Değerleme",
  mandate_offer: "Yetki konuşuluyor",
  won: "Yetki alındı",
  lost: "Sonuçlanmadı",
};

/** Owner opportunities acquire a mandate; buyer and tenant opportunities acquire a client. */
export function opportunityStageLabel(stage: OpportunityStage, type: OpportunityType): string {
  const requirement = type === "buyer_requirement" || type === "tenant_requirement";
  if (requirement) {
    if (stage === "appointment") return "İhtiyaç görüşmesi";
    if (stage === "valuation") return "Talep netleşti";
    if (stage === "mandate_offer") return "Hizmet konuşuluyor";
    if (stage === "won") return "Müşteri kazanıldı";
  } else if (stage === "new_lead") {
    return "Yeni portföy adayı";
  }
  return opportunityStageLabels[stage];
}

export interface OpportunityPathStep {
  stage: OpportunityStage;
  label: string;
}

export function opportunityPath(type: OpportunityType): readonly OpportunityPathStep[] {
  return opportunityStages.map((stage) => ({ stage, label: opportunityStageLabel(stage, type) }));
}

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
    lostKind: "lost",
    estimatedValue: null,
    closedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
