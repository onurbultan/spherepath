import { describe, expect, it } from "vitest";
import { buildTodayOverview, istanbulDayKey, mergeContactTasks, notePageTasks, portfolioChaseTasks, type TodayTask } from "./build-overview.js";
import { buildPlannerWeek, istanbulDayStart, istanbulWeekStart, taskTimeLabel } from "./week-view.js";

/** Tuesday 15 September 2026, 14:00 Istanbul. */
const now = Date.parse("2026-09-15T11:00:00.000Z");
const at = (iso: string) => Date.parse(iso);
const dayMs = 86_400_000;
const task = (id: string, dueAt: number | null, extra: Partial<TodayTask> = {}): TodayTask => ({
  id, contactId: "c1", title: id, reason: "", dueAt, type: "next_action", priority: "relationship", ...extra,
});

describe("finding the week an advisor is standing in", () => {
  it("starts the week on Monday", () => {
    expect(istanbulDayKey(istanbulWeekStart(now))).toBe("2026-09-14");
  });

  it("keeps Sunday in the week that began the Monday before it", () => {
    expect(istanbulDayKey(istanbulWeekStart(at("2026-09-20T20:00:00.000Z")))).toBe("2026-09-14");
  });

  it("puts a late-evening instant on the day the advisor calls it", () => {
    // 22:00 Istanbul on the 15th is 19:00 UTC; a UTC-based day would call it the 15th too,
    // but 01:00 Istanbul on the 16th is 22:00 UTC on the 15th and must not be.
    expect(istanbulDayKey(istanbulDayStart(at("2026-09-15T22:00:00.000Z")))).toBe("2026-09-16");
  });
});

describe("arranging the week", () => {
  const week = buildPlannerWeek([
    task("mon", at("2026-09-14T07:00:00.000Z")),
    task("tue-late", at("2026-09-15T13:00:00.000Z")),
    task("tue-early", at("2026-09-15T12:00:00.000Z")),
    task("thu", at("2026-09-17T07:00:00.000Z")),
    task("undated", null),
    task("last-week", at("2026-09-09T07:00:00.000Z")),
    task("closed", at("2026-09-08T07:00:00.000Z"), { resolutionStatus: "completed" }),
  ], istanbulWeekStart(now), now);

  it("lays out seven days", () => {
    expect(week.days).toHaveLength(7);
    expect(week.days[0]?.dayKey).toBe("2026-09-14");
    expect(week.days[6]?.dayKey).toBe("2026-09-20");
  });

  it("orders a day by the clock", () => {
    expect(week.days[1]?.tasks.map((entry) => entry.id)).toEqual(["tue-early", "tue-late"]);
  });

  it("marks today and the days already gone", () => {
    expect(week.days[1]?.isToday).toBe(true);
    expect(week.days[0]?.isPast).toBe(true);
    expect(week.days[3]?.isPast).toBe(false);
  });

  it("keeps a day earlier this week in its own column, late or not", () => {
    // Looking at Monday on Tuesday, Monday should still show what it held, or
    // the week stops being a record of itself.
    expect(week.days[0]?.tasks.map((entry) => entry.id)).toEqual(["mon"]);
  });

  it("gathers work from before the week, which has no column here", () => {
    expect(week.overdue.map((entry) => entry.id)).toEqual(["last-week"]);
    expect(week.days.flatMap((day) => day.tasks).map((entry) => entry.id)).not.toContain("last-week");
  });

  it("leaves work with no date out rather than guessing a day for it", () => {
    expect(week.days.flatMap((day) => day.tasks).map((entry) => entry.id)).not.toContain("undated");
    expect(week.overdue.map((entry) => entry.id)).not.toContain("undated");
  });

  it("does not bring back work that was already closed", () => {
    expect(week.overdue.map((entry) => entry.id)).not.toContain("closed");
  });

  it("reads the clock in Istanbul, not the machine's timezone", () => {
    expect(taskTimeLabel(task("x", at("2026-09-15T07:30:00.000Z")))).toBe("10:30");
  });
});

describe("a page of notes nobody decided about", () => {
  const page = (id: string, dayKey: string, pendingCount: number) => ({
    id, dayKey, createdAt: Date.parse(`${dayKey}T09:00:00.000Z`), pendingCount, linkedContactId: null,
  });

  it("asks about a page from a day that has passed", () => {
    const tasks = notePageTasks([page("n1", "2026-09-14", 4)], now);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ type: "process_note", inboxItemId: "n1", reason: "4 satır karar bekliyor", priority: "overdue" });
  });

  it("leaves today's page alone, because it is still being written", () => {
    expect(notePageTasks([page("n2", "2026-09-15", 9)], now)).toEqual([]);
  });

  it("says nothing about a page whose every line was decided", () => {
    expect(notePageTasks([page("n3", "2026-09-10", 0)], now)).toEqual([]);
  });
});

