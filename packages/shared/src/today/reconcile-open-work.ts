import type { NextActionType } from "../domain/entities.js";

export interface OpenActionSnapshot {
  type: NextActionType | null;
  at: number | null;
}

/**
 * Contact and opportunity actions are often mirrors of the same promise. A
 * terminal opportunity may clear the contact action only when that identity is
 * demonstrable; unrelated work for the same person must survive.
 */
export function isMirroredOpenAction(contact: OpenActionSnapshot, opportunity: OpenActionSnapshot): boolean {
  return contact.type !== null
    && contact.type === opportunity.type
    && contact.at !== null
    && opportunity.at !== null
    && Math.abs(contact.at - opportunity.at) <= 5 * 60 * 1_000;
}

/**
 * Keep a contact-level reminder aligned while an opportunity owns that exact
 * reminder. Undefined means the contact reminder is unrelated and untouched;
 * a null-valued snapshot deliberately clears a mirrored reminder.
 */
export function reconcileMirroredOpenAction(
  contact: OpenActionSnapshot,
  previousOpportunity: OpenActionSnapshot,
  nextOpportunity: OpenActionSnapshot,
): OpenActionSnapshot | undefined {
  return isMirroredOpenAction(contact, previousOpportunity) ? nextOpportunity : undefined;
}

export function terminalLifecycleClearsOwnerAction(
  entity: "listing" | "deal",
  outcome: string,
): boolean {
  return entity === "listing"
    ? ["sold", "rented", "removed"].includes(outcome)
    : ["closed", "lost"].includes(outcome);
}
