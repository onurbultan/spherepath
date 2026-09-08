import type { Contact, Opportunity, NextActionType, Deal } from "../domain/entities.js";
import { nextActionTypeLabels } from "../interactions/manual-interaction.js";
import type { TodayTask } from "../today/build-overview.js";

export interface ContactNextStep {
  id: string;
  opportunityId?: string;
  dealId?: string;
  type: NextActionType;
  at: number | null;
  fromOpportunity: boolean;
}

/** A read summary; the independent contact reminder is never overwritten. */
export function contactNextStep(contact: Pick<Contact, "relationship"> & { id: string }, opportunities: readonly (Pick<Opportunity, "subjectContactId" | "stage" | "nextActionType" | "nextActionAt"> & { id: string })[], deals: readonly (Pick<Deal, "buyerContactId" | "stage" | "nextActionType" | "nextActionAt"> & { id: string })[] = []): ContactNextStep | null {
  const candidates: ContactNextStep[] = opportunities
    .filter((item) => item.subjectContactId === contact.id && item.stage !== "won" && item.stage !== "lost" && item.nextActionType !== null)
    .map((item) => ({ id: `opportunity-action-${item.id}`, opportunityId: item.id, type: item.nextActionType!, at: item.nextActionAt, fromOpportunity: true }));
  for (const deal of deals) if (deal.buyerContactId === contact.id && deal.stage !== "closed" && deal.stage !== "lost" && deal.nextActionType) candidates.unshift({ id: `deal-action-${deal.id}`, dealId: deal.id, type: deal.nextActionType, at: deal.nextActionAt, fromOpportunity: true });
  if (contact.relationship.nextActionType) candidates.push({ id: `next-action-${contact.id}`, type: contact.relationship.nextActionType, at: contact.relationship.nextActionAt, fromOpportunity: false });
  return candidates.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || Number(b.fromOpportunity) - Number(a.fromOpportunity))[0] ?? null;
}

export function taskActionType(task: Pick<TodayTask, "actionType" | "reason" | "type"> | null): NextActionType {
  if (!task?.actionType && task?.reason === "Randevu yap") return "appointment";
  return task?.actionType ?? (Object.entries(nextActionTypeLabels).find(([, label]) => label === task?.reason)?.[0] as NextActionType | undefined) ?? "call";
}

export function localDateTimeValue(value: number): string {
  const date = new Date(value);
  return new Date(value - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
