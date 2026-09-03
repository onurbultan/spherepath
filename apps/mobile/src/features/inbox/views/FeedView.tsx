import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronUp, MapPin, Mic, Pencil, PhoneOff, Pin, RefreshCw, RotateCcw, Send, Shuffle, Sparkles } from "lucide-react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys, dailyTaskResolutionLabels, inboxAnalysisHighlights, isInboxItemResolved, type DailyTaskOutcome, type InboxItemKind, type InboxItemRecord, type TodayTask } from "@spherepath/shared";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/features/auth/resources/session";
import { finishDailyTask, loadTodayOverview, replaceDailyTask } from "@/features/today/resources/today";
import { TaskResolutionSheet, taskDueLabel, taskRecordRoute } from "@/features/today/components/TaskResolutionSheet";
import { changeInboxItem, createInboxNote, flushInboxQueue, listInboxItems, retryInboxItem, undoInboxItem } from "../resources/inbox";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import { listContacts } from "@/features/contacts/resources/contacts";
import { NoteProcessingSheet } from "../components/NoteProcessingSheet";
import { buttonMetrics, textareaMetrics } from "@/shared/ui/SpField";

const kindLabels: Record<InboxItemKind, string> = { note: "Not", person: "Kişi", property: "Mülk", requirement: "Talep", follow_up: "Takip" };
const sourceLabels: Record<InboxItemRecord["source"], string> = { typed: "Hızlı not", voice: "Sesli kayıt", whatsapp: "WhatsApp" };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "İşlem tamamlanamadı.";

/** "İşlendi" claimed more than happened when the only applied action was a label. */
function statusLabel(item: InboxItemRecord): string {
  if (item.status === "queued") return "Kuyrukta";
  if (item.status === "failed") return "Gönderilemedi";
  if (item.status === "needs_review") return "Kontrol gerekli";
  const created = [...item.appliedActions].reverse().find((action) => action.entityId !== null && action.undoneAt === null);
  return created ? created.label : "Sınıflandırıldı";
}

