import { inboxReviewCopy, type VoicePropertyPreferences } from "@spherepath/shared";
import { SpInput } from "@/shared/ui/SpField";

export function RequirementMeasurements({ preferences, onChange }: {
  preferences: VoicePropertyPreferences;
  onChange(preferences: VoicePropertyPreferences): void;
}) {
  function updateBudget(bound: "min" | "max", value: string) {
    const range = { min: preferences.budgetRange?.min ?? null, max: preferences.budgetRange?.max ?? null, currency: preferences.budgetRange?.currency ?? "TRY", [bound]: value ? Number(value) : null };
    onChange({ ...preferences, budgetRange: range.min === null && range.max === null ? null : range });
  }
  return <>
    <div className="form-row">
      <label>{inboxReviewCopy.budgetMin}<SpInput type="number" min="0" value={preferences.budgetRange?.min ?? ""} onChange={(event) => updateBudget("min", event.target.value)} /></label>
      <label>{inboxReviewCopy.budgetMax}<SpInput type="number" min="0" value={preferences.budgetRange?.max ?? ""} onChange={(event) => updateBudget("max", event.target.value)} /></label>
    </div>
    <div className="form-row">
      <label>{inboxReviewCopy.areaMin}<SpInput type="number" min="0" value={preferences.areaMinM2 ?? ""} onChange={(event) => onChange({ ...preferences, areaMinM2: event.target.value ? Number(event.target.value) : null })} /></label>
      <label>{inboxReviewCopy.areaMax}<SpInput type="number" min="0" value={preferences.areaMaxM2 ?? ""} onChange={(event) => onChange({ ...preferences, areaMaxM2: event.target.value ? Number(event.target.value) : null })} /></label>
    </div>
  </>;
}
