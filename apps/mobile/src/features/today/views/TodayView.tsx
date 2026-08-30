import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { CalendarCheck, Check, RefreshCw, Settings, Target } from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys, reportingPeriodLabels, reportingPeriods, type DailyTaskOutcome, type ReportingPeriod, type TodayTask } from "@spherepath/shared";
import { SafeAreaView } from "react-native-safe-area-context";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import { TaskResolutionSheet, taskRecordRoute } from "../components/TaskResolutionSheet";
import { finishDailyTask, loadTodayOverview } from "../resources/today";
import { useSession } from "@/features/auth/resources/session";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "İşlem tamamlanamadı.";

export default function TodayView() {
  const theme = useSpTheme(); const { session } = useSession(); const queryClient = useQueryClient();
  const [period, setPeriod] = useState<ReportingPeriod>("30d"); const [activeTask, setActiveTask] = useState<TodayTask | null>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: apiQueryKeys.todayOverviewPeriod(period), queryFn: () => loadTodayOverview(period) }); const refetch = query.refetch;
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  const stages = query.data ? [{ label: "Tanışma", value: query.data.stages.acquaintance }, { label: "Görüşme", value: query.data.stages.relationship }, { label: "Talep", value: query.data.stages.lead }, { label: "Portföy", value: query.data.stages.listing }, { label: "Kapama", value: query.data.stages.closing }] : [];

  function openTask(task: TodayTask) { setActiveTask(task); setError(null); }
  async function resolveTask(outcome: DailyTaskOutcome) {
    if (!session) return;
    setPending(true); setError(null);
    try { await finishDailyTask(session, outcome); setActiveTask(null); await queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }); } catch (nextError) { setError(messageFrom(nextError)); } finally { setPending(false); }
  }

  const focusRoute = query.data?.focus.targetOpportunityId
    ? `/(tabs)/opportunities?opportunityId=${encodeURIComponent(query.data.focus.targetOpportunityId)}`
    : query.data?.focus.targetContactId
      ? `/(tabs)/capture?contactId=${encodeURIComponent(query.data.focus.targetContactId)}`
      : query.data?.stages.acquaintance === 0
        ? "/(tabs)/contacts"
        : "/(tabs)/opportunities";

  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.headerRow}><View style={styles.header}><SpText variant="eyebrow" color="deed">BUGÜN</SpText><SpText variant="hero">Bugünün odağı</SpText><SpText color="secondary">Kayıtlı sonraki adımlarından hazırlanan çalışma planı.</SpText></View><View style={styles.headerActions}><Pressable accessibilityLabel="Ayarlar" onPress={() => router.push("/(tabs)/settings")} style={[styles.refresh, { borderColor: theme.line }]}><Settings color={theme.textSecondary} size={19} /></Pressable><Pressable accessibilityLabel="Yenile" onPress={() => void query.refetch()} style={[styles.refresh, { borderColor: theme.line }]}><RefreshCw color={theme.textSecondary} size={19} /></Pressable></View></View>
    {query.isPending ? <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Bugün görünümü hazırlanıyor…</SpText></View> : query.error ? <SpCard style={styles.state}><SpText variant="title">Görünüm yüklenemedi</SpText><SpText color="secondary">{messageFrom(query.error)}</SpText></SpCard> : query.data ? <>
      {query.data.stages.acquaintance === 0 ? <SpCard style={styles.detailCard}><SpText variant="eyebrow" color="deed">3 ADIMDA BAŞLA</SpText><SpText variant="title">Çalışma alanını hazırla</SpText><SpText color="secondary">Önce bölgeni ve hedefini ayarla, ardından ilk kişini ekle.</SpText><View style={styles.options}><Pressable onPress={() => router.push("/(tabs)/settings")} style={[styles.complete, { borderColor: theme.line, flex: 1 }]}><SpText variant="bodySmall">1 · Bölge ve hedef</SpText></Pressable><Pressable onPress={() => router.push("/(tabs)/contacts")} style={[styles.complete, { borderColor: theme.line, flex: 1 }]}><SpText variant="bodySmall">2 · İlk kişi</SpText></Pressable></View></SpCard> : null}
      <SpText variant="title">İş akışının özeti</SpText><View accessibilityLabel="Ölçüm dönemi" accessibilityRole="radiogroup" style={styles.periodChoices}>{reportingPeriods.map((item) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: period === item }} key={item} onPress={() => setPeriod(item)} style={[styles.period, { backgroundColor: period === item ? theme.deedBg : theme.card, borderColor: period === item ? theme.deed : theme.line }]}><SpText variant="eyebrow" color={period === item ? "deed" : "secondary"}>{item === "1y" ? "YIL" : reportingPeriodLabels[item].toLocaleUpperCase("tr-TR")}</SpText></Pressable>)}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stageRow}>{stages.map((stage) => <SpCard key={stage.label} style={styles.stageCard}><SpText variant="eyebrow" color="deed">{stage.label}</SpText><SpText variant="figure">{stage.value}</SpText></SpCard>)}</ScrollView>
      <SpCard style={styles.detailCard}><View style={[styles.icon, { backgroundColor: theme.askBg }]}><Target color={theme.ask} size={19} /></View><SpText variant="eyebrow" color="ask">BUGÜNÜN ODAĞI</SpText><SpText variant="title">{query.data.focus.title}</SpText><SpText color="secondary">{query.data.focus.description}</SpText><View style={[styles.evidence, { backgroundColor: theme.background }]}><SpText variant="bodySmall">Önerilen eylem</SpText><SpText variant="bodySmall" color="secondary">{query.data.focus.action}</SpText></View><Pressable onPress={() => router.push(focusRoute as never)} style={[styles.primary, { backgroundColor: theme.ask }]}><SpText style={{ color: theme.onAsk }}>İlgili kaydı aç</SpText></Pressable></SpCard>
      <SpCard style={styles.detailCard}><View style={[styles.icon, { backgroundColor: theme.deedBg }]}><CalendarCheck color={theme.deed} size={19} /></View><SpText variant="eyebrow" color="deed">GÜNLÜK PLAN</SpText><SpText variant="title">{query.data.tasks.length ? `${query.data.tasks.length} iş` : "Bugün için görev yok"}</SpText><SpText variant="bodySmall" color="secondary">Bugün {query.data.completedTaskCount} iş sonuçlandı.</SpText>{query.data.tasks.length ? <View style={styles.tasks}>{query.data.tasks.map((task) => <View key={task.id} style={[styles.task, { borderTopColor: theme.line }]}><SpText variant="title">{task.title}</SpText><SpText variant="bodySmall" color="secondary">{task.reason}</SpText><Pressable onPress={() => openTask(task)} style={[styles.complete, { borderColor: theme.line }]}><Check color={theme.deed} size={16} /><SpText variant="bodySmall" color="deed">Sonuçlandır</SpText></Pressable></View>)}</View> : <SpText color="secondary">Plan tamamlandı.</SpText>}</SpCard>
    </> : null}
  </ScrollView>
    <TaskResolutionSheet task={activeTask} pending={pending} error={error} onClose={() => setActiveTask(null)} onResolve={(outcome) => void resolveTask(outcome)} onOpenRecord={(task) => { setActiveTask(null); router.push(taskRecordRoute(task) as never); }} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: space.xl, paddingBottom: space["5xl"], gap: space.xl }, headerRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginTop: space.xl, marginBottom: space.xl }, header: { flex: 1, gap: space.md }, headerActions: { gap: space.sm }, refresh: { width: 44, height: 44, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" }, state: { minHeight: 240, alignItems: "center", justifyContent: "center", gap: space.md }, periodChoices: { flexDirection: "row", gap: space.sm }, period: { flex: 1, minHeight: 40, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" }, stageRow: { gap: space.md, paddingRight: space.xl }, stageCard: { width: 142, minHeight: 110, gap: space.md }, detailCard: { gap: space.md, minHeight: 200 }, icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: space.md }, evidence: { padding: space.md, borderRadius: radius.md, gap: space.xs }, tasks: { gap: space.sm }, task: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, gap: space.sm }, complete: { minHeight: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }, modalContent: { padding: space.xl, paddingBottom: space["5xl"], gap: space.lg }, sheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: space.md }, options: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, choice: { minHeight: 42, paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }, input: { minHeight: 50, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md, fontFamily: "Karla_400Regular", fontSize: 16 }, multiline: { minHeight: 100, textAlignVertical: "top" }, primary: { minHeight: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg } });
