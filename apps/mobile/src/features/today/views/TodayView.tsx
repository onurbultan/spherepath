import { useCallback } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { CalendarCheck, Check, RefreshCw, Settings, Target } from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys } from "@spherepath/shared";
import { SafeAreaView } from "react-native-safe-area-context";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import { finishDailyTask, loadTodayOverview } from "../resources/today";
import { useSession } from "@/features/auth/resources/session";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Bugün görünümü yüklenemedi.";
}

export default function TodayView() {
  const theme = useSpTheme();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: apiQueryKeys.todayOverview, queryFn: loadTodayOverview });
  const refetch = query.refetch;

  useFocusEffect(useCallback(() => {
    void refetch();
  }, [refetch]));

  const stages = query.data ? [
    { label: "Tanışma", value: query.data.stages.acquaintance, detail: "Son 30 gün" },
    { label: "İlişki", value: query.data.stages.relationship, detail: "Anlamlı temas" },
    { label: "Lead", value: query.data.stages.lead, detail: "Açık fırsat" },
    { label: "Portföy", value: query.data.stages.listing, detail: "Kazanılan" },
    { label: "Kapama", value: query.data.stages.closing, detail: "Tamamlanan" },
  ] : [];
  async function complete(taskId: string) { if (!session) return; await finishDailyTask(session, { taskId, status: "completed", skippedReason: null }); await queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }); }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}><View style={styles.header}><SpText variant="eyebrow" color="deed">BUGÜN</SpText><SpText variant="hero">Bugünün odağı</SpText><SpText color="secondary">Gerçek kişi, temas ve fırsat kayıtlarından açıklanabilir bir çalışma planı.</SpText></View><View style={styles.headerActions}><Pressable accessibilityLabel="Ayarlar" onPress={() => router.push("/(tabs)/settings")} style={[styles.refresh, { borderColor: theme.line }]}><Settings color={theme.textSecondary} size={19} /></Pressable><Pressable accessibilityLabel="Yenile" onPress={() => void query.refetch()} style={[styles.refresh, { borderColor: theme.line }]}><RefreshCw color={theme.textSecondary} size={19} /></Pressable></View></View>
        {query.isPending ? <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Bugün görünümü hazırlanıyor…</SpText></View> : query.error ? <SpCard style={styles.state}><SpText variant="title">Görünüm yüklenemedi</SpText><SpText color="secondary">{messageFrom(query.error)}</SpText></SpCard> : query.data ? <>
          <View style={styles.sectionHeading}><View><SpText variant="eyebrow">SATIŞ SİSTEMİ</SpText><SpText variant="title">Beş aşamalı sağlık</SpText></View><View style={[styles.period, { backgroundColor: theme.deedBg }]}><SpText variant="eyebrow" color="deed">30 GÜN</SpText></View></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stageRow}>{stages.map((stage) => <SpCard key={stage.label} style={styles.stageCard}><SpText variant="eyebrow" color="deed">{stage.label}</SpText><SpText variant="figure">{stage.value}</SpText><SpText variant="bodySmall" color="secondary">{stage.detail}</SpText></SpCard>)}</ScrollView>
          <SpCard style={styles.detailCard}><View style={[styles.icon, { backgroundColor: theme.askBg }]}><Target color={theme.ask} size={19} /></View><SpText variant="eyebrow" color="ask">DARBOĞAZ</SpText><SpText variant="title">{query.data.focus.title}</SpText><SpText color="secondary">{query.data.focus.description}</SpText><View style={[styles.evidence, { backgroundColor: theme.background }]}><SpText variant="bodySmall">Dayanak</SpText><SpText variant="bodySmall" color="secondary">{query.data.focus.evidence}</SpText><SpText variant="bodySmall">Önerilen eylem</SpText><SpText variant="bodySmall" color="secondary">{query.data.focus.action}</SpText>{!query.data.focus.sampleSufficient ? <SpText variant="bodySmall" color="secondary">Örneklem küçük; yüzdelik teşhis üretilmedi.</SpText> : null}</View></SpCard>
          <SpCard style={styles.detailCard}><View style={[styles.icon, { backgroundColor: theme.deedBg }]}><CalendarCheck color={theme.deed} size={19} /></View><SpText variant="eyebrow" color="deed">GÜNLÜK PLAN</SpText><SpText variant="title">{query.data.tasks.length ? `${query.data.tasks.length} öncelikli iş` : "Bugün için görev yok"}</SpText><SpText variant="bodySmall" color="secondary">Bugün {query.data.completedTaskCount} iş tamamlandı.</SpText>{query.data.tasks.length ? <View style={styles.tasks}>{query.data.tasks.map((task) => <View key={task.id} style={[styles.task, { borderTopColor: theme.line }]}><SpText variant="title">{task.title}</SpText><SpText variant="bodySmall" color="secondary">{task.reason}</SpText><Pressable onPress={() => void complete(task.id)} style={[styles.complete, { borderColor: theme.line }]}><Check color={theme.deed} size={16} /><SpText variant="bodySmall" color="deed">Tamamla</SpText></Pressable></View>)}</View> : <SpText color="secondary">Sonraki adımı olan kişi ve fırsatlar burada en fazla beş eylem olarak sıralanır.</SpText>}</SpCard>
        </> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { padding: space.xl, paddingBottom: space["5xl"], gap: space.xl }, headerRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginTop: space.xl, marginBottom: space.xl }, header: { flex: 1, gap: space.md }, headerActions: { gap: space.sm }, refresh: { width: 44, height: 44, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" }, state: { minHeight: 240, alignItems: "center", justifyContent: "center", gap: space.md },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md }, period: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm }, stageRow: { gap: space.md, paddingRight: space.xl }, stageCard: { width: 142, minHeight: 132, gap: space.md }, detailCard: { gap: space.md, minHeight: 200 }, icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: space.md }, evidence: { padding: space.md, borderRadius: radius.md, gap: space.xs }, tasks: { gap: space.sm }, task: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, gap: space.sm }, complete: { minHeight: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
});
