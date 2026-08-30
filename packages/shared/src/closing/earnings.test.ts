import { describe, expect, it } from "vitest";
import { buildEarningsSummary, type EarningsDeal } from "./earnings";

const day = 86_400_000;
const now = 1_700_000_000_000;
const closed = (overrides: Partial<EarningsDeal>): EarningsDeal => ({
  stage: "closed", offerAmount: null, actualAmount: 1_000_000, commissionAmount: 20_000, currency: "TRY", closedAt: now - day, ...overrides,
});

describe("buildEarningsSummary", () => {
  it("totals commission and volume for deals closed inside the period", () => {
    const summary = buildEarningsSummary([closed({}), closed({ actualAmount: 3_000_000, commissionAmount: 60_000 })], "30d", now);
    expect(summary.closedCount).toBe(2);
    expect(summary.totals).toHaveLength(1);
    expect(summary.totals[0]).toMatchObject({ currency: "TRY", commission: 80_000, volume: 4_000_000, closedCount: 2 });
    expect(summary.totals[0]!.commissionRate).toBeCloseTo(0.02);
  });

  it("keeps currencies apart instead of adding them together", () => {
    const summary = buildEarningsSummary([
      closed({}),
      closed({ currency: "GBP", actualAmount: 400_000, commissionAmount: 12_000 }),
    ], "30d", now);
    expect(summary.totals.map((total) => total.currency)).toEqual(["TRY", "GBP"]);
    expect(summary.totals.find((total) => total.currency === "GBP")?.commission).toBe(12_000);
  });

  it("ignores deals closed before the period and deals that are not closed", () => {
    const summary = buildEarningsSummary([
      closed({ closedAt: now - 40 * day }),
      closed({ stage: "offer", closedAt: null }),
    ], "30d", now);
    expect(summary.closedCount).toBe(0);
    expect(summary.totals).toEqual([]);
  });

  it("reports a closed deal with missing figures as incomplete rather than zero", () => {
    const summary = buildEarningsSummary([closed({ commissionAmount: null, currency: null })], "30d", now);
    expect(summary.closedCount).toBe(1);
    expect(summary.incompleteCount).toBe(1);
    expect(summary.totals).toEqual([]);
  });

  it("widens the window for longer reporting periods", () => {
    const deals = [closed({ closedAt: now - 200 * day })];
    expect(buildEarningsSummary(deals, "90d", now).closedCount).toBe(0);
    expect(buildEarningsSummary(deals, "1y", now).closedCount).toBe(1);
  });
});

describe("open pipeline", () => {
  it("totals offers and contracts still in flight, per currency", () => {
    const summary = buildEarningsSummary([
      closed({ stage: "offer", offerAmount: 6_900_000, closedAt: null }),
      closed({ stage: "contract", offerAmount: 2_100_000, closedAt: null }),
      closed({ stage: "offer", offerAmount: 400_000, currency: "GBP", closedAt: null }),
    ], "30d", now);
    expect(summary.closedCount).toBe(0);
    expect(summary.pipeline).toEqual([
      { currency: "TRY", amount: 9_000_000, count: 2 },
      { currency: "GBP", amount: 400_000, count: 1 },
    ]);
  });

  it("leaves closed and lost deals out of the pipeline", () => {
    const summary = buildEarningsSummary([closed({}), closed({ stage: "lost", offerAmount: 500_000, closedAt: null })], "30d", now);
    expect(summary.pipeline).toEqual([]);
  });
});
