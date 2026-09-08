import type { Opportunity } from "../domain/entities.js";
import type { PortfolioMatchRecord } from "./portfolio-match.js";

export interface OpportunityMatchSummary {
  total: number;
  matchCount: number;
  incompleteCount: number;
  alternativeCount: number;
}

export const requirementMatchCopy = {
  loading: "Eşleşmeler aranıyor…",
  error: "Eşleşmeler yüklenemedi",
  eyebrow: "PORTFÖY EŞLEŞMELERİ",
  close: "Kapat",
} as const;

export function isOpenRequirement(opportunity: Pick<Opportunity, "type" | "stage">): boolean {
  return (opportunity.type === "buyer_requirement" || opportunity.type === "tenant_requirement")
    && opportunity.stage !== "won" && opportunity.stage !== "lost";
}

/** Keep demand identities separate even when the same contact has several searches. */
export function summarizeOpportunityMatches(result: {
  matches: readonly PortfolioMatchRecord[];
  nearMisses: readonly PortfolioMatchRecord[];
}): Map<string, OpportunityMatchSummary> {
  const summaries = new Map<string, OpportunityMatchSummary>();
  const seen = new Map<string, Set<string>>();
  for (const [records, matched] of [[result.matches, true], [result.nearMisses, false]] as const) {
    for (const record of records) {
      const id = record.opportunityId;
      if (!id || !record.eligible) continue;
      const portfolioIds = seen.get(id) ?? new Set<string>();
      if (portfolioIds.has(record.portfolioItem.id)) continue;
      portfolioIds.add(record.portfolioItem.id);
      seen.set(id, portfolioIds);
      const summary = summaries.get(id) ?? { total: 0, matchCount: 0, incompleteCount: 0, alternativeCount: 0 };
      summary.total++;
      if (matched) summary.matchCount++;
      else if (record.softMismatchKeys.length) summary.alternativeCount++;
      else summary.incompleteCount++;
      summaries.set(id, summary);
    }
  }
  return summaries;
}

export function opportunityMatchIndicator(summary?: OpportunityMatchSummary) {
  if (!summary?.total) return null;
  const reviewCount = summary.incompleteCount + summary.alternativeCount;
  const label = reviewCount ? `${summary.total} portföy adayı` : `${summary.total} eşleşen portföy`;
  const hint = !reviewCount ? null
    : summary.matchCount ? "Eşleşme ve alternatifler"
      : summary.incompleteCount && summary.alternativeCount ? "Bilgi eksik / kriter farkı"
        : summary.alternativeCount ? "Kriter farkı var" : "Bilgi eksik";
  return { label, hint, review: reviewCount > 0 };
}

export function requirementMatchAccessibleLabel(name: string, label: string): string {
  return `${name}: ${label}. Portföyleri incele`;
}
