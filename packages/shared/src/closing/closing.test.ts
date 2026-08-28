import { describe, expect, it } from "vitest";
import { assertDealTransition, assertPresentationTransition, dealTransitionSchema } from "./closing.js";
describe("closing rules", () => {
  it("requires user confirmation before sent", () => { expect(() => assertPresentationTransition("draft", "sent")).toThrow(); expect(() => assertPresentationTransition("user_approved", "sent")).not.toThrow(); });
  it("keeps deal stages explicit", () => { expect(() => assertDealTransition("presentation", "closed")).toThrow(); });
  it("requires amount for an offer", () => { expect(dealTransitionSchema.safeParse({ dealId: "d", toStage: "offer", offerAmount: null, currency: null, lostReason: null }).success).toBe(false); });
});
