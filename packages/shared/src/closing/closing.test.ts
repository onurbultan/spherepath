import { describe, expect, it } from "vitest";
import { assertDealTransition, assertPresentationTransition, dealDraftSchema, dealTransitionSchema } from "./closing.js";
describe("closing rules", () => {
  const base = { actualAmount: null, commissionAmount: null, occurredAt: 1_000, evidenceNote: "Aşama görüşmeyle doğrulandı", nextActionType: "call" as const, nextActionAt: 2_000 };
  it("requires user confirmation before sent", () => { expect(() => assertPresentationTransition("draft", "sent")).toThrow(); expect(() => assertPresentationTransition("user_approved", "sent")).not.toThrow(); });
  it("keeps deal stages explicit", () => { expect(() => assertDealTransition("presentation", "closed")).toThrow(); });
  it("requires amount for an offer", () => { expect(dealTransitionSchema.safeParse({ ...base, dealId: "d", toStage: "offer", offerAmount: null, currency: null, lostReason: null }).success).toBe(false); });
  it("requires actual amount and commission when closed", () => {
    expect(dealTransitionSchema.safeParse({ ...base, dealId: "d", toStage: "closed", offerAmount: null, currency: "TRY", lostReason: null }).success).toBe(false);
    expect(dealTransitionSchema.safeParse({ ...base, dealId: "d", toStage: "closed", offerAmount: null, actualAmount: 5_000_000, commissionAmount: 100_000, currency: "TRY", lostReason: null, nextActionType: null, nextActionAt: null }).success).toBe(true);
  });
  it("requires a reason when a deal is lost", () => { expect(dealTransitionSchema.safeParse({ ...base, dealId: "d", toStage: "lost", offerAmount: null, currency: null, lostReason: null }).success).toBe(false); });
  it("accepts complete offer and lost transitions", () => {
    expect(dealTransitionSchema.safeParse({ ...base, dealId: "d", toStage: "offer", offerAmount: 5_000_000, currency: "TRY", lostReason: null }).success).toBe(true);
    expect(dealTransitionSchema.safeParse({ ...base, dealId: "d", toStage: "lost", offerAmount: null, currency: null, lostReason: "Fiyat beklentisi uyuşmadı", nextActionType: null, nextActionAt: null }).success).toBe(true);
  });
  it("requires an explanation when a deal did not start from a sent presentation", () => {
    expect(dealDraftSchema.safeParse({ listingId: "l", buyerContactId: "c", source: "direct_inquiry", sourceNote: null, nextActionType: "call", nextActionAt: 2_000 }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ listingId: "l", buyerContactId: "c", source: "direct_inquiry", sourceNote: "Müşteri ilan üzerinden aradı.", nextActionType: "call", nextActionAt: 2_000 }).success).toBe(true);
  });

  it("requires evidence and a next action while a deal remains open", () => {
    expect(dealTransitionSchema.safeParse({ ...base, dealId: "d", toStage: "viewing", evidenceNote: "" }).success).toBe(false);
    expect(dealTransitionSchema.safeParse({ ...base, dealId: "d", toStage: "viewing", nextActionType: null, nextActionAt: null }).success).toBe(false);
  });
});