describe("what a calendar is given, against what a plan shows", () => {
  const contacts = [
    { id: "c1", name: "A", createdAt: 0, meaningfulTouchCount: 1, lastTouchAt: now - dayMs, nextActionAt: at("2026-09-17T07:00:00.000Z"), nextActionType: "call" as const, roles: [], deletedAt: null },
    { id: "c2", name: "B", createdAt: 0, meaningfulTouchCount: 1, lastTouchAt: now - dayMs, nextActionAt: at("2026-09-18T07:00:00.000Z"), nextActionType: "call" as const, roles: [], deletedAt: null },
  ];

  it("carries work that falls after today, which the plan's lists stop before", () => {
    const overview = buildTodayOverview(contacts, [], now);
    expect(overview.allTasks.map((task) => task.contactId)).not.toContain("c1");
    expect(overview.scheduledTasks.map((task) => task.contactId)).toEqual(expect.arrayContaining(["c1", "c2"]));
  });

  it("puts that work on the day it is due", () => {
    const week = buildPlannerWeek(buildTodayOverview(contacts, [], now).scheduledTasks, istanbulWeekStart(now), now);
    expect(week.days[3]?.tasks.map((task) => task.contactId)).toEqual(["c1"]);
    expect(week.days[4]?.tasks.map((task) => task.contactId)).toEqual(["c2"]);
  });
});

describe("work the advisor has already touched today", () => {
  const week = (status: TodayTask["resolutionStatus"]) => buildPlannerWeek(
    [task("t", at("2026-09-16T09:00:00.000Z"), { resolutionStatus: status })],
    istanbulWeekStart(now),
    now,
  );

  it("keeps work that was moved, on the day it was moved to", () => {
    // Rescheduling stamps today's task for the rest of the day; dropping every
    // stamped task took the moved work off the very day it had moved to.
    expect(week("rescheduled").days[2]?.tasks.map((entry) => entry.id)).toEqual(["t"]);
  });

  it("keeps work that was skipped, because skipping does not do it", () => {
    expect(week("skipped").days[2]?.tasks.map((entry) => entry.id)).toEqual(["t"]);
  });

  it("takes finished work off the calendar", () => {
    expect(week("completed").days[2]?.tasks).toEqual([]);
    expect(week("contact_opt_out").days[2]?.tasks).toEqual([]);
  });
});

describe("a rumour nobody has chased", () => {
  const lead = (id: string, ageDays: number, verificationStatus: "hearsay" | "owner_contacted" | "verified" = "hearsay") => ({
    id, headline: "1+1 daire", location: "Yaka Mahallesi",
    createdAt: now - ageDays * 86_400_000, verificationStatus,
  });

  it("asks about a rumour that has sat for days", () => {
    const tasks = portfolioChaseTasks([lead("p1", 3)], now);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ type: "chase_portfolio", portfolioItemId: "p1", priority: "bottleneck" });
    expect(tasks[0]?.reason).toContain("duyum");
  });

  it("leaves this morning's rumour alone, because the advisor may already be on it", () => {
    expect(portfolioChaseTasks([lead("p2", 0)], now)).toEqual([]);
  });

  it("stops asking about one nobody chased for a fortnight", () => {
    expect(portfolioChaseTasks([lead("p3", 30)], now)).toEqual([]);
  });

  it("says nothing about a row that was verified", () => {
    expect(portfolioChaseTasks([lead("p4", 5, "verified")], now)).toEqual([]);
  });

  it("still asks when the owner was reached but the mandate did not land", () => {
    const tasks = portfolioChaseTasks([lead("p5", 5, "owner_contacted")], now);
    expect(tasks[0]?.reason).toContain("yetki netleşmedi");
  });
});

describe("work that belongs to no contact", () => {
  it("keeps every undecided page, instead of collapsing them into one line", () => {
    const pages = notePageTasks([
      { id: "page-1", dayKey: "2026-09-13", createdAt: at("2026-09-13T09:00:00.000Z"), pendingCount: 3, linkedContactId: null },
      { id: "page-2", dayKey: "2026-09-14", createdAt: at("2026-09-14T09:00:00.000Z"), pendingCount: 2, linkedContactId: null },
    ], now);

    expect(mergeContactTasks(pages).map((entry) => entry.inboxItemId)).toEqual(["page-1", "page-2"]);
  });

  it("keeps every rumour, for the same reason", () => {
    const leads = portfolioChaseTasks([
      { id: "pool-1", headline: "1+1 daire", location: "Yaka", createdAt: now - 4 * dayMs, verificationStatus: "hearsay" },
      { id: "pool-2", headline: "3+1 villa", location: "Urla", createdAt: now - 5 * dayMs, verificationStatus: "hearsay" },
    ], now);

    expect(mergeContactTasks(leads).map((entry) => entry.portfolioItemId)).toEqual(["pool-1", "pool-2"]);
  });

  it("still gives one person a single line when several things are due for them", () => {
    const merged = mergeContactTasks([
      task("t1", now - dayMs, { priorityScore: 10 }),
      task("t2", now, { priorityScore: 40 }),
    ]);

    expect(merged.map((entry) => entry.id)).toEqual(["t2"]);
  });
});
