import { describe, expect, it } from "vitest";
import { groupWorkByUrgency, workPathProgress, workPathStages, workUrgency } from "./work-queue";

const now = Date.UTC(2026, 8, 7, 9, 0, 0);
const day = 86_400_000;

describe("workUrgency", () => {
  it("treats a record with no agreed action as late rather than distant", () => {
    expect(workUrgency(null, now)).toBe("overdue");
  });

  it("separates a passed date from one inside the week", () => {
    expect(workUrgency(now - 1, now)).toBe("overdue");
    expect(workUrgency(now + day, now)).toBe("week");
    expect(workUrgency(now + 7 * day, now)).toBe("week");
    expect(workUrgency(now + 7 * day + 1, now)).toBe("later");
  });
});

describe("groupWorkByUrgency", () => {
  const item = (id: string, nextActionAt: number | null, stageEnteredAt = now) => ({ id, nextActionAt, stageEnteredAt });

  it("puts undated records ahead of dated ones inside the late group", () => {
    const groups = groupWorkByUrgency([item("dated", now - day), item("undated", null)], now);
    expect(groups[0]?.urgency).toBe("overdue");
    expect(groups[0]?.items.map((entry) => entry.id)).toEqual(["undated", "dated"]);
  });

  it("orders each group by when the advisor said they would act", () => {
    const groups = groupWorkByUrgency([item("late", now + 5 * day), item("soon", now + day)], now);
    expect(groups[0]?.items.map((entry) => entry.id)).toEqual(["soon", "late"]);
  });

  it("breaks a tie with the record that has waited longest in its stage", () => {
    const groups = groupWorkByUrgency([item("fresh", now + day, now), item("stale", now + day, now - 10 * day)], now);
    expect(groups[0]?.items.map((entry) => entry.id)).toEqual(["stale", "fresh"]);
  });

  it("drops empty groups so the list never shows a heading over nothing", () => {
    expect(groupWorkByUrgency([item("only", now + day)], now).map((group) => group.urgency)).toEqual(["week"]);
  });
});

describe("workPathProgress", () => {
  it("walks the six steps a record can reach without the lost ending", () => {
    expect(workPathStages).toEqual(["new_lead", "first_contact", "appointment", "valuation", "mandate_offer", "won"]);
    expect(workPathProgress("new_lead")).toBe(1);
    expect(workPathProgress("won")).toBe(6);
  });

  it("shows no progress for a record that ended without a result", () => {
    expect(workPathProgress("lost")).toBe(0);
  });
});
