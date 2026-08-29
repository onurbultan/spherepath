"use client";

function localDateTime(days: number, hour = 10): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const presets = [
  { label: "Yarın sabah", days: 1, hour: 10 },
  { label: "Gelecek hafta", days: 7, hour: 10 },
  { label: "2 hafta", days: 14, hour: 10 },
  { label: "1 ay", days: 30, hour: 10 },
] as const;

export function QuickDateField({ value, onChange, label = "Sonraki adım", required = true, disabled = false }: { value: string; onChange(value: string): void; label?: string; required?: boolean; disabled?: boolean }) {
  return <div className="quick-date-field"><label>{label}<input disabled={disabled} min={localDateTime(0, new Date().getHours())} required={required} type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} /></label><div className="quick-date-options" aria-label="Hızlı tarih seçenekleri">{presets.map((preset) => <button disabled={disabled} key={preset.label} type="button" onClick={() => onChange(localDateTime(preset.days, preset.hour))}>{preset.label}</button>)}</div></div>;
}
