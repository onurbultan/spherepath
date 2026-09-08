import { opportunityStages, type OpportunityStage } from "@spherepath/shared";

/**
 * A board sorts by stage, which is where a record is. An advisor's day sorts by
 * when they said they would act, which is what they have to do next -- so an
 * untouched record with no agreed action ranks with the late ones rather than
 * disappearing behind the ones that at least have a date.
 */
export type WorkUrgency = "overdue" | "week" | "later";

export const workUrgencyLabels: Record<WorkUrgency, string> = {
  overdue: "Aksiyon gecikti",
  week: "Bu hafta",
  later: "Sonra",
};

const weekMs = 7 * 86_400_000;

export function workUrgency(nextActionAt: number | null, now: number): WorkUrgency {
  if (nextActionAt === null || nextActionAt < now) return "overdue";
  return nextActionAt <= now + weekMs ? "week" : "later";
}

export interface WorkGroup<T> {
  urgency: WorkUrgency;
  items: T[];
}

/**
 * Groups stay in urgency order and rows inside them in due order, with records
 * that carry no agreed date first: those are the ones nothing will remind the
 * advisor about.
 */
export function groupWorkByUrgency<T extends { nextActionAt: number | null; stageEnteredAt: number }>(
  items: readonly T[],
  now: number,
): WorkGroup<T>[] {
  const order: WorkUrgency[] = ["overdue", "week", "later"];
  return order
    .map((urgency) => ({
      urgency,
      items: items
        .filter((item) => workUrgency(item.nextActionAt, now) === urgency)
        .sort((left, right) => {
          if (left.nextActionAt === null && right.nextActionAt !== null) return -1;
          if (left.nextActionAt !== null && right.nextActionAt === null) return 1;
          if (left.nextActionAt !== right.nextActionAt) return (left.nextActionAt ?? 0) - (right.nextActionAt ?? 0);
          return left.stageEnteredAt - right.stageEnteredAt;
        }),
    }))
    .filter((group) => group.items.length > 0);
}

/** The six steps a record walks, without the two ways it can end badly. */
export const workPathStages: OpportunityStage[] = opportunityStages.filter((stage) => stage !== "lost");

/** How far along the path a record is, as a count of completed steps. */
export function workPathProgress(stage: OpportunityStage): number {
  const index = workPathStages.indexOf(stage);
  return index < 0 ? 0 : index + 1;
}
