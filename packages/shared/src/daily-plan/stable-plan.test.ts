import { describe, expect, it } from "vitest";
import type { TodayTask } from "../today/build-overview";
import { istanbulDayKey, replaceDailyPlanTask, selectDailyPlanTasks, topUpDailyPlanTasks } from "./stable-plan";

const task = (id: string, contactId: string, priority: TodayTask["priority"], dueAt: number | null): TodayTask => ({ id, contactId, title: id, reason: id, type: "next_action", priority, dueAt });

describe("stable daily plan", () => {
  const tasks = [task("a", "one", "relationship", null), task("b", "one", "overdue", 1), task("c", "two", "bottleneck", 2), task("d", "three", "relationship", 3)];
  it("selects at most one action per contact", () => expect(selectDailyPlanTasks(tasks).map((item) => item.id)).toEqual(["b", "c", "d"]));
  it("replaces in place without selecting the same contact", () => expect(replaceDailyPlanTask(tasks, ["b", "c"], "c")).toEqual(["b", "d"]));
  it("still hides the task when no replacement is available", () => expect(replaceDailyPlanTask([task("a", "one", "relationship", null)], ["a"], "a")).toEqual([]));
  it("fills empty plan slots without moving existing work", () => expect(topUpDailyPlanTasks(tasks, ["c"])).toEqual(["c", "b", "d"]));
  it("fills a plan that was created before any candidates existed", () => expect(topUpDailyPlanTasks(tasks, [])).toEqual(["b", "c", "d"]));
  it("uses the Istanbul calendar day", () => expect(istanbulDayKey(Date.parse("2026-08-29T21:30:00Z"))).toBe("2026-08-30"));
});
