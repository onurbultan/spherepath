import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Archive, Check, MapPin, Mic, Pin, RefreshCw, RotateCcw, Send, Sparkles } from "lucide-react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys, type InboxItemKind, type InboxItemRecord } from "@spherepath/shared";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/features/auth/resources/session";
import { finishDailyTask, loadTodayOverview, replaceDailyTask } from "@/features/today/resources/today";
import { changeInboxItem, createInboxNote, flushInboxQueue, listInboxItems, undoInboxItem } from "../resources/inbox";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";

const kindLabels: Record<InboxItemKind, string> = { note: "Not", person: "Kişi", property: "Mülk", requirement: "Talep", follow_up: "Takip" };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "İşlem tamamlanamadı.";

export default function FeedView() {
  const theme = useSpTheme(); const { session } = useSession(); const client = useQueryClient(); const params = useLocalSearchParams<{ sharedText?: string }>(); const sharedText = typeof params.sharedText === "string" ? params.sharedText.trim() : ""; const [text, setText] = useState(sharedText); const [source, setSource] = useState<"typed" | "whatsapp">(sharedText ? "whatsapp" : "typed"); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const today = useQuery({ queryKey: apiQueryKeys.todayOverviewPeriod("30d"), queryFn: () => loadTodayOverview("30d") });
  const inbox = useQuery({ queryKey: apiQueryKeys.inboxItems, enabled: Boolean(session), queryFn: () => listInboxItems(session ?? undefined) });
  const refetchToday = today.refetch; const refetchInbox = inbox.refetch;
  useFocusEffect(useCallback(() => { void Promise.all([refetchToday(), refetchInbox()]); }, [refetchToday, refetchInbox]));

  async function save() {
    if (!session || !text.trim() || saving) return; setSaving(true); setError(null);
    try {
      const item = await createInboxNote(session, text.trim(), source);
      client.setQueryData<InboxItemRecord[]>(apiQueryKeys.inboxItems, (current = []) => [item, ...current.filter((entry) => entry.id !== item.id)]);
      setText(""); setSource("typed"); setTimeout(() => void client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }), 2_000);
    } catch (nextError) { setError(messageFrom(nextError)); } finally { setSaving(false); }
  }
  async function complete(taskId: string) {
    if (!session) return;
    try { await finishDailyTask(session, { taskId, status: "completed", outcomeNote: null, skippedReason: null, rescheduledAt: null, rescheduledActionType: null }); await client.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }); } catch (nextError) { setError(messageFrom(nextError)); }
  }
  async function replace(taskId: string) {
    if (!session) return;
    try { await replaceDailyTask(session, taskId); await client.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }); } catch (nextError) { setError(messageFrom(nextError)); }
  }
  async function updateItem(item: InboxItemRecord, update: { kind?: InboxItemKind; pinned?: boolean; archived?: boolean }) {
    if (!session || item.id.startsWith("queued-")) return;
    try { await changeInboxItem(session, { inboxItemId: item.id, ...update }); await client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }); } catch (nextError) { setError(messageFrom(nextError)); }
  }
  async function undo(item: InboxItemRecord) {
    if (!session || item.id.startsWith("queued-")) return;
    try { await undoInboxItem(session, item.id); await Promise.all([client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }), client.invalidateQueries({ queryKey: apiQueryKeys.contacts })]); } catch (nextError) { setError(messageFrom(nextError)); }
  }
  async function retryLocalItem() {
    if (!session) return;
    try { await flushInboxQueue(session); await client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }); } catch (nextError) { setError(messageFrom(nextError)); }
  }

  const refreshing = today.isFetching || inbox.isFetching;
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}>
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void Promise.all([today.refetch(), inbox.refetch()])} />} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><View><SpText variant="eyebrow" color="deed">AKIŞ</SpText><SpText variant="hero">Bugün</SpText></View><Pressable accessibilityLabel="Ayarlar" onPress={() => router.push("/(tabs)/settings")} style={[styles.iconButton, { borderColor: theme.line }]}><RefreshCw size={18} color={theme.textSecondary} /></Pressable></View>

      <SpCard style={styles.dailyCard}>
        <View style={styles.sectionTitle}><View><SpText variant="eyebrow" color="ask">{"BUGÜNÜN 5'İ"}</SpText><SpText variant="title">Önce bunları bitir</SpText></View><SpText variant="bodySmall" color="secondary">{today.data?.completedTaskCount ?? 0}/{today.data?.tasks.length ?? 0}</SpText></View>
        {today.isPending ? <ActivityIndicator color={theme.deed} /> : today.data?.tasks.length ? <View style={styles.taskList}>{today.data.tasks.map((task, index) => {
          const done = Boolean(task.resolutionStatus); return <View key={task.id} style={[styles.task, { borderTopColor: theme.line }]}><View style={[styles.taskNumber, { backgroundColor: done ? theme.goodBg : theme.deedBg }]}><SpText variant="bodySmall" color="deed">{done ? "✓" : index + 1}</SpText></View><View style={styles.taskCopy}><SpText style={done ? styles.doneText : undefined}>{task.title}</SpText><SpText variant="bodySmall" color="secondary">{task.reason}</SpText></View>{done ? null : <><Pressable accessibilityLabel="Görevi değiştir" onPress={() => void replace(task.id)} style={styles.smallAction}><RefreshCw size={17} color={theme.textSecondary} /></Pressable><Pressable accessibilityLabel="Tamamla" onPress={() => void complete(task.id)} style={[styles.complete, { backgroundColor: theme.goodBg }]}><Check size={19} color={theme.good} /></Pressable></>}</View>;
        })}</View> : <View style={styles.empty}><SpText color="secondary">Henüz planlanacak iş yok. İlk notunu veya kişini ekle.</SpText></View>}
      </SpCard>

      <SpCard style={styles.composer}>
        <View style={styles.sectionTitle}><View><SpText variant="eyebrow" color="deed">HIZLI KAYIT</SpText><SpText variant="title">Aklındakini bırak</SpText></View><Sparkles size={20} color={theme.deed} /></View>
        {source === "whatsapp" ? <View style={[styles.sharedSource, { backgroundColor: theme.goodBg }]}><SpText variant="bodySmall" style={{ color: theme.good }}>{"WhatsApp'tan paylaşılan not · Kaydetmeden önce kontrol et"}</SpText></View> : null}
        <TextInput accessibilityLabel="Hızlı not" multiline value={text} onChangeText={setText} placeholder="Örn. Urla'da bahçeli bir ev duydum…" placeholderTextColor={theme.textTertiary} style={[styles.input, { color: theme.textPrimary, borderColor: theme.line, backgroundColor: theme.background }]} />
        <View style={styles.composerActions}><Pressable onPress={() => router.push("/(tabs)/capture")} style={[styles.secondary, { borderColor: theme.line }]}><Mic size={19} color={theme.deed} /><SpText variant="bodySmall" color="deed">Sesli anlat</SpText></Pressable><Pressable disabled={!text.trim() || saving} onPress={() => void save()} style={[styles.primary, { backgroundColor: theme.deed, opacity: !text.trim() || saving ? .5 : 1 }]}>{saving ? <ActivityIndicator color={theme.onDeed} /> : <><Send size={18} color={theme.onDeed} /><SpText variant="bodySmall" style={{ color: theme.onDeed }}>Kaydet</SpText></>}</Pressable></View>
      </SpCard>
      {error ? <View accessibilityRole="alert" style={[styles.alert, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{error}</SpText></View> : null}

      <View style={styles.feedHeading}><SpText variant="title">Notların</SpText><SpText variant="bodySmall" color="secondary">Yapay zekâ önerir, kontrol sende kalır.</SpText></View>
      {inbox.isPending ? <ActivityIndicator color={theme.deed} /> : inbox.data?.length ? <View style={styles.grid}>{inbox.data.filter((item) => item.status !== "archived").map((item) => {
        const tone = item.kind === "property" ? { bg: theme.askBg, color: theme.ask } : item.kind === "requirement" ? { bg: theme.goodBg, color: theme.good } : item.kind === "follow_up" ? { bg: theme.warmBg, color: theme.warm } : { bg: theme.deedBg, color: theme.deed };
        return <SpCard key={item.id} style={[styles.noteCard, { borderColor: tone.color }]}><View style={styles.noteMeta}><View style={[styles.kind, { backgroundColor: tone.bg }]}><SpText variant="eyebrow" style={{ color: tone.color }}>{kindLabels[item.kind]}</SpText></View><SpText variant="caption" color="secondary">{item.status === "queued" ? "Kuyrukta" : item.status === "failed" ? "Gönderilemedi" : item.status === "needs_review" ? "Kontrol gerekli" : "İşlendi"}</SpText></View><SpText>{item.summary}</SpText>{item.needsLocation ? <View style={[styles.prompt, { backgroundColor: theme.askBg }]}><MapPin size={16} color={theme.ask} /><SpText variant="bodySmall" color="ask">Nerede? Konumu ekleyince eşleştirebilirim.</SpText></View> : null}<View style={styles.noteActions}>{item.status === "failed" ? <Pressable accessibilityLabel="Göndermeyi yeniden dene" onPress={() => void retryLocalItem()} style={styles.retryAction}><RefreshCw size={16} color={theme.deed} /><SpText variant="bodySmall" color="deed">Yeniden dene</SpText></Pressable> : null}<Pressable accessibilityLabel={item.pinned ? "Sabitlemeyi kaldır" : "Sabitle"} onPress={() => void updateItem(item, { pinned: !item.pinned })} style={styles.smallAction}><Pin size={17} color={item.pinned ? theme.deed : theme.textSecondary} fill={item.pinned ? theme.deed : "transparent"} /></Pressable>{item.appliedActions.some((action) => action.undoneAt === null) ? <Pressable accessibilityLabel="Uygulamayı geri al" onPress={() => void undo(item)} style={styles.smallAction}><RotateCcw size={17} color={theme.textSecondary} /></Pressable> : null}<Pressable accessibilityLabel="Arşivle" onPress={() => void updateItem(item, { archived: true })} style={styles.smallAction}><Archive size={17} color={theme.textSecondary} /></Pressable></View></SpCard>;
      })}</View> : <SpCard><SpText color="secondary">Henüz not yok. Bir cümle yazman yeterli.</SpText></SpCard>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { padding: space.lg, paddingBottom: 120, gap: space.lg }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, iconButton: { width: 44, height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, alignItems: "center", justifyContent: "center" }, dailyCard: { gap: space.lg }, sectionTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }, taskList: { gap: 0 }, task: { minHeight: 64, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm }, taskNumber: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" }, taskCopy: { flex: 1 }, doneText: { textDecorationLine: "line-through", opacity: .55 }, smallAction: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, retryAction: { minHeight: 44, paddingHorizontal: space.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }, complete: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }, empty: { paddingVertical: space.md }, composer: { gap: space.lg }, sharedSource: { padding: space.sm, borderRadius: radius.sm }, input: { minHeight: 108, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.lg, fontFamily: "Karla_400Regular", fontSize: 16, lineHeight: 23, textAlignVertical: "top" }, composerActions: { flexDirection: "row", gap: space.sm, justifyContent: "flex-end" }, secondary: { minHeight: 46, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }, primary: { minHeight: 46, borderRadius: radius.md, paddingHorizontal: space.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }, alert: { borderRadius: radius.md, padding: space.md }, feedHeading: { marginTop: space.md, gap: 2 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md }, noteCard: { width: "48%", minWidth: 150, flexGrow: 1, gap: space.md, borderWidth: 1 }, noteMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }, kind: { paddingHorizontal: space.sm, paddingVertical: 5, borderRadius: radius.sm }, prompt: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.sm }, noteActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: "auto" },
});
