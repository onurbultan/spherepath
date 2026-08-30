import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Check, ContactRound, Save } from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  apiQueryKeys,
  askOutcomeLabels,
  askOutcomes,
  interactionChannelLabels,
  interactionChannels,
  interactionDirectionLabels,
  interactionDirections,
  interactionObjectiveLabels,
  interactionObjectives,
  manualInteractionSchema,
  nextActionTypeLabels,
  nextActionTypes,
  type ManualInteractionDraft,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listContacts } from "@/features/contacts/resources/contacts";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { ContactPicker } from "@/shared/ui/ContactPicker";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import { saveManualInteraction } from "../resources/interactions";
import { VoiceCaptureCard } from "../components/VoiceCaptureCard";

const dayOptions = [
  { label: "Yarın", days: 1 },
  { label: "3 gün", days: 3 },
  { label: "1 hafta", days: 7 },
] as const;

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Temas kaydedilemedi.";
}

const whenOptions = [
  { label: "Şimdi", hoursAgo: null },
  { label: "Birkaç saat önce", hoursAgo: 4 },
  { label: "Dün", hoursAgo: 24 },
] as const;

export default function CaptureView() {
  const theme = useSpTheme();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactId, setContactId] = useState("");
  const [channel, setChannel] = useState<ManualInteractionDraft["channel"]>("in_person");
  const [objective, setObjective] = useState<ManualInteractionDraft["objective"]>("get_acquainted");
  const [outcome, setOutcome] = useState("");
  const [askOutcome, setAskOutcome] = useState<ManualInteractionDraft["askOutcome"]>("not_asked");
  const [nextActionType, setNextActionType] = useState<ManualInteractionDraft["nextActionType"]>(null);
  const [nextActionDays, setNextActionDays] = useState<number | null>(null);
  const [noteSummary, setNoteSummary] = useState("");
  const [direction, setDirection] = useState<ManualInteractionDraft["direction"]>("mutual");
  const [hoursAgo, setHoursAgo] = useState<number | null>(null);
  const [captureMode, setCaptureMode] = useState<"voice" | "manual">("voice");

  const contactsQuery = useQuery({
    queryKey: apiQueryKeys.contacts,
    queryFn: listContacts,
    enabled: Boolean(session),
  });
  const contacts = contactsQuery.data ?? [];
  const selectedContactId = contactId;

  async function submit() {
    if (!session) return;
    const nextActionAt = nextActionDays === null
      ? null
      : Date.now() + nextActionDays * 24 * 60 * 60 * 1_000;
    const parsed = manualInteractionSchema.safeParse({
      contactId: selectedContactId,
      channel,
      objective,
      direction,
      outcome,
      askOutcome,
      nextActionType,
      nextActionAt,
      noteSummary,
      occurredAt: hoursAgo === null ? null : Date.now() - hoursAgo * 60 * 60 * 1_000,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Temas bilgilerini kontrol et.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await saveManualInteraction(session, parsed.data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ]);
      setSaved(true);
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setOutcome("");
    setNoteSummary("");
    setAskOutcome("not_asked");
    setNextActionType(null);
    setNextActionDays(null);
    setSaved(false);
  }

  const inputStyle = [styles.input, { backgroundColor: theme.card, borderColor: theme.line, color: theme.textPrimary }];
  const choice = (selected: boolean) => [
    styles.choice,
    { backgroundColor: selected ? theme.deedBg : theme.card, borderColor: selected ? theme.deed : theme.line },
  ];
  const radioProps = (selected: boolean) => ({ accessibilityRole: "radio" as const, accessibilityState: { checked: selected } });

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}><SpText variant="eyebrow" color="ask">HIZLI KAYIT</SpText><SpText variant="hero">Temas kaydet</SpText><SpText color="secondary">Görüşme sonucunu ve kabul edilmiş sonraki adımı kısa biçimde kapat.</SpText></View>
        {contactsQuery.isPending ? <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Kişiler yükleniyor…</SpText></View> : contactsQuery.error ? <SpCard style={styles.state}><SpText variant="title">Kişiler yüklenemedi</SpText><SpText color="secondary">{messageFrom(contactsQuery.error)}</SpText></SpCard> : contacts.length === 0 ? (
          <SpCard style={styles.state}><ContactRound color={theme.deed} size={26} /><SpText variant="title">Önce bir kişi ekle</SpText><SpText color="secondary">Temas kaydı mevcut bir kişiyle ilişkilendirilir.</SpText><Pressable onPress={() => router.push("/(tabs)/contacts")} style={[styles.primary, { backgroundColor: theme.ask, alignSelf: "stretch" }]}><SpText style={{ color: theme.onAsk }}>Kişi eklemeye git</SpText></Pressable></SpCard>
        ) : saved ? (
          <SpCard style={styles.state}><View style={[styles.icon, { backgroundColor: theme.deedBg }]}><Check color={theme.deed} size={24} /></View><SpText variant="eyebrow" color="deed">KAYDEDİLDİ</SpText><SpText variant="title">Temas ve sonraki aksiyon hazır</SpText><Pressable onPress={reset} style={[styles.primary, { backgroundColor: theme.ask }]}><SpText style={{ color: theme.onAsk }}>Yeni temas kaydet</SpText></Pressable></SpCard>
        ) : <>
          <View accessibilityRole="tablist" style={[styles.modeTabs, { borderColor: theme.line, backgroundColor: theme.sunk }]}><Pressable accessibilityRole="tab" accessibilityState={{ selected: captureMode === "voice" }} onPress={() => setCaptureMode("voice")} style={[styles.modeTab, captureMode === "voice" && { backgroundColor: theme.card }]}><SpText color={captureMode === "voice" ? "deed" : "secondary"}>Sesli anlat</SpText></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: captureMode === "manual" }} onPress={() => setCaptureMode("manual")} style={[styles.modeTab, captureMode === "manual" && { backgroundColor: theme.card }]}><SpText color={captureMode === "manual" ? "deed" : "secondary"}>Manuel yaz</SpText></Pressable></View>
          {captureMode === "voice" ? <VoiceCaptureCard session={session!} contacts={contacts} onSaved={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
              queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
            ]);
          }} /> : null}
          {captureMode === "manual" ? <>
          <SpCard style={styles.section}><SpText variant="eyebrow">1 · KİM</SpText><ContactPicker contacts={contacts} value={selectedContactId} onChange={setContactId} /><SpText variant="title">Kanal</SpText><View accessibilityLabel="Kanal" accessibilityRole="radiogroup" style={styles.choices}>{interactionChannels.map((item) => <Pressable {...radioProps(channel === item)} key={item} onPress={() => setChannel(item)} style={choice(channel === item)}><SpText variant="bodySmall" color={channel === item ? "deed" : "secondary"}>{interactionChannelLabels[item]}</SpText></Pressable>)}</View><SpText variant="title">Amaç</SpText><View accessibilityLabel="Amaç" accessibilityRole="radiogroup" style={styles.choices}>{interactionObjectives.map((item) => <Pressable {...radioProps(objective === item)} key={item} onPress={() => setObjective(item)} style={choice(objective === item)}><SpText variant="bodySmall" color={objective === item ? "deed" : "secondary"}>{interactionObjectiveLabels[item]}</SpText></Pressable>)}</View></SpCard>
          <SpCard style={styles.section}><SpText variant="eyebrow">2 · NE OLDU</SpText><SpText variant="title">Kısa sonuç</SpText><TextInput accessibilityLabel="Kısa sonuç" multiline placeholder="Örn. Salı günü satış planını konuşacağız." placeholderTextColor={theme.textTertiary} style={[inputStyle, styles.multiline]} value={outcome} onChangeText={setOutcome} /><SpText variant="title">Talep sonucu</SpText><View accessibilityLabel="Talep sonucu" accessibilityRole="radiogroup" style={styles.choices}>{askOutcomes.map((item) => <Pressable {...radioProps(askOutcome === item)} key={item} onPress={() => setAskOutcome(item)} style={choice(askOutcome === item)}><SpText variant="bodySmall" color={askOutcome === item ? "deed" : "secondary"}>{askOutcomeLabels[item]}</SpText></Pressable>)}</View><SpText variant="title">Yön</SpText><View accessibilityLabel="Yön" accessibilityRole="radiogroup" style={styles.choices}>{interactionDirections.map((item) => <Pressable {...radioProps(direction === item)} key={item} onPress={() => setDirection(item)} style={choice(direction === item)}><SpText variant="bodySmall" color={direction === item ? "deed" : "secondary"}>{interactionDirectionLabels[item]}</SpText></Pressable>)}</View><SpText variant="title">Ne zaman oldu</SpText><View accessibilityLabel="Ne zaman oldu" accessibilityRole="radiogroup" style={styles.choices}>{whenOptions.map((item) => <Pressable {...radioProps(hoursAgo === item.hoursAgo)} key={item.label} onPress={() => setHoursAgo(item.hoursAgo)} style={choice(hoursAgo === item.hoursAgo)}><SpText variant="bodySmall" color={hoursAgo === item.hoursAgo ? "deed" : "secondary"}>{item.label}</SpText></Pressable>)}</View><SpText variant="title">Ek not</SpText><TextInput accessibilityLabel="Ek not" multiline placeholder="İsteğe bağlı" placeholderTextColor={theme.textTertiary} style={[inputStyle, styles.multiline]} value={noteSummary} onChangeText={setNoteSummary} /></SpCard>
          <SpCard style={styles.section}><SpText variant="eyebrow">3 · SONRAKİ ADIM</SpText><SpText variant="title">Aksiyon</SpText><View accessibilityLabel="Aksiyon" accessibilityRole="radiogroup" style={styles.choices}><Pressable {...radioProps(nextActionType === null)} onPress={() => { setNextActionType(null); setNextActionDays(null); }} style={choice(nextActionType === null)}><SpText variant="bodySmall" color={nextActionType === null ? "deed" : "secondary"}>Henüz yok</SpText></Pressable>{nextActionTypes.map((item) => <Pressable {...radioProps(nextActionType === item)} key={item} onPress={() => { setNextActionType(item); setNextActionDays((current) => current ?? 1); }} style={choice(nextActionType === item)}><SpText variant="bodySmall" color={nextActionType === item ? "deed" : "secondary"}>{nextActionTypeLabels[item]}</SpText></Pressable>)}</View>{nextActionType ? <><SpText variant="title">Zaman</SpText><View accessibilityLabel="Zaman" accessibilityRole="radiogroup" style={styles.choices}>{dayOptions.map((item) => <Pressable {...radioProps(nextActionDays === item.days)} key={item.days} onPress={() => setNextActionDays(item.days)} style={choice(nextActionDays === item.days)}><SpText variant="bodySmall" color={nextActionDays === item.days ? "deed" : "secondary"}>{item.label}</SpText></Pressable>)}</View></> : null}</SpCard>
          {error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{error}</SpText></View> : null}
          <Pressable accessibilityRole="button" disabled={pending || !selectedContactId} onPress={() => void submit()} style={({ pressed }) => [styles.primary, { backgroundColor: theme.ask, opacity: pressed || pending || !selectedContactId ? .65 : 1 }]}><Save color={theme.onAsk} size={18} /><SpText style={{ color: theme.onAsk }}>{pending ? "Kaydediliyor…" : "Teması kaydet"}</SpText></Pressable>
          </> : null}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { padding: space.xl, paddingBottom: space["5xl"], gap: space.lg }, header: { gap: space.sm, marginBottom: space.md },
  section: { gap: space.md }, choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, choice: { minHeight: 40, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center", paddingHorizontal: space.md },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md, fontFamily: "Karla_400Regular", fontSize: 16 }, multiline: { minHeight: 94, textAlignVertical: "top" },
  primary: { minHeight: 52, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }, error: { padding: space.md, borderRadius: radius.md },
  state: { minHeight: 250, alignItems: "center", justifyContent: "center", gap: space.md }, icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  divider: { flexDirection: "row", alignItems: "center", gap: space.md, marginVertical: space.sm }, line: { height: StyleSheet.hairlineWidth, flex: 1 },
  modeTabs: { minHeight: 52, padding: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, flexDirection: "row", gap: 4 },
  modeTab: { flex: 1, minHeight: 42, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
});
