import type { OpportunityStage } from "../domain/entities.js";

export const allowedOpportunityTransitions: Readonly<Record<OpportunityStage, readonly OpportunityStage[]>> = {
  new_lead: ["first_contact", "lost"],
  first_contact: ["appointment", "lost"],
  appointment: ["valuation", "lost"],
  valuation: ["mandate_offer", "lost"],
  mandate_offer: ["won", "lost"],
  won: [],
  lost: ["first_contact"],
};

export function canTransitionOpportunity(
  from: OpportunityStage,
  to: OpportunityStage,
): boolean {
  return allowedOpportunityTransitions[from].includes(to);
}

export function nextOpportunityStages(from: OpportunityStage): readonly OpportunityStage[] {
  return allowedOpportunityTransitions[from];
}

export function assertOpportunityTransition(
  from: OpportunityStage,
  to: OpportunityStage,
): void {
  if (!canTransitionOpportunity(from, to)) {
    throw new Error(`Invalid opportunity transition: ${from} -> ${to}`);
  }
}
