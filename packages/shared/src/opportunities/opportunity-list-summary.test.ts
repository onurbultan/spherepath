import { describe, expect, it } from "vitest";
import { opportunitiesForJourney, opportunityListSummary } from "./opportunity-list-summary.js";

describe("opportunity list counters", () => {
  const records = [
    { type: "seller_listing" as const, stage: "won" as const },
    { type: "buyer_requirement" as const, stage: "first_contact" as const },
  ];
  it("counts the acquired mandate and open buyer requirement in All", () => {
    expect(opportunityListSummary(records)).toEqual({ total: 2, open: 1, won: 1, lost: 0 });
    expect(opportunityListSummary(opportunitiesForJourney(records, "owner"))).toEqual({ total: 1, open: 0, won: 1, lost: 0 });
    expect(opportunityListSummary(opportunitiesForJourney(records, "requirement"))).toEqual({ total: 1, open: 1, won: 0, lost: 0 });
  });
  it("keeps total equal to the outcome counts, including visible duplicate closures", () => {
    const closed = [{ stage: "lost" as const }, { stage: "lost" as const, lostKind: "duplicate" }];
    const summary = opportunityListSummary([...records, ...closed]);
    expect(summary).toEqual({ total: 4, open: 1, won: 1, lost: 2 });
    expect(summary.total).toBe(summary.open + summary.won + summary.lost);
  });
  it("counts only the supplied search scope and handles an empty scope", () => {
    expect(opportunityListSummary(records.filter((item) => item.type === "buyer_requirement"))).toEqual({ total: 1, open: 1, won: 0, lost: 0 });
    expect(opportunityListSummary([])).toEqual({ total: 0, open: 0, won: 0, lost: 0 });
  });
});
