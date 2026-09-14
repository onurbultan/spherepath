import { istanbulDayKey } from "./build-overview.js";
import type { TodayTask } from "./build-overview.js";

/**
 * The plan says what to do; it never said when the week fills up. An advisor
 * looking at five ranked lines cannot see that Thursday already holds four
 * appointments and Friday nothing, which is the question they are actually
 * asking when they ask to see their calendar.
 *
 * Nothing new is stored for this. Every piece of work already carries the
 * moment it is due; this only arranges what exists by the day it falls on.
 */

export interface PlannerDay {
  dayKey: string;
  /** Midnight Istanbul, as the instant the column starts. */
  startsAt: number;
  isToday: boolean;
  isPast: boolean;
  tasks: TodayTask[];
}

export interface PlannerWeek {
  days: PlannerDay[];
  /** Work whose day has passed and which nobody has closed. */
  overdue: TodayTask[];
  startsAt: number;
  endsAt: number;
}

const dayMs = 86_400_000;

/** Türkiye is UTC+3 year-round, so a day starts three hours before UTC midnight. */
const istanbulOffsetMs = 3 * 60 * 60 * 1_000;

/** Midnight in Istanbul for the day this instant falls on. */
export function istanbulDayStart(at: number): number {
  return Math.floor((at + istanbulOffsetMs) / dayMs) * dayMs - istanbulOffsetMs;
}

/** Monday of the week this instant falls in, which is how a work week reads here. */
export function istanbulWeekStart(at: number): number {
  const dayStart = istanbulDayStart(at);
  // 1970-01-01 was a Thursday, which is index 3 in a Monday-first week, so the
  // modulo lands on Monday after shifting by three days.
  const weekday = Math.floor((dayStart + istanbulOffsetMs + 3 * dayMs) / dayMs) % 7;
  return dayStart - weekday * dayMs;
}

/**
 * Arranges the work into the seven days of one week. A task with no date
 * belongs to no day and is left out rather than guessed into one.
 *
 * Work inside the week stays in its own column, late or not -- a Monday the
 * advisor is looking at on Tuesday should still show what Monday held, or the
 * week stops being a record of itself. The separate pile is for work from
 * before the week began, which has no column here and would otherwise vanish.
 */
export function buildPlannerWeek(
  tasks: readonly TodayTask[],
  weekStart: number,
  now: number,
): PlannerWeek {
  const todayKey = istanbulDayKey(now);
  const endsAt = weekStart + 7 * dayMs;
  const days: PlannerDay[] = Array.from({ length: 7 }, (_, index) => {
    const startsAt = weekStart + index * dayMs;
    const dayKey = istanbulDayKey(startsAt);
    return { dayKey, startsAt, isToday: dayKey === todayKey, isPast: dayKey < todayKey, tasks: [] };
  });
  const byKey = new Map(days.map((day) => [day.dayKey, day]));

  const overdue: TodayTask[] = [];
  for (const task of tasks) {
    if (task.dueAt === null) continue;
    if (task.resolutionStatus) continue;
    if (task.dueAt < weekStart) {
      overdue.push(task);
      continue;
    }
    byKey.get(istanbulDayKey(task.dueAt))?.tasks.push(task);
  }

  for (const day of days) {
    day.tasks.sort((left, right) => (left.dueAt ?? 0) - (right.dueAt ?? 0) || left.id.localeCompare(right.id));
  }
  overdue.sort((left, right) => (left.dueAt ?? 0) - (right.dueAt ?? 0) || left.id.localeCompare(right.id));

  return { days, overdue, startsAt: weekStart, endsAt };
}

/** "15 – 21 Eylül", the way a week is named out loud. */
export function plannerWeekLabel(week: PlannerWeek): string {
  const start = new Date(week.startsAt);
  const end = new Date(week.endsAt - dayMs);
  const day = new Intl.DateTimeFormat("tr-TR", { day: "numeric", timeZone: "Europe/Istanbul" });
  const month = new Intl.DateTimeFormat("tr-TR", { month: "long", timeZone: "Europe/Istanbul" });
  const year = new Intl.DateTimeFormat("tr-TR", { year: "numeric", timeZone: "Europe/Istanbul" });
  const sameMonth = month.format(start) === month.format(end);
  return sameMonth
    ? `${day.format(start)} – ${day.format(end)} ${month.format(end)} ${year.format(end)}`
    : `${day.format(start)} ${month.format(start)} – ${day.format(end)} ${month.format(end)} ${year.format(end)}`;
}

/** The clock time a task sits at, for the row it is drawn on. */
export function taskTimeLabel(task: TodayTask): string {
  if (task.dueAt === null) return "";
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(task.dueAt);
}
