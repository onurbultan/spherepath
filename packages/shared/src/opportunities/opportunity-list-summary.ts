import type { OpportunityStage, OpportunityType } from "../domain/entities.js";
import { isOwnerOpportunity } from "./opportunity-situation.js";

export type OpportunityJourneyFilter = "all" | "owner" | "requirement";
export type OpportunityOutcomeFilter = "open" | "won" | "lost";
export const opportunityJourneyFilters = ["all", "owner", "requirement"] as const;
export const opportunityJourneyLabels = { all: "Tümü", owner: "Portföy kazanma", requirement: "Müşteri talepleri" } as const;
export const opportunityOutcomeLabels = { open: "Açık", won: "Kazanılan", lost: "Kaybedilen" } as const;

export function opportunitiesForJourney<T extends { type: OpportunityType }>(opportunities: readonly T[], journey: OpportunityJourneyFilter): T[] {
  return opportunities.filter((item) => journey === "all" || (journey === "owner") === isOwnerOpportunity(item.type));
}

/** Counts the same records the list can display, across every outcome. */
export function opportunityListSummary(opportunities: readonly { stage: OpportunityStage }[]) {
  const counts = { total: opportunities.length, open: 0, won: 0, lost: 0 };
  for (const item of opportunities) counts[item.stage === "won" || item.stage === "lost" ? item.stage : "open"]++;
  return counts;
}
