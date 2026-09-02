"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildCalendarMonth,
  joinDateTimeValue,
  monthOf,
  shiftMonth,
  splitDateTimeValue,
  toDateValue,
  weekdayLabels,
} from "@spherepath/shared";

function localDateTime(days: number, hour = 10): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const futurePresets = [
  { label: "Yarın sabah", days: 1, hour: 10 },
  { label: "Gelecek hafta", days: 7, hour: 10 },
  { label: "2 hafta", days: 14, hour: 10 },
  { label: "1 ay", days: 30, hour: 10 },
] as const;

// Recording the day's conversations in the evening means reaching backwards, not forwards.
const pastPresets = [
  { label: "Az önce", days: 0, hour: null },
  { label: "Bu sabah", days: 0, hour: 9 },
  { label: "Dün öğleden sonra", days: -1, hour: 15 },
  { label: "Dün sabah", days: -1, hour: 9 },
] as const;

function triggerLabel(value: string): string | null {
  const { date, time } = splitDateTimeValue(value);
  if (!date) return null;
  const parsed = new Date(`${date}T${time || "00:00"}`);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
  return time ? `${day} · ${time}` : day;
}

export function QuickDateField({
  value,
  onChange,
  label = "Sonraki adım",
  required = true,
  disabled = false,
  past = false,
}: {
  value: string;
  onChange(value: string): void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  /** Logging what already happened reaches backwards, so the bound flips. */
  past?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { date, time } = splitDateTimeValue(value);
  const today = new Date();
  const todayValue = toDateValue(today);
  const [month, setMonth] = useState(() => monthOf(date || todayValue));
  const presets = past ? pastPresets : futurePresets;
  const calendar = buildCalendarMonth(month, {
    today,
    min: past ? null : todayValue,
    max: past ? todayValue : null,
  });

  // A pointer or key press outside the popover is an event from the document,
  // not state this component owns, so the listener lives in an effect.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(nextDate: string) {
    onChange(joinDateTimeValue(nextDate, time));
    setOpen(false);
  }

  function applyPreset(days: number, hour: number | null) {
    const next = localDateTime(days, hour ?? new Date().getHours());
    onChange(next);
    setMonth(monthOf(splitDateTimeValue(next).date));
  }

  const chosen = triggerLabel(value);

  return (
    <div className="quick-date-field" ref={root}>
      <span className="quick-date-label">{label}</span>
      <div className="quick-date-control">
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          className={`quick-date-trigger${chosen ? "" : " is-empty"}${required && !chosen ? " is-required" : ""}`}
          disabled={disabled}
          onClick={() => { if (!open) setMonth(monthOf(date || todayValue)); setOpen((current) => !current); }}
          type="button"
        >
          <CalendarDays size={16} />
          <span>{chosen ?? "Tarih seç"}</span>
        </button>

        {open ? (
          <div aria-label={label} className="quick-date-popover" role="dialog">
            <div className="quick-date-month">
              <button aria-label="Önceki ay" onClick={() => setMonth(shiftMonth(month, -1))} type="button"><ChevronLeft size={16} /></button>
              <strong>{calendar.label}</strong>
              <button aria-label="Sonraki ay" onClick={() => setMonth(shiftMonth(month, 1))} type="button"><ChevronRight size={16} /></button>
            </div>
            <div aria-hidden className="quick-date-weekdays">
              {weekdayLabels.map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="quick-date-grid">
              {calendar.weeks.flat().map((day) => (
                <button
                  aria-current={day.date === date ? "date" : undefined}
                  className={[
                    "quick-date-day",
                    day.inMonth ? "" : "is-outside",
                    day.isToday ? "is-today" : "",
                    day.date === date ? "is-selected" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={day.disabled}
                  key={day.date}
                  onClick={() => choose(day.date)}
                  type="button"
                >
                  {day.dayOfMonth}
                </button>
              ))}
            </div>
            <label className="quick-date-time">
              Saat
              <input
                onChange={(event) => onChange(joinDateTimeValue(date || todayValue, event.target.value))}
                type="time"
                value={time}
              />
            </label>
          </div>
        ) : null}
      </div>

      <div aria-label="Hızlı tarih seçenekleri" className="quick-date-options">
        {presets.map((preset) => (
          <button disabled={disabled} key={preset.label} onClick={() => applyPreset(preset.days, preset.hour)} type="button">
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