export default function FeedView() {
  const theme = useSpTheme(); const { session } = useSession(); const client = useQueryClient(); const params = useLocalSearchParams<{ sharedText?: string }>(); const sharedText = typeof params.sharedText === "string" ? params.sharedText.trim() : ""; const [draft, setDraft] = useState({ routeText: sharedText, text: sharedText, source: sharedText ? "whatsapp" as const : "typed" as const }); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TodayTask | null>(null); const [resolving, setResolving] = useState(false); const [taskError, setTaskError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); const [locationFor, setLocationFor] = useState<string | null>(null); const [locationText, setLocationText] = useState("");
  const [noteScope, setNoteScope] = useState<"open" | "done" | "archived">("open"); const [activeNote, setActiveNote] = useState<InboxItemRecord | null>(null);
  const showArchived = noteScope === "archived";
  // "Aktif" means work still to do. A note that has already produced a record
  // belongs to "İşlendi", or the list never empties and stops being read.
  const inScope = (item: InboxItemRecord) => item.status === "archived"
    ? noteScope === "archived"
    : noteScope === (isInboxItemResolved(item) ? "done" : "open");
  const [showAllWork, setShowAllWork] = useState(false);
  const text = draft.routeText === sharedText ? draft.text : sharedText;
  const source = draft.routeText === sharedText ? draft.source : sharedText ? "whatsapp" : "typed";
  const today = useQuery({ queryKey: apiQueryKeys.todayOverviewPeriod("30d"), queryFn: () => loadTodayOverview("30d") });
  const inbox = useQuery({ queryKey: apiQueryKeys.inboxItems, enabled: Boolean(session), queryFn: () => listInboxItems(session ?? undefined), refetchInterval: (query) => (query.state.data as InboxItemRecord[] | undefined)?.some((item) => item.status === "queued" || item.status === "processing") ? 1_500 : false });
  const contacts = useQuery({ queryKey: apiQueryKeys.contacts, enabled: Boolean(session), queryFn: listContacts });
  const refetchToday = today.refetch; const refetchInbox = inbox.refetch;
  useFocusEffect(useCallback(() => { void Promise.all([refetchToday(), refetchInbox()]); }, [refetchToday, refetchInbox]));

  async function save() {
    if (!session || !text.trim() || saving) return; setSaving(true); setError(null);
    try {
      const item = await createInboxNote(session, text.trim(), source);
      client.setQueryData<InboxItemRecord[]>(apiQueryKeys.inboxItems, (current = []) => [item, ...current.filter((entry) => entry.id !== item.id)]);
      setDraft({ routeText: sharedText, text: "", source: "typed" }); setTimeout(() => void client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }), 2_000);
    } catch (nextError) { setError(messageFrom(nextError)); } finally { setSaving(false); }
  }
  async function resolveTask(outcome: DailyTaskOutcome) {
    if (!session) return;
    setResolving(true); setTaskError(null);
    try { await finishDailyTask(session, outcome); await client.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }); setActiveTask(null); } catch (nextError) { setTaskError(messageFrom(nextError)); } finally { setResolving(false); }
  }
  async function retryItem(item: InboxItemRecord) {
    if (!session || item.id.startsWith("queued-")) return;
    try { await retryInboxItem(session, item.id); await client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }); } catch (nextError) { setError(messageFrom(nextError)); }
  }
  async function addLocation(item: InboxItemRecord) {
    if (!session || locationText.trim().length < 2) return;
    try { await changeInboxItem(session, { inboxItemId: item.id, location: locationText.trim() }); setLocationFor(null); setLocationText(""); await client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }); } catch (nextError) { setError(messageFrom(nextError)); }
  }
  function toggleExpanded(id: string) { setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
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
  const dailyTaskIds = new Set(today.data?.tasks.map((task) => task.id) ?? []);
  const additionalTasks = today.data?.allTasks.filter((task) => !dailyTaskIds.has(task.id)) ?? [];
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}>
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void Promise.all([today.refetch(), inbox.refetch()])} />} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><View><SpText variant="eyebrow" color="deed">AKIŞ</SpText><SpText variant="hero">Bugün</SpText></View><Pressable accessibilityLabel="Ayarlar" onPress={() => router.push("/(tabs)/settings")} style={[styles.iconButton, { borderColor: theme.line }]}><RefreshCw size={18} color={theme.textSecondary} /></Pressable></View>

      <SpCard style={styles.dailyCard}>
        <View style={styles.sectionTitle}><View><SpText variant="eyebrow" color="ask">{"BUGÜNÜN 5'İ"}</SpText><SpText variant="title">Önce bunları bitir</SpText></View><SpText variant="bodySmall" color="secondary">{today.data?.completedTaskCount ?? 0}/{today.data?.tasks.length ?? 0}</SpText></View>
        {today.isPending ? <ActivityIndicator color={theme.deed} /> : today.data?.tasks.length ? <View style={styles.taskList}>{today.data.tasks.map((task, index) => {
          const done = Boolean(task.resolutionStatus);
          const optedOut = task.resolutionStatus === "contact_opt_out";
          return <View key={task.id} style={[styles.task, { borderTopColor: theme.line }]}><View style={[styles.taskNumber, { backgroundColor: optedOut ? theme.askBg : done ? theme.goodBg : theme.deedBg }]}>{optedOut ? <PhoneOff size={15} color={theme.ask} /> : <SpText variant="bodySmall" color="deed">{done ? "✓" : index + 1}</SpText>}</View><Pressable style={styles.taskCopy} accessibilityLabel={`${task.title} kaydını aç`} onPress={() => router.push(taskRecordRoute(task) as never)}><SpText style={done && !optedOut ? styles.doneText : undefined}>{task.title}</SpText><SpText variant="bodySmall" color={optedOut ? "ask" : "secondary"}>{task.resolutionStatus ? `${dailyTaskResolutionLabels[task.resolutionStatus]}${task.resolutionNote ? ` · ${task.resolutionNote}` : ""}` : `${task.reason} · ${taskDueLabel(task.dueAt)}`}</SpText></Pressable>{done ? null : <><Pressable accessibilityLabel={`${task.title} görevini bugün gizle`} onPress={() => void replace(task.id)} style={styles.hideAction}><Shuffle size={15} color={theme.textSecondary} /><SpText variant="caption" color="secondary">Bugün gizle</SpText></Pressable><Pressable accessibilityLabel={`${task.title} görevini sonuçlandır`} onPress={() => { setTaskError(null); setActiveTask(task); }} style={[styles.complete, { backgroundColor: theme.goodBg }]}><Check size={19} color={theme.good} /></Pressable></>}</View>;
        })}</View> : <View style={styles.empty}><SpText color="secondary">Henüz planlanacak iş yok. İlk notunu veya kişini ekle.</SpText></View>}
        {additionalTasks.length ? <><Pressable accessibilityRole="button" onPress={() => setShowAllWork((current) => !current)} style={[styles.allWorkToggle, { borderTopColor: theme.line }]}><SpText variant="bodySmall" color="deed">{showAllWork ? "Kalan işleri gizle" : `Tüm işleri gör (${today.data?.allTasks.length ?? 0})`}</SpText>{showAllWork ? <ChevronUp size={16} color={theme.deed} /> : <ChevronDown size={16} color={theme.deed} />}</Pressable>{showAllWork ? <View>{additionalTasks.map((task) => <Pressable key={task.id} accessibilityLabel={`${task.title} kaydını aç`} onPress={() => router.push(taskRecordRoute(task) as never)} style={[styles.additionalTask, { borderTopColor: theme.line }]}><SpText>{task.title}</SpText><SpText variant="bodySmall" color="secondary">{task.reason} · {taskDueLabel(task.dueAt)}</SpText></Pressable>)}</View> : null}</> : null}
      </SpCard>

      <SpCard style={styles.composer}>
        <View style={styles.sectionTitle}><View><SpText variant="eyebrow" color="deed">HIZLI KAYIT</SpText><SpText variant="title">Aklındakini bırak</SpText></View><Sparkles size={20} color={theme.deed} /></View>
        {source === "whatsapp" ? <View style={[styles.sharedSource, { backgroundColor: theme.goodBg }]}><SpText variant="bodySmall" style={{ color: theme.good }}>{"WhatsApp'tan paylaşılan not · Kaydetmeden önce kontrol et"}</SpText></View> : null}
        <TextInput accessibilityLabel="Hızlı not" multiline value={text} onChangeText={(nextText) => setDraft({ routeText: sharedText, text: nextText, source })} placeholder="Örn. Urla'da bahçeli bir ev duydum…" placeholderTextColor={theme.textTertiary} style={[styles.input, { color: theme.textPrimary, borderColor: theme.line, backgroundColor: theme.background }]} />
        <View style={styles.composerActions}><Pressable onPress={() => router.push("/(tabs)/capture")} style={[styles.secondary, { borderColor: theme.line }]}><Mic size={19} color={theme.deed} /><SpText variant="bodySmall" color="deed">Sesli anlat</SpText></Pressable><Pressable disabled={!text.trim() || saving} onPress={() => void save()} style={[styles.primary, { backgroundColor: theme.deed, opacity: !text.trim() || saving ? .5 : 1 }]}>{saving ? <ActivityIndicator color={theme.onDeed} /> : <><Send size={18} color={theme.onDeed} /><SpText variant="bodySmall" style={{ color: theme.onDeed }}>Kaydet</SpText></>}</Pressable></View>
      </SpCard>
      {error ? <View accessibilityRole="alert" style={[styles.alert, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{error}</SpText></View> : null}

      <View style={styles.noteHeading}><View style={styles.flex}><SpText variant="title">Notların</SpText><SpText variant="bodySmall" color="secondary">Sistem tür önerir; gerçek kayda dönüştürmeye sen karar verirsin.</SpText></View><View style={[styles.noteToggle, { borderColor: theme.line }]}>{([["open", "Aktif"], ["done", "İşlendi"], ["archived", "Arşiv"]] as const).map(([scope, label]) => <Pressable key={scope} onPress={() => setNoteScope(scope)} style={[styles.toggleButton, noteScope === scope && { backgroundColor: theme.deedBg }]}><SpText variant="bodySmall" color={noteScope === scope ? "deed" : "secondary"}>{label}</SpText></Pressable>)}</View></View>
      {inbox.isPending ? <ActivityIndicator color={theme.deed} /> : inbox.data?.some(inScope) ? <View style={styles.grid}>{inbox.data.filter(inScope).map((item) => {
        const tone = item.kind === "property" ? { bg: theme.askBg, color: theme.ask } : item.kind === "requirement" ? { bg: theme.goodBg, color: theme.good } : item.kind === "follow_up" ? { bg: theme.warmBg, color: theme.warm } : { bg: theme.deedBg, color: theme.deed };
        return <SpCard key={item.id} style={[styles.noteCard, { borderColor: tone.color }]}><View style={styles.noteMeta}><View style={[styles.kind, { backgroundColor: tone.bg }]}><SpText variant="eyebrow" style={{ color: tone.color }}>{kindLabels[item.kind]}</SpText></View><SpText variant="caption" color="secondary">{sourceLabels[item.source]} · {statusLabel(item)}</SpText></View><SpText>{expanded.has(item.id) ? item.safeText : item.summary}</SpText>{item.analysisStatus === "pending" ? <SpText variant="caption" color="secondary">Not okunuyor…</SpText> : inboxAnalysisHighlights(item.analysis).map((highlight) => <View key={highlight} style={[styles.understanding, { backgroundColor: theme.deedBg }]}><SpText variant="caption" color="deed">{highlight}</SpText></View>)}{item.safeText !== item.summary ? <Pressable accessibilityLabel={expanded.has(item.id) ? "Kısalt" : "Tamamını göster"} onPress={() => toggleExpanded(item.id)} style={styles.expandAction}>{expanded.has(item.id) ? <ChevronUp size={14} color={theme.deed} /> : <ChevronDown size={14} color={theme.deed} />}<SpText variant="bodySmall" color="deed">{expanded.has(item.id) ? "Kısalt" : "Tamamını göster"}</SpText></Pressable> : null}{item.needsLocation && !showArchived && !isInboxItemResolved(item) ? locationFor === item.id ? <View style={styles.locationForm}><TextInput accessibilityLabel="Konum" autoFocus placeholder="Örn. Urla İskele" placeholderTextColor={theme.textTertiary} style={[styles.locationInput, { borderColor: theme.line, backgroundColor: theme.background, color: theme.textPrimary }]} value={locationText} onChangeText={setLocationText} /><Pressable accessibilityLabel="Konumu ekle" disabled={locationText.trim().length < 2} onPress={() => void addLocation(item)} style={[styles.locationSubmit, { backgroundColor: theme.deed, opacity: locationText.trim().length < 2 ? .5 : 1 }]}><SpText variant="bodySmall" style={{ color: theme.onDeed }}>Ekle</SpText></Pressable></View> : <Pressable accessibilityLabel="Konum ekle" onPress={() => { setLocationFor(item.id); setLocationText(""); }} style={[styles.prompt, { backgroundColor: theme.askBg }]}><MapPin size={16} color={theme.ask} /><SpText variant="bodySmall" color="ask">Nerede? Konumu ekleyince eşleştirebilirim.</SpText></Pressable> : null}<View style={styles.noteActions}>{showArchived ? <Pressable accessibilityLabel="Notu geri getir" onPress={() => void updateItem(item, { archived: false })} style={styles.editAction}><ArchiveRestore size={17} color={theme.deed} /><SpText variant="bodySmall" color="deed">Geri getir</SpText></Pressable> : <><Pressable accessibilityLabel="Notu düzenle ve işle" onPress={() => setActiveNote(item)} style={styles.editAction}><Pencil size={17} color={theme.deed} /><SpText variant="bodySmall" color="deed">Düzenle ve işle</SpText></Pressable>{item.status === "failed" ? <Pressable accessibilityLabel="Göndermeyi yeniden dene" onPress={() => void retryLocalItem()} style={styles.retryAction}><RefreshCw size={16} color={theme.deed} /><SpText variant="bodySmall" color="deed">Yeniden dene</SpText></Pressable> : item.status === "needs_review" ? <Pressable accessibilityLabel="Sınıflandırmayı tekrar dene" onPress={() => void retryItem(item)} style={styles.retryAction}><RefreshCw size={16} color={theme.deed} /><SpText variant="bodySmall" color="deed">Tekrar dene</SpText></Pressable> : null}<Pressable accessibilityLabel={item.pinned ? "Sabitlemeyi kaldır" : "Sabitle"} onPress={() => void updateItem(item, { pinned: !item.pinned })} style={styles.smallAction}><Pin size={17} color={item.pinned ? theme.deed : theme.textSecondary} fill={item.pinned ? theme.deed : "transparent"} /></Pressable>{item.appliedActions.some((action) => action.type === "contact_created" && action.undoneAt === null) ? <Pressable accessibilityLabel="Oluşturulan kişiyi geri al" onPress={() => void undo(item)} style={styles.smallAction}><RotateCcw size={17} color={theme.textSecondary} /></Pressable> : null}<Pressable accessibilityLabel="Arşivle" onPress={() => void updateItem(item, { archived: true })} style={styles.smallAction}><Archive size={17} color={theme.textSecondary} /></Pressable></>}</View></SpCard>;
      })}</View> : <SpCard><SpText color="secondary">{noteScope === "archived" ? "Arşivlenmiş not yok." : noteScope === "done" ? "Henüz kayda dönüşmüş not yok." : "Bekleyen not yok."}</SpText></SpCard>}
    </ScrollView>
    <TaskResolutionSheet task={activeTask} pending={resolving} error={taskError} onClose={() => setActiveTask(null)} onResolve={(outcome) => void resolveTask(outcome)} onOpenRecord={(task) => { setActiveTask(null); router.push(taskRecordRoute(task) as never); }} />
    {activeNote ? <NoteProcessingSheet key={activeNote.id} item={activeNote} contacts={contacts.data ?? []} onClose={() => setActiveNote(null)} onChanged={async () => { await Promise.all([client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }), client.invalidateQueries({ queryKey: apiQueryKeys.contacts }), client.invalidateQueries({ queryKey: apiQueryKeys.opportunities }), client.invalidateQueries({ queryKey: apiQueryKeys.portfolioItems }), client.invalidateQueries({ queryKey: apiQueryKeys.todayOverview })]); }} /> : null}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  understanding: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.sm, alignSelf: "flex-start" },
  safe: { flex: 1 }, flex: { flex: 1 }, content: { padding: space.lg, paddingBottom: 120, gap: space.lg }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, iconButton: { width: 44, height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, alignItems: "center", justifyContent: "center" }, dailyCard: { gap: space.lg }, sectionTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }, taskList: { gap: 0 }, task: { minHeight: 64, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm }, taskNumber: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" }, taskCopy: { flex: 1 }, doneText: { textDecorationLine: "line-through", opacity: .55 }, smallAction: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, hideAction: { minWidth: 58, minHeight: 44, alignItems: "center", justifyContent: "center", gap: 2 }, allWorkToggle: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }, additionalTask: { minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, justifyContent: "center", paddingVertical: space.sm }, retryAction: { minHeight: 44, paddingHorizontal: space.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }, editAction: { minHeight: 44, marginRight: "auto", paddingHorizontal: space.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, complete: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }, empty: { paddingVertical: space.md }, composer: { gap: space.lg }, sharedSource: { padding: space.sm, borderRadius: radius.sm }, input: { ...textareaMetrics }, composerActions: { flexDirection: "row", gap: space.sm, justifyContent: "flex-end" }, secondary: { ...buttonMetrics }, primary: { ...buttonMetrics }, alert: { borderRadius: radius.md, padding: space.md }, feedHeading: { marginTop: space.md, gap: 2 }, noteHeading: { marginTop: space.md, flexDirection: "row", alignItems: "flex-end", gap: space.md }, noteToggle: { flexDirection: "row", padding: 3, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md }, toggleButton: { minHeight: 36, paddingHorizontal: space.sm, alignItems: "center", justifyContent: "center", borderRadius: radius.sm }, grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md }, noteCard: { width: "48%", minWidth: 150, flexGrow: 1, gap: space.md, borderWidth: 1 }, noteMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }, kind: { paddingHorizontal: space.sm, paddingVertical: 5, borderRadius: radius.sm }, prompt: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.sm }, noteActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", marginTop: "auto" }, expandAction: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 }, locationForm: { flexDirection: "row", alignItems: "center", gap: space.sm }, locationInput: { flex: 1, minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, paddingHorizontal: space.md, fontFamily: "Karla_400Regular", fontSize: 14 }, locationSubmit: { minHeight: 44, borderRadius: radius.sm, paddingHorizontal: space.lg, alignItems: "center", justifyContent: "center" },
});
