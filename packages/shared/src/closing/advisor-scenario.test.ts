import { manualInteractionSchema } from "../interactions/manual-interaction.js";
import { describe, expect, it } from "vitest";
import { appendDealOffer, canRecordInternalDeal, createDeal, dealDraftSchema, dealTransitionSchema } from "./closing.js";
import { createPropertyAndListing, portfolioInventorySummary } from "../listings/listing-draft.js";
import { listingMatchCandidate } from "../matching/listing-candidate.js";
import { scorePortfolioItem } from "../matching/portfolio-match.js";
import { approvedOpportunityCriteria } from "../opportunities/opportunity-situation.js";
import { emptyVoiceInsights, emptyVoicePropertyPreferences } from "../voice/voice-note.js";

const tenant = { officeId: "office", ownerUid: "advisor" };
const listing = createPropertyAndListing({ opportunityId: "seller", address: "Kadıovacık 620 m² arsa", regionSlug: "Kadıovacık", propertyType: "land", roomCount: 3, areaM2: 620, features: ["no_elevator", "sea_view"], authorizationType: "verbal", askingPrice: 5_000_000, currency: "TRY", expiresAt: null, acquiredAt: 1_000 }, tenant, "anil", "property", 4_000).listing;
describe("Anıl and Melis negotiation", () => {
  it("allows an internal inquiry while preserving the publication gate", () => {
    expect(canRecordInternalDeal("preparing", "direct_inquiry")).toBe(true);
    expect(canRecordInternalDeal("preparing", "presentation")).toBe(false);
    expect(canRecordInternalDeal("sold", "direct_inquiry")).toBe(false);
    expect(listing.readinessEvidence).toEqual({ mandate: "pending", eids: "pending", media: "pending", processingBasis: "pending" });
    expect(listing.acquiredAt).toBe(1_000);
    expect(listing.createdAt).toBe(4_000);
    expect(listing.propertySummary.roomCount).toBeNull();
    expect(listing.propertySummary.features).toEqual(["sea_view"]);
  });
  it("retains both proposals without accepting the counteroffer or editing the asking price", () => {
    const deal = createDeal(dealDraftSchema.parse({ listingId: "listing", buyerContactId: "melis", buyerOpportunityId: "demand", source: "direct_inquiry", sourceNote: "Melis arsaya talip", occurredAt: 2_000, nextActionType: "appointment", nextActionAt: 5_000 }), tenant, 4_000);
    expect(deal.stage).toBe("inquiry");
    const first = dealTransitionSchema.parse({ dealId: "deal", toStage: "offer", offerParty: "buyer", occurredAt: 2_000, offerAmount: 4_500_000, currency: "TRY", evidenceNote: "Alıcı teklifi", nextActionType: "appointment", nextActionAt: 5_000, actualAmount: null, commissionAmount: null, lostReason: null });
    const offers = appendDealOffer(deal, first, "first", 4_000);
    const history = appendDealOffer({ ...deal, stage: "offer", offers }, { ...first, offerParty: "seller", offerAmount: 4_800_000, occurredAt: 3_000, evidenceNote: "Satıcı karşı teklifi" }, "counter", 4_000);
    expect(history.map((offer) => [offer.party, offer.amount, offer.occurredAt])).toEqual([["buyer", 4_500_000, 2_000], ["seller", 4_800_000, 3_000]]);
    expect(history[1]?.previousOfferId).toBe("first");
    expect(offers).toHaveLength(1);
    expect(deal.actualAmount).toBeNull();
    expect(listing.askingPrice).toBe(5_000_000);
    expect(() => appendDealOffer({ ...deal, stage: "closed" }, first, "invalid", 4_000)).toThrow();
  });
  it("requires a follow-up after the inquiry and keeps appointment confirmation explicit", () => {
    const draft = { listingId: "listing", buyerContactId: "melis", source: "direct_inquiry", sourceNote: "Talip oldu", occurredAt: 2_000, nextActionType: "appointment", nextActionAt: 1_000 };
    expect(dealDraftSchema.safeParse(draft).success).toBe(false);
    expect(dealDraftSchema.parse({ ...draft, nextActionAt: 3_000 }).nextActionType).toBe("appointment");
    expect(dealDraftSchema.parse({ ...draft, nextActionAt: 3_000, nextActionType: "appointment_confirmed" }).nextActionType).toBe("appointment_confirmed");
    expect(manualInteractionSchema.shape.nextActionType.safeParse("appointment_confirmed").success).toBe(true);
  });
  it("carries reviewed criteria to the right demand without copying the other property context", () => {
    const insights = { ...emptyVoiceInsights, propertyContext: "search_preference" as const, propertyPreferences: { ...emptyVoicePropertyPreferences, transactionType: "buy" as const, propertyTypes: ["land" as const], preferredLocations: ["Kadıovacık"] } };
    expect(approvedOpportunityCriteria(insights, "buyer_requirement")?.preferredLocations).toEqual(["Kadıovacık"]);
    expect(approvedOpportunityCriteria(insights, "seller_listing")).toBeUndefined();
    expect(approvedOpportunityCriteria(insights, "tenant_requirement")).toBeUndefined();
  });
  it("normalizes owned land and distinguishes missing information from a conflict", () => {
    const candidate = listingMatchCandidate({ ...listing, id: "listing" }, "sell", "Danışman")!;
    expect(candidate.landAreaM2).toBe(620);
    expect(candidate.sourceListingId).toBe("listing");
    const result = scorePortfolioItem({ ...emptyVoicePropertyPreferences, transactionType: "buy", propertyTypes: ["land"], preferredLocations: ["Kadıovacık"] }, candidate);
    expect(result.eligible).toBe(true);
    expect(result.softMismatchKeys).toEqual([]);
    expect(result.reasons.find((reason) => reason.key === "budget")?.status).toBe("unknown");
    expect(result.reasons.some((reason) => reason.key === "rooms")).toBe(false);
    expect(portfolioInventorySummary([listing])).toContain("Hazırlanan: 1");
    expect(portfolioInventorySummary([listing])).toContain("5.000.000");
    expect(listingMatchCandidate({ ...listing, id: "listing", status: "removed" }, "sell", "Danışman")).toBeNull();
  });
});
