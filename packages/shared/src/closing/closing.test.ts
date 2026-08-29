import { describe, expect, it } from "vitest";
import { assertDealTransition, assertPresentationTransition, dealTransitionSchema } from "./closing.js";
describe("closing rules", () => {
  const base = { actualAmount: null, commissionAmount: null };
  it("requires user confirmation before sent", () => { expect(() => assertPresentationTransition("draft", "sent")).toThrow(); expect(() => assertPresentationTransition("user_approved", "sent")).not.toThrow(); });
  it("keeps deal stages explicit", () => { expect(() => assertDealTransition("presentation", "closed")).toThrow(); });
  it("requires amount for an offer", () => { expect(dealTransitionSchema.safeParse({ ...base, dealId: "d", toStage: "offer", offerAmount: null, currency: null, lostReason: null }).success).toBe(false); });
  it("requires actual amount and commission when closed", () => {
    expect(dealTransitionSchema.safeParse({ ...base, dealId: "d", toStage: "closed", offerAmount: null, currency: "TRY", lostReason: null }).success).toBe(false);
    expect(dealTransitionSchema.safeParse({ dealId: "d", toStage: "closed", offerAmount: null, actualAmount: 5_000_000, commissionAmount: 100_000, currency: "TRY", lostReason: null }).success).toBe(true);
  });
  it("requires a reason when a deal is lost", () => { expect(dealTransitionSchema.safeParse({ ...base, dealId: "d", toStage: "lost", offerAmount: null, currency: null, lostReason: null }).success).toBe(false); });
  it("accepts complete offer and lost transitions", () => {
    expect(dealTransitionSchema.safeParse({ ...base, dealId: "d", toStage: "offer", offerAmount: 5_000_000, currency: "TRY", lostReason: null }).success).toBe(true);
    expect(dealTransitionSchema.safeParse({ ...base, dealId: "d", toStage: "lost", offerAmount: null, currency: null, lostReason: "Fiyat beklentisi uyuşmadı" }).success).toBe(true);
  });
});
