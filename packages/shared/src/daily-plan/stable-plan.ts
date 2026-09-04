import { istanbulDayKey, type TodayTask } from "../today/build-overview.js";

export { istanbulDayKey } from "../today/build-overview.js";

export interface DailyPlanSelection {
  taskIds: string[];
  selectedAt: number;
}

const priorityWeight: Record<TodayTask["priority"], number> = { overdue: 3, bottleneck: 2, relationship: 1 };

export function selectDailyPlanTasks(tasks: readonly TodayTask[], limit = 5, excludedIds: ReadonlySet<string> = new Set()): TodayTask[] {
  const seenContacts = new Set<string>();
  return [...tasks]
    .filter((task) => !excludedIds.has(task.id))
    .sort((left, right) => (right.priorityScore ?? priorityWeight[right.priority]) - (left.priorityScore ?? priorityWeight[left.priority])
      || (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id))
    .filter((task) => {
      if (seenContacts.has(task.contactId)) return false;
      seenContacts.add(task.contactId);
      return true;
    })
    .slice(0, Math.max(0, Math.min(5, Math.floor(limit))));
}

export function topUpDailyPlanTasks(tasks: readonly TodayTask[], currentTaskIds: readonly string[], limit = 5): string[] {
  const normalizedLimit = Math.max(0, Math.min(5, Math.floor(limit)));
  const currentIds = currentTaskIds.slice(0, normalizedLimit);
  if (currentIds.length >= normalizedLimit) return currentIds;
  const currentSet = new Set(currentIds);
  const currentContacts = new Set(tasks.filter((task) => currentSet.has(task.id)).map((task) => task.contactId));
  const additions = selectDailyPlanTasks(
    tasks.filter((task) => !currentContacts.has(task.contactId)),
    normalizedLimit - currentIds.length,
    currentSet,
  );
  return [...currentIds, ...additions.map((task) => task.id)];
}

export function replaceDailyPlanTask(tasks: readonly TodayTask[], currentTaskIds: readonly string[], taskId: string): string[] {
  const index = currentTaskIds.indexOf(taskId);
  if (index < 0) return [...currentTaskIds];
  const selectedTasks = tasks.filter((task) => currentTaskIds.includes(task.id) && task.id !== taskId);
  const selectedContacts = new Set(selectedTasks.map((task) => task.contactId));
  const candidate = selectDailyPlanTasks(tasks.filter((task) => !selectedContacts.has(task.contactId)), 5, new Set(currentTaskIds))[0];
  if (!candidate) return currentTaskIds.filter((id) => id !== taskId);
  const next = [...currentTaskIds];
  next[index] = candidate.id;
  return next;
}
