import { isOwnerOpportunity, type OpportunityType } from "@spherepath/shared";

export type OpportunityJourneyFilter = "owner" | "requirement";

export function opportunitiesForJourney<T extends { type: OpportunityType }>(
  opportunities: readonly T[],
  journey: OpportunityJourneyFilter,
): T[] {
  return opportunities.filter((opportunity) =>
    journey === "owner"
      ? isOwnerOpportunity(opportunity.type)
      : !isOwnerOpportunity(opportunity.type),
  );
}
