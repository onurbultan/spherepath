import { z } from "zod";
import type { Deal, DealStage, Presentation, PresentationStatus, TenantOwned } from "../domain/entities.js";
import { currencyCodes } from "../listings/listing-draft.js";
import { marketingChannels } from "../privacy/contact-privacy.js";

export const presentationStatuses = ["draft", "user_approved", "sent", "delivered", "read", "replied", "failed"] as const satisfies readonly PresentationStatus[];
export const presentationStatusLabels: Record<PresentationStatus, string> = { draft: "Taslak", user_approved: "Kullanıcı onayladı", sent: "Gönderildi", delivered: "Teslim", read: "Okundu", replied: "Yanıtlandı", failed: "Başarısız" };
export const presentationDraftSchema = z.object({ listingId: z.string().min(1).max(160), contactId: z.string().min(1).max(160), message: z.string().trim().min(3).max(2000), channel: z.enum(marketingChannels) }).strict();
export type PresentationDraft = z.infer<typeof presentationDraftSchema>;
export const presentationTransitionSchema = z.object({ presentationId: z.string().min(1).max(160), toStatus: z.enum(presentationStatuses) }).strict();
export type PresentationTransition = z.infer<typeof presentationTransitionSchema>;
const presentationTransitions: Record<PresentationStatus, readonly PresentationStatus[]> = { draft: ["user_approved"], user_approved: ["sent", "failed"], sent: ["replied", "failed"], delivered: ["read", "replied", "failed"], read: ["replied"], replied: [], failed: [] };
export function assertPresentationTransition(from: PresentationStatus, to: PresentationStatus): void { if (!presentationTransitions[from].includes(to)) throw new Error("Invalid presentation transition."); }
export function nextPresentationStatuses(status: PresentationStatus): readonly PresentationStatus[] { return presentationTransitions[status]; }
export function createPresentation(draft: PresentationDraft, tenant: TenantOwned, now: number): Presentation { const parsed = presentationDraftSchema.parse(draft); return { ...tenant, ...parsed, status: "draft", statusSource: null, userConfirmedSentAt: null, externalMessageId: null, sentAt: null, deliveredAt: null, readAt: null, repliedAt: null, deletedAt: null, createdAt: now, updatedAt: now }; }

export const dealStages = ["presentation", "viewing", "offer", "contract", "closed", "lost"] as const satisfies readonly DealStage[];
export const dealStageLabels: Record<DealStage, string> = { presentation: "Sunum", viewing: "Gezi", offer: "Teklif", contract: "Sözleşme", closed: "Kapandı", lost: "Kaybedildi" };
export const dealDraftSchema = z.object({ listingId: z.string().min(1).max(160), buyerContactId: z.string().min(1).max(160).nullable() }).strict();
export type DealDraft = z.infer<typeof dealDraftSchema>;
export const dealTransitionSchema = z.object({ dealId: z.string().min(1).max(160), toStage: z.enum(dealStages), offerAmount: z.number().positive().nullable(), currency: z.enum(currencyCodes).nullable(), lostReason: z.string().trim().min(2).max(500).nullable() }).strict().superRefine((value, context) => { if (value.toStage === "offer" && (value.offerAmount === null || value.currency === null)) context.addIssue({ code: "custom", message: "Teklif aşamasında tutar ve para birimi gerekli." }); if (value.toStage === "lost" && !value.lostReason) context.addIssue({ code: "custom", message: "Kayıp nedeni gerekli." }); });
export type DealTransition = z.infer<typeof dealTransitionSchema>;
const dealTransitions: Record<DealStage, readonly DealStage[]> = { presentation: ["viewing", "offer", "lost"], viewing: ["offer", "lost"], offer: ["contract", "lost"], contract: ["closed", "lost"], closed: [], lost: [] };
export function assertDealTransition(from: DealStage, to: DealStage): void { if (!dealTransitions[from].includes(to)) throw new Error("Invalid deal transition."); }
export function nextDealStages(stage: DealStage): readonly DealStage[] { return dealTransitions[stage]; }
export function createDeal(draft: DealDraft, tenant: TenantOwned, now: number): Deal { const parsed = dealDraftSchema.parse(draft); return { ...tenant, ...parsed, stage: "presentation", offerAmount: null, currency: null, lostReason: null, closedAt: null, deletedAt: null, createdAt: now, updatedAt: now }; }
