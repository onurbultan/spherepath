import { describe, expect, it } from "vitest";
import { isMirroredOpenAction, reconcileMirroredOpenAction, terminalLifecycleClearsOwnerAction } from "./reconcile-open-work.js";

describe("open work reconciliation", () => {
  it("recognizes the same promised action within the clock tolerance", () => {
    expect(isMirroredOpenAction({ type: "call", at: 10_000 }, { type: "call", at: 10_100 })).toBe(true);
    expect(isMirroredOpenAction({ type: "call", at: 10_000 }, { type: "valuation", at: 10_000 })).toBe(false);
  });

  it("clears owner work only for terminal listing and deal outcomes", () => {
    expect(terminalLifecycleClearsOwnerAction("listing", "sold")).toBe(true);
    expect(terminalLifecycleClearsOwnerAction("listing", "active")).toBe(false);
    expect(terminalLifecycleClearsOwnerAction("deal", "closed")).toBe(true);
  });

  it("moves and clears only the contact reminder mirrored by an opportunity", () => {
    expect(reconcileMirroredOpenAction(
      { type: "valuation", at: 10_000 },
      { type: "valuation", at: 10_000 },
      { type: "offer", at: 20_000 },
    )).toEqual({ type: "offer", at: 20_000 });
    expect(reconcileMirroredOpenAction(
      { type: "offer", at: 20_000 },
      { type: "offer", at: 20_000 },
      { type: null, at: null },
    )).toEqual({ type: null, at: null });
    expect(reconcileMirroredOpenAction(
      { type: "appointment", at: 30_000 },
      { type: "offer", at: 20_000 },
      { type: null, at: null },
    )).toBeUndefined();
  });
});
