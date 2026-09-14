import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  apiQueryKeys,
  buildPlannerWeek,
  dailyTaskQueryKeys,
  istanbulWeekStart,
  nextActionTypeLabels,
  plannerWeekLabel,
  taskTimeLabel,
  weekdayLabels,
  type DailyTaskOutcome,
  type TodayTask,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";
import { finishDailyTask, loadTodayOverview } from "../resources/today";
import { TaskResolutionSheet } from "../components/TaskResolutionSheet";

const dayMs = 86_400_000;
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Takvim yüklenemedi.";

/**
 * The week the advisor is standing in. The plan says what to do next; it never
 * said that Thursday already holds four appointments and Friday nothing.
 *
 * Nothing new is stored for this: every piece of work already carries the
 * moment it is due, and moving one is the same reschedule the plan has always
 * offered -- reached here from the day it sits on. A phone reads a week down
 * the page rather than across it, so the days are stacked.
 */
export function PlannerView() {
  const theme = useSpTheme();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [now] = useState(() => Date.now());
  const [weekStart, setWeekStart] = useState(() => istanbulWeekStart(Date.now()));
  const [resolving, setResolving] = useState<TodayTask | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: apiQueryKeys.todayOverviewPeriod("30d"),
    queryFn: () => loadTodayOverview("30d"),
    enabled: Boolean(session),
  });

  const week = buildPlannerWeek(overview.data?.allTasks ?? [], weekStart, now);
  const total = week.days.reduce((count, day) => count + day.tasks.length, 0);

  async function resolve(outcome: DailyTaskOutcome) {
    if (!session) return;
    setPending(true); setError(null);
    try {
      await finishDailyTask(session, outcome);
      await Promise.all(dailyTaskQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      setResolving(null);
    } catch (next) { setError(messageFrom(next)); }
    finally { setPending(false); }
  }

  function taskRow(task: TodayTask) {
    const tone = task.priority === "overdue" ? theme.ask : task.priority === "bottleneck" ? theme.deed : theme.line;
    return (
      <Pressable key={task.id} onPress={() => { setError(null); setResolving(task); }} style={[styles.task, { borderLeftColor: tone }]}>
        <SpText variant="caption" color="secondary">{taskTimeLabel(task)}</SpText>
        <View style={styles.flex}>
          <SpText variant="bodySmall">{task.title}</SpText>
          <SpText variant="caption" color="secondary">{task.actionType ? nextActionTypeLabels[task.actionType] : task.reason}</SpText>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <SpText variant="caption" color="secondary">TAKVİM</SpText>
            <SpText variant="title">{plannerWeekLabel(week)}</SpText>
            <SpText variant="caption" color="secondary">
              {total ? `Bu hafta ${total} iş planlı.` : "Bu haftaya planlanmış iş yok."}
              {week.overdue.length ? ` Önceki haftalardan ${week.overdue.length} iş bekliyor.` : ""}
            </SpText>
          </View>
        </View>

        <View style={styles.nav}>
          <Pressable accessibilityLabel="Önceki hafta" hitSlop={8} onPress={() => setWeekStart((start) => start - 7 * dayMs)}>
            <ChevronLeft color={theme.textSecondary} size={20} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setWeekStart(istanbulWeekStart(now))}>
            <SpText variant="bodySmall" color="deed">Bu hafta</SpText>
          </Pressable>
          <Pressable accessibilityLabel="Sonraki hafta" hitSlop={8} onPress={() => setWeekStart((start) => start + 7 * dayMs)}>
            <ChevronRight color={theme.textSecondary} size={20} />
          </Pressable>
        </View>

        {week.overdue.length ? (
          <SpCard style={styles.card}>
            <SpText variant="caption" color="secondary">ÖNCEKİ HAFTALARDAN</SpText>
            <SpText variant="title">{week.overdue.length} iş hâlâ açık</SpText>
            {week.overdue.map(taskRow)}
          </SpCard>
        ) : null}

        {week.days.map((day, index) => (
          <SpCard key={day.dayKey} style={{ ...styles.card, ...(day.isToday ? { borderColor: theme.deed, borderWidth: 1 } : {}), ...(day.isPast ? styles.past : {}) }}>
            <View style={styles.dayHeading}>
              <SpText variant="caption" color="secondary">{weekdayLabels[index]}</SpText>
              <SpText variant="title">{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" }).format(day.startsAt)}</SpText>
              {day.tasks.length ? <SpText variant="caption" color="secondary">{day.tasks.length} iş</SpText> : null}
            </View>
            {day.tasks.length ? day.tasks.map(taskRow) : <SpText variant="bodySmall" color="secondary">Planlanmış iş yok.</SpText>}
          </SpCard>
        ))}

        <Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/note" as never)} style={styles.foot}>
          <CalendarClock color={theme.textSecondary} size={15} />
          <SpText variant="bodySmall" color="secondary">Bir işe dokunup tamamlayabilir veya başka bir güne alabilirsin.</SpText>
        </Pressable>
        {error ? <SpText accessibilityRole="alert" color="ask" variant="bodySmall">{error}</SpText> : null}
      </ScrollView>

      <TaskResolutionSheet
        task={resolving}
        pending={pending}
        error={error}
        onClose={() => setResolving(null)}
        onResolve={(outcome) => void resolve(outcome)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { gap: space.md, padding: space.lg },
  header: { flexDirection: "row", gap: space.md },
  flex: { flex: 1, gap: 2 },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  card: { gap: space.sm },
  past: { opacity: 0.72 },
  dayHeading: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  task: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingVertical: space.sm, paddingLeft: space.sm, borderLeftWidth: 3, borderRadius: radius.sm },
  foot: { flexDirection: "row", alignItems: "center", gap: space.xs },
});
