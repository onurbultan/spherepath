import { z } from "zod";
import type { Deal, DealOffer, DealStage, ListingStatus, Presentation, PresentationStatus, TenantOwned } from "../domain/entities.js";
import { currencyCodes } from "../listings/listing-draft.js";
import { nextActionTypes } from "../interactions/manual-interaction.js";
import { marketingChannels } from "../privacy/contact-privacy.js";

export const presentationStatuses = ["draft", "user_approved", "sent", "delivered", "read", "replied", "failed"] as const satisfies readonly PresentationStatus[];
export const presentationStatusLabels: Record<PresentationStatus, string> = { draft: "Taslak", user_approved: "Kullanıcı onayladı", sent: "Gönderildi", delivered: "Teslim", read: "Okundu", replied: "Yanıtlandı", failed: "Başarısız" };
export const presentationDraftSchema = z.object({ listingId: z.string().min(1).max(160), contactId: z.string().min(1).max(160), message: z.string().trim().min(3).max(2000), channel: z.enum(marketingChannels) }).strict();
export type PresentationDraft = z.infer<typeof presentationDraftSchema>;
export const presentationTransitionSchema = z.object({ presentationId: z.string().min(1).max(160), toStatus: z.enum(presentationStatuses), userConfirmedSent: z.boolean().optional() }).strict().refine((value) => value.toStatus !== "sent" || value.userConfirmedSent === true, "Gönderimi gerçekten yaptığını doğrula.");
export type PresentationTransition = z.infer<typeof presentationTransitionSchema>;
const presentationTransitions: Record<PresentationStatus, readonly PresentationStatus[]> = { draft: ["user_approved"], user_approved: ["sent", "failed"], sent: ["replied", "failed"], delivered: ["read", "replied", "failed"], read: ["replied"], replied: [], failed: [] };
export function assertPresentationTransition(from: PresentationStatus, to: PresentationStatus): void { if (!presentationTransitions[from].includes(to)) throw new Error("Invalid presentation transition."); }
export function nextPresentationStatuses(status: PresentationStatus): readonly PresentationStatus[] { return presentationTransitions[status]; }
export function createPresentation(draft: PresentationDraft, tenant: TenantOwned, now: number): Presentation { const parsed = presentationDraftSchema.parse(draft); return { ...tenant, ...parsed, status: "draft", statusSource: null, userConfirmedSentAt: null, externalMessageId: null, sentAt: null, deliveredAt: null, readAt: null, repliedAt: null, deletedAt: null, createdAt: now, updatedAt: now }; }

