import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react-native";
import {
  buildCalendarMonth,
  joinDateTimeValue,
  monthOf,
  shiftMonth,
  splitDateTimeValue,
  toDateValue,
  weekdayLabels,
} from "@spherepath/shared";
import { SpText } from "./SpText";
import { SpButton, SpChoice, SpField } from "./SpField";
import { useSpTheme } from "./theme";
import { hit, radius, space } from "./tokens.generated";

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

/** Whole hours cover nearly every follow-up an advisor actually schedules. */
const hours = Array.from({ length: 15 }, (_, index) => `${String(index + 7).padStart(2, "0")}:00`);

function triggerLabel(value: string): string | null {
  const { date, time } = splitDateTimeValue(value);
  if (!date) return null;
  const parsed = new Date(`${date}T${time || "00:00"}`);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
  return time ? `${day} · ${time}` : day;
}

/**
 * Mobile could only shift a follow-up by whole days -- tomorrow, three days, a
 * week -- so any date outside those steps could not be chosen at all. The
 * presets stay, since they remain the fastest path, and the calendar covers
 * everything else. The month arithmetic is the same code the web build draws.
 */
export function SpDateField({
  value,
  onChange,
  label = "Sonraki adım",
  disabled = false,
  past = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  past?: boolean;
}) {
  const theme = useSpTheme();
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
  const chosen = triggerLabel(value);

  return (
    <SpField label={label}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => { setMonth(monthOf(date || todayValue)); setOpen(true); }}
        style={({ pressed }) => [
          styles.trigger,
          { borderColor: theme.line, backgroundColor: theme.background, opacity: disabled ? .5 : pressed ? .7 : 1 },
        ]}
      >
        <CalendarDays color={theme.textSecondary} size={17} />
        <SpText color={chosen ? "primary" : "secondary"}>{chosen ?? "Tarih seç"}</SpText>
      </Pressable>

      <View style={styles.presets}>
        {presets.map((preset) => (
          <SpChoice
            key={preset.label}
            disabled={disabled}
            label={preset.label}
            onPress={() => onChange(localDateTime(preset.days, preset.hour ?? new Date().getHours()))}
            selected={false}
          />
        ))}
      </View>

      <Modal animationType="slide" onRequestClose={() => setOpen(false)} presentationStyle="pageSheet" visible={open}>
        <SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}>
          <ScrollView contentContainerStyle={styles.sheet}>
            <View style={styles.sheetHeader}>
              <SpText variant="hero">{label}</SpText>
              <Pressable accessibilityLabel="Kapat" onPress={() => setOpen(false)} style={[styles.close, { borderColor: theme.line }]}>
                <X color={theme.textSecondary} size={20} />
              </Pressable>
            </View>

            <View style={styles.monthRow}>
              <Pressable accessibilityLabel="Önceki ay" onPress={() => setMonth(shiftMonth(month, -1))} style={[styles.monthButton, { borderColor: theme.line }]}>
                <ChevronLeft color={theme.textSecondary} size={18} />
              </Pressable>
              <SpText variant="title">{calendar.label}</SpText>
              <Pressable accessibilityLabel="Sonraki ay" onPress={() => setMonth(shiftMonth(month, 1))} style={[styles.monthButton, { borderColor: theme.line }]}>
                <ChevronRight color={theme.textSecondary} size={18} />
              </Pressable>
            </View>

            <View style={styles.grid}>
              {weekdayLabels.map((weekday) => (
                <View key={weekday} style={styles.cell}>
                  <SpText variant="caption" color="secondary">{weekday}</SpText>
                </View>
              ))}
              {calendar.weeks.flat().map((day) => {
                const selected = day.date === date;
                return (
                  <Pressable
                    accessibilityLabel={day.date}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: day.disabled }}
                    disabled={day.disabled}
                    key={day.date}
                    onPress={() => onChange(joinDateTimeValue(day.date, time))}
                    style={[
                      styles.cell,
                      styles.day,
                      selected ? { backgroundColor: theme.deed } : null,
                      day.isToday && !selected ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.lineStrong } : null,
                      { opacity: day.disabled ? .3 : day.inMonth ? 1 : .45 },
                    ]}
                  >
                    <SpText variant="bodySmall" style={selected ? { color: theme.onDeed, fontWeight: "700" } : undefined}>
                      {day.dayOfMonth}
                    </SpText>
                  </Pressable>
                );
              })}
            </View>

            <SpField label="Saat">
              <View style={styles.hours}>
                {hours.map((item) => (
                  <SpChoice
                    key={item}
                    label={item}
                    onPress={() => onChange(joinDateTimeValue(date || todayValue, item))}
                    selected={time === item}
                  />
                ))}
              </View>
            </SpField>

            <SpButton disabled={!date} label="Tamam" onPress={() => setOpen(false)} size="lg" />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SpField>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: hit.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  safe: { flex: 1 },
  sheet: { padding: space.xl, paddingBottom: space["5xl"], gap: space.lg },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  close: { width: 40, height: 40, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  monthButton: { width: 36, height: 36, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, alignItems: "center", justifyContent: "center", paddingVertical: space.sm },
  day: { minHeight: 44, borderRadius: radius.sm },
  hours: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
