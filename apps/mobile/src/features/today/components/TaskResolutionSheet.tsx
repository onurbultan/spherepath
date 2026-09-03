import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { CalendarClock, Check, CircleSlash, PhoneOff, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { dailyTaskOutcomeSchema, dailyTaskResolutionLabels, nextActionTypeLabels, nextActionTypes, type DailyTaskOutcome, type NextActionType, type TodayTask } from "@spherepath/shared";
import { SpText } from "@/shared/ui/SpText";
import { SpDateField } from "@/shared/ui/SpDateField";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import { buttonMetrics, choiceMetrics, largeButtonMetrics, textareaMetrics } from "@/shared/ui/SpField";

/** Tomorrow morning, which is what an advisor picks unprompted more often than not. */
function defaultFollowUp(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function taskDueLabel(value: number | null): string {
  if (value === null) return "Tarihsiz";
  const due = new Date(value);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (due.toDateString() === yesterday.toDateString()) return `Gecikti · dün ${new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(due)}`;
  if (due.toDateString() === now.toDateString()) return `Bugün ${new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(due)}`;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(due);
}

/** Where the advisor goes to write up what actually happened on this task. */
export function taskRecordRoute(task: TodayTask): string {
  // Finishing a listing means entering its price, which happens on the
  // portfolio page -- the capture form would ask for a conversation instead.
  // Returning a call starts on the contact, where the dial button is.
  if (task.type === "return_call") return `/contact/${encodeURIComponent(task.contactId)}`;
  if (task.type === "complete_listing") return "/(tabs)/listings";
  return task.opportunityId
    ? `/(tabs)/opportunities?opportunityId=${encodeURIComponent(task.opportunityId)}`
    : `/(tabs)/capture?contactId=${encodeURIComponent(task.contactId)}`;
}

/**
 * Closing a task is where the next action date, the interaction and the relationship
 * counters come from, so the daily plan and the feed resolve tasks through this one
 * sheet rather than each having its own idea of what "done" means.
 */
export function TaskResolutionSheet({ task, pending, error, onClose, onResolve, onOpenRecord }: {
  task: TodayTask | null;
  pending: boolean;
  error: string | null;
  onClose(): void;
  onResolve(outcome: DailyTaskOutcome): void;
  onOpenRecord?(task: TodayTask): void;
}) {
  const theme = useSpTheme();
  const [status, setStatus] = useState<DailyTaskOutcome["status"]>("completed");
  const [note, setNote] = useState("");
  const [rescheduleAt, setRescheduleAt] = useState(defaultFollowUp);
  const [actionType, setActionType] = useState<NextActionType>("call");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit() {
    if (!task) return;
    const parsed = dailyTaskOutcomeSchema.safeParse({
      taskId: task.id,
      status,
      outcomeNote: status === "completed" ? note.trim() || null : null,
      skippedReason: status === "skipped" || status === "contact_opt_out" ? note.trim() || null : null,
      rescheduledAt: status === "rescheduled" ? new Date(rescheduleAt).getTime() : null,
      rescheduledActionType: status === "rescheduled" ? actionType : null,
    });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? "Sonucu kontrol et.");
      return;
    }
    setLocalError(null);
    onResolve(parsed.data);
  }

  function close() {
    setStatus("completed"); setNote(""); setRescheduleAt(defaultFollowUp()); setActionType("call"); setLocalError(null);
    onClose();
  }

  const choice = (selected: boolean) => [styles.choice, { backgroundColor: selected ? theme.deedBg : theme.card, borderColor: selected ? theme.deed : theme.line }];
  const shownError = localError ?? error;

  return <Modal animationType="slide" presentationStyle="pageSheet" visible={Boolean(task)} onRequestClose={close}>
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.heading}>
          <View style={styles.headingCopy}>
            <SpText variant="eyebrow" color="deed">GÖREV SONUCU</SpText>
            <SpText variant="hero">{task?.title}</SpText>
            <SpText color="secondary">{task?.reason} · {taskDueLabel(task?.dueAt ?? null)}</SpText>
          </View>
          <Pressable accessibilityLabel="Kapat" disabled={pending} onPress={close} style={[styles.icon, { borderColor: theme.line }]}><X color={theme.textSecondary} size={20} /></Pressable>
        </View>

        <View accessibilityRole="radiogroup" accessibilityLabel="Görev sonucu" style={styles.options}>
          {(["completed", "rescheduled", "skipped", "contact_opt_out"] as const).map((item) => (
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: status === item }} key={item} onPress={() => { setStatus(item); setNote(""); }} style={choice(status === item)}>
              {item === "completed" ? <Check color={theme.deed} size={17} /> : item === "rescheduled" ? <CalendarClock color={theme.deed} size={17} /> : item === "contact_opt_out" ? <PhoneOff color={theme.ask} size={17} /> : <CircleSlash color={theme.deed} size={17} />}
              <SpText color={status === item ? item === "contact_opt_out" ? "ask" : "deed" : "secondary"}>{dailyTaskResolutionLabels[item]}</SpText>
            </Pressable>
          ))}
        </View>

        {status === "rescheduled" ? <>
          <SpText variant="title">Yeni aksiyon</SpText>
          <View accessibilityRole="radiogroup" accessibilityLabel="Yeni aksiyon" style={styles.options}>
            {nextActionTypes.map((item) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: actionType === item }} key={item} onPress={() => setActionType(item)} style={choice(actionType === item)}><SpText variant="bodySmall" color={actionType === item ? "deed" : "secondary"}>{nextActionTypeLabels[item]}</SpText></Pressable>)}
          </View>
          <SpDateField label="Yeni tarih" onChange={setRescheduleAt} value={rescheduleAt} />
        </> : <>
          <SpText variant="title">{status === "contact_opt_out" ? "İletişim tercihi" : status === "skipped" ? "Neden atlanıyor?" : "Kısa sonuç · isteğe bağlı"}</SpText>
          <TextInput accessibilityLabel={status === "contact_opt_out" ? "İletişim tercihi açıklaması" : status === "skipped" ? "Atlama nedeni" : "Kısa sonuç"} multiline placeholder={status === "contact_opt_out" ? "Örn. Telefon ve WhatsApp üzerinden iletişim istemiyor." : status === "skipped" ? "Örn. Bugün uygun değil, daha sonra tekrar değerlendirilecek." : "Örn. Görüşüldü, cuma tekrar aranacak."} placeholderTextColor={theme.textTertiary} style={[styles.input, styles.multiline, { backgroundColor: theme.card, borderColor: theme.line, color: theme.textPrimary }]} value={note} onChangeText={setNote} />
          {status === "contact_opt_out" ? <SpText variant="bodySmall" color="ask">Bu kişinin tüm sonraki görevleri kapatılır ve pazarlama izni geri çekilmiş olarak işaretlenir.</SpText> : null}
        </>}

        {shownError ? <View accessibilityRole="alert" style={[styles.alert, { backgroundColor: theme.askBg }]}><SpText color="ask">{shownError}</SpText></View> : null}

        {task && onOpenRecord ? <Pressable onPress={() => onOpenRecord(task)} style={[styles.secondary, { borderColor: theme.line }]}><SpText color="deed">Teması ayrıntılı kaydet</SpText></Pressable> : null}
        <Pressable disabled={pending} onPress={submit} style={[styles.primary, { backgroundColor: theme.ask, opacity: pending ? .6 : 1 }]}>
          <SpText style={{ color: theme.onAsk }}>{pending ? "Kaydediliyor…" : status === "rescheduled" ? "Yeni tarihe ertele" : status === "contact_opt_out" ? "İletişimi kapat" : "Sonucu kaydet"}</SpText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: space.lg, paddingBottom: 60, gap: space.lg },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  headingCopy: { flex: 1, gap: 2 },
  icon: { width: 44, height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  choice: { ...choiceMetrics },
  input: { ...textareaMetrics },
  multiline: { minHeight: 108, textAlignVertical: "top" },
  alert: { borderRadius: radius.md, padding: space.md },
  secondary: { ...buttonMetrics },
  primary: { ...largeButtonMetrics },
});
