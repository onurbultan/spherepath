import { describe, expect, it } from "vitest";
import { isOpenRequirement, opportunityMatchIndicator, summarizeOpportunityMatches } from "./opportunity-match-summary.js";
import type { PortfolioMatchRecord } from "./portfolio-match.js";

function match(opportunityId: string | null, id: string, overrides: Partial<PortfolioMatchRecord> = {}): PortfolioMatchRecord {
  return { opportunityId, contactId: "melis", contactName: "Melis", eligible: true, score: 58, coverage: 58, reasons: [], softMismatchKeys: [], portfolioItem: { id } as PortfolioMatchRecord["portfolioItem"], ...overrides };
}

describe("opportunity match summaries", () => {
  it("makes incomplete candidates visible without calling them matches", () => {
    const summary = summarizeOpportunityMatches({ matches: [], nearMisses: [match("land", "plot")] }).get("land");
    expect(summary).toEqual({ total: 1, matchCount: 0, incompleteCount: 1, alternativeCount: 0 });
    expect(opportunityMatchIndicator(summary)).toEqual({ label: "1 portföy adayı", hint: "Bilgi eksik", review: true });
  });
  it("separates demands for the same person and ignores unlinked or ineligible candidates", () => {
    const summaries = summarizeOpportunityMatches({ matches: [match("land", "plot"), match("flat", "home"), match(null, "legacy"), match("land", "wrong", { eligible: false })], nearMisses: [] });
    expect([...summaries.keys()]).toEqual(["land", "flat"]);
    expect(summaries.get("land")?.total).toBe(1);
    expect(opportunityMatchIndicator(summaries.get("flat"))?.label).toBe("1 eşleşen portföy");
  });
  it("counts each portfolio once per demand and distinguishes alternatives", () => {
    const summaries = summarizeOpportunityMatches({ matches: [match("land", "plot"), match("land", "plot")], nearMisses: [match("land", "plot"), match("land", "other", { softMismatchKeys: ["budget"] })] });
    expect(summaries.get("land")).toEqual({ total: 2, matchCount: 1, incompleteCount: 0, alternativeCount: 1 });
    expect(opportunityMatchIndicator(summaries.get("land"))?.hint).toBe("Eşleşme ve alternatifler");
    expect(opportunityMatchIndicator({ total: 1, matchCount: 0, incompleteCount: 0, alternativeCount: 1 })?.hint).toBe("Kriter farkı var");
  });
  it("does not advertise zero matches", () => {
    expect(summarizeOpportunityMatches({ matches: [], nearMisses: [] }).size).toBe(0);
    expect(opportunityMatchIndicator()).toBeNull();
  });
  it("only shows indicators for open buyer and tenant demands", () => {
    expect(isOpenRequirement({ type: "buyer_requirement", stage: "first_contact" })).toBe(true);
    expect(isOpenRequirement({ type: "tenant_requirement", stage: "new_lead" })).toBe(true);
    expect(isOpenRequirement({ type: "seller_listing", stage: "first_contact" })).toBe(false);
    expect(isOpenRequirement({ type: "buyer_requirement", stage: "won" })).toBe(false);
    expect(isOpenRequirement({ type: "tenant_requirement", stage: "lost" })).toBe(false);
  });
});
