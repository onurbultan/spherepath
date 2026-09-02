export interface CalendarDay {
  /** Local calendar date as `YYYY-MM-DD`, which is what a date field carries. */
  date: string;
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  disabled: boolean;
}

export interface CalendarMonth {
  /** First of the month, as `YYYY-MM`. */
  month: string;
  label: string;
  /** Six rows of seven, so the grid never changes height as months are paged. */
  weeks: CalendarDay[][];
}

export const weekdayLabels = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;

const monthNames = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local calendar date, not UTC: a follow-up at 9am belongs to the day the advisor sees. */
export function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // Rejects the 31st of a thirty-day month, which Date would silently roll over.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number) as [number, number];
  const shifted = new Date(year, index - 1 + delta, 1);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}`;
}

export function monthOf(value: string): string {
  return value.slice(0, 7);
}

/**
 * Builds the grid a calendar draws. The week starts on Monday, as it does on a
 * Turkish wall calendar, and the leading and trailing days of the neighbouring
 * months are included so the rows stay whole.
 */
export function buildCalendarMonth(
  month: string,
  { today, min, max }: { today: Date; min?: string | null; max?: string | null } = { today: new Date() },
): CalendarMonth {
  const [year, index] = month.split("-").map(Number) as [number, number];
  const first = new Date(year, index - 1, 1);
  const todayValue = toDateValue(today);

  // getDay() is Sunday-first; Monday-first is one rotation back.
  const leading = (first.getDay() + 6) % 7;
  const start = new Date(year, index - 1, 1 - leading);

  const weeks: CalendarDay[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const days: CalendarDay[] = [];
    for (let day = 0; day < 7; day += 1) {
      const current = new Date(start.getFullYear(), start.getMonth(), start.getDate() + week * 7 + day);
      const value = toDateValue(current);
      days.push({
        date: value,
        dayOfMonth: current.getDate(),
        inMonth: current.getMonth() === index - 1,
        isToday: value === todayValue,
        disabled: Boolean((min && value < min) || (max && value > max)),
      });
    }
    weeks.push(days);
  }

  return { month, label: `${monthNames[index - 1]} ${year}`, weeks };
}

/** Reads the day part of a `YYYY-MM-DDTHH:mm` field without going through Date. */
export function splitDateTimeValue(value: string): { date: string; time: string } {
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

export function joinDateTimeValue(date: string, time: string): string {
  return date ? `${date}T${time || "10:00"}` : "";
}