export const dealStages = ["inquiry", "presentation", "viewing", "offer", "contract", "closed", "lost"] as const satisfies readonly DealStage[];
export const dealStageLabels: Record<DealStage, string> = { inquiry: "Doğrudan talep", presentation: "Sunum", viewing: "Gezi", offer: "Teklif", contract: "Sözleşme", closed: "Kapandı", lost: "Kaybedildi" };
export const dealSources = ["presentation", "direct_inquiry", "referral", "other"] as const;
export const dealSourceLabels: Record<(typeof dealSources)[number], string> = {
  presentation: "Gönderilmiş sunum",
  direct_inquiry: "Doğrudan talep",
  referral: "Referans",
  other: "Diğer",
};
export const dealDraftSchema = z.object({
  listingId: z.string().min(1).max(160),
  buyerContactId: z.string().min(1).max(160).nullable(),
  buyerOpportunityId: z.string().min(1).max(160).nullable().default(null),
  source: z.enum(dealSources).default("presentation"),
  sourcePresentationId: z.string().min(1).max(160).nullable().default(null),
  sourceNote: z.string().trim().min(2).max(500).nullable().default(null),
  occurredAt: z.number().int().positive().optional(),
  nextActionType: z.enum(nextActionTypes),
  nextActionAt: z.number().positive(),
}).strict().superRefine((value, context) => {
  if (value.occurredAt !== undefined && value.nextActionAt <= value.occurredAt) context.addIssue({ code: "custom", message: "Sonraki aksiyon talep tarihinden sonra olmalı.", path: ["nextActionAt"] });
  if (value.source !== "presentation" && !value.sourceNote) {
    context.addIssue({ code: "custom", message: "Sunum dışı işlem kaynağı için kısa bir açıklama gerekli.", path: ["sourceNote"] });
  }
});
export type DealDraft = z.infer<typeof dealDraftSchema>;
export const dealTransitionSchema = z.object({
  offerParty: z.enum(["buyer", "seller"]).optional(),
  sourceInteractionId: z.string().min(1).max(160).nullable().optional(),
  dealId: z.string().min(1).max(160),
  toStage: z.enum(dealStages),
  occurredAt: z.number().positive(),
  evidenceNote: z.string().trim().min(2).max(500),
  nextActionType: z.enum(nextActionTypes).nullable(),
  nextActionAt: z.number().positive().nullable(),
  offerAmount: z.number().positive().nullable(),
  actualAmount: z.number().positive().nullable(),
  commissionAmount: z.number().nonnegative().nullable(),
  currency: z.enum(currencyCodes).nullable(),
  lostReason: z.string().trim().min(2).max(500).nullable(),
}).strict().superRefine((value, context) => {
  if (value.toStage === "offer" && (value.offerAmount === null || value.currency === null)) context.addIssue({ code: "custom", message: "Teklif aşamasında tutar ve para birimi gerekli." });
  if (value.toStage === "closed" && (value.actualAmount === null || value.commissionAmount === null || value.currency === null)) context.addIssue({ code: "custom", message: "Kapama aşamasında gerçekleşen bedel, komisyon ve para birimi gerekli." });
  if (value.toStage === "lost" && !value.lostReason) context.addIssue({ code: "custom", message: "Kayıp nedeni gerekli." });
  const terminal = value.toStage === "closed" || value.toStage === "lost";
  if (!terminal && (value.nextActionType === null || value.nextActionAt === null)) context.addIssue({ code: "custom", message: "Açık bir işlem için sonraki aksiyon ve zamanı gerekli." });
  if (!terminal && value.nextActionAt !== null && value.nextActionAt <= value.occurredAt) context.addIssue({ code: "custom", message: "Sonraki aksiyon aşama tarihinden sonra olmalı.", path: ["nextActionAt"] });
});
export type DealTransition = z.infer<typeof dealTransitionSchema>;
const dealTransitions: Record<DealStage, readonly DealStage[]> = { inquiry: ["offer", "viewing", "lost"], presentation: ["viewing", "offer", "lost"], viewing: ["offer", "lost"], offer: ["contract", "lost", "offer"], contract: ["closed", "lost"], closed: [], lost: [] };
export function assertDealTransition(from: DealStage, to: DealStage): void { if (!dealTransitions[from].includes(to)) throw new Error("Invalid deal transition."); }
export function nextDealStages(stage: DealStage): readonly DealStage[] { return dealTransitions[stage]; }
export function createDeal(draft: DealDraft, tenant: TenantOwned, now: number): Deal { const parsed = dealDraftSchema.parse(draft); return { ...tenant, ...parsed, stage: parsed.source === "presentation" ? "presentation" : "inquiry", stageEnteredAt: parsed.occurredAt ?? now, offers: [], lastStageNote: parsed.source === "presentation" ? "Gönderilmiş sunumdan işlem başlatıldı" : parsed.sourceNote, offerAmount: null, actualAmount: null, commissionAmount: null, currency: null, lostReason: null, closedAt: null, deletedAt: null, createdAt: now, updatedAt: now }; }

export const presentationConfirmationCopy = {
  action: "Gönderimi doğrula",
  title: "Mesajı gerçekten gönderdin mi?",
  hint: "Bu işlem mesaj göndermez. Kendi WhatsApp, SMS veya e-posta uygulamandan gönderdiğin mesajı kaydeder.",
  confirmed: "Mesajı belirtilen kişiye ve kanala gerçekten gönderdim",
  save: "Gönderildi olarak kaydet",
} as const;


export function canRecordInternalDeal(status: ListingStatus, source: DealDraft["source"]): boolean {
  return status === "active" || status === "reserved" || (status === "preparing" && source !== "presentation");
}

/** Append a proposal without accepting it or replacing the original price. */
export function appendDealOffer(deal: Pick<Deal, "stage" | "offers">, transition: DealTransition, id: string, now: number): DealOffer[] {
  assertDealTransition(deal.stage, transition.toStage);
  const history = deal.offers ?? [];
  if (transition.toStage !== "offer") return history;
  const parsed = dealTransitionSchema.parse(transition);
  return [...history, { id, party: parsed.offerParty ?? "buyer", amount: parsed.offerAmount!, currency: parsed.currency!, occurredAt: parsed.occurredAt, recordedAt: now, note: parsed.evidenceNote, previousOfferId: history.at(-1)?.id ?? null, sourceInteractionId: parsed.sourceInteractionId ?? null }];
}
