import { View } from "react-native";
import { inboxReviewCopy, type VoicePropertyPreferences } from "@spherepath/shared";
import { SpField, SpInput } from "@/shared/ui/SpField";
import { space } from "@/shared/ui/tokens.generated";

export function RequirementMeasurements({ preferences, onChange }: {
  preferences: VoicePropertyPreferences;
  onChange(preferences: VoicePropertyPreferences): void;
}) {
  function updateBudget(bound: "min" | "max", value: string) {
    const range = { min: preferences.budgetRange?.min ?? null, max: preferences.budgetRange?.max ?? null, currency: preferences.budgetRange?.currency ?? "TRY", [bound]: value.trim() ? Number(value) : null };
    onChange({ ...preferences, budgetRange: range.min === null && range.max === null ? null : range });
  }
  return <View style={{ gap: space.lg }}>
    <SpField label={inboxReviewCopy.budgetMin}><SpInput accessibilityLabel={inboxReviewCopy.budgetMin} keyboardType="number-pad" value={preferences.budgetRange?.min?.toString() ?? ""} onChangeText={(value) => updateBudget("min", value)} /></SpField>
    <SpField label={inboxReviewCopy.budgetMax}><SpInput accessibilityLabel={inboxReviewCopy.budgetMax} keyboardType="number-pad" value={preferences.budgetRange?.max?.toString() ?? ""} onChangeText={(value) => updateBudget("max", value)} /></SpField>
    <SpField label={inboxReviewCopy.areaMin}><SpInput accessibilityLabel={inboxReviewCopy.areaMin} keyboardType="number-pad" value={preferences.areaMinM2?.toString() ?? ""} onChangeText={(value) => onChange({ ...preferences, areaMinM2: value.trim() ? Number(value) : null })} /></SpField>
    <SpField label={inboxReviewCopy.areaMax}><SpInput accessibilityLabel={inboxReviewCopy.areaMax} keyboardType="number-pad" value={preferences.areaMaxM2?.toString() ?? ""} onChangeText={(value) => onChange({ ...preferences, areaMaxM2: value.trim() ? Number(value) : null })} /></SpField>
  </View>;
}
