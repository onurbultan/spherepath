import { describe, expect, it } from "vitest";
import {
  buildCalendarMonth,
  fromDateValue,
  joinDateTimeValue,
  monthOf,
  shiftMonth,
  splitDateTimeValue,
  toDateValue,
} from "./calendar-month.js";

const today = new Date(2026, 8, 2); // 2 Eylül 2026

describe("buildCalendarMonth", () => {
  it("always draws six whole weeks so the grid never changes height", () => {
    for (const month of ["2026-02", "2026-08", "2026-09", "2027-01"]) {
      const built = buildCalendarMonth(month, { today });
      expect(built.weeks).toHaveLength(6);
      expect(built.weeks.every((week) => week.length === 7)).toBe(true);
    }
  });

  it("starts the week on Monday", () => {
    // 1 September 2026 is a Tuesday, so Monday the 31st of August leads the grid.
    const built = buildCalendarMonth("2026-09", { today });
    expect(built.weeks[0]![0]!.date).toBe("2026-08-31");
    expect(built.weeks[0]![0]!.inMonth).toBe(false);
    expect(built.weeks[0]![1]!.date).toBe("2026-09-01");
    expect(built.weeks[0]![1]!.inMonth).toBe(true);
  });

  it("names the month in Turkish and marks today", () => {
    const built = buildCalendarMonth("2026-09", { today });
    expect(built.label).toBe("Eylül 2026");
    expect(built.weeks.flat().find((day) => day.isToday)?.date).toBe("2026-09-02");
  });

  it("disables the days a bound rules out", () => {
    const built = buildCalendarMonth("2026-09", { today, min: "2026-09-02" });
    const days = built.weeks.flat();
    expect(days.find((day) => day.date === "2026-09-01")?.disabled).toBe(true);
    expect(days.find((day) => day.date === "2026-09-02")?.disabled).toBe(false);
  });
});

describe("date values", () => {
  it("reads and writes the local calendar day, not UTC", () => {
    expect(toDateValue(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(fromDateValue("2026-01-01")?.getDate()).toBe(1);
  });

  it("rejects a day the month does not have", () => {
    expect(fromDateValue("2026-02-30")).toBeNull();
    expect(fromDateValue("bugün")).toBeNull();
  });

  it("pages across a year boundary", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthOf("2026-09-02")).toBe("2026-09");
  });

  it("splits and rejoins a datetime field", () => {
    expect(splitDateTimeValue("2026-09-02T14:30")).toEqual({ date: "2026-09-02", time: "14:30" });
    expect(joinDateTimeValue("2026-09-02", "14:30")).toBe("2026-09-02T14:30");
    // A date chosen with no time yet still needs a sensible hour.
    expect(joinDateTimeValue("2026-09-02", "")).toBe("2026-09-02T10:00");
    expect(joinDateTimeValue("", "14:30")).toBe("");
  });
});
