import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Check, ContactRound, Plus, Save, X } from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  apiQueryKeys,
  askOutcomeLabels,
  askOutcomes,
  contactDraftSchema,
  interactionChannelLabels,
  interactionChannels,
  interactionDirectionLabels,
  interactionDirections,
  interactionObjectiveLabels,
  interactionObjectives,
  manualInteractionSchema,
  nextActionTypeLabels,
  nextActionTypes,
  opportunityTypeLabels,
  suggestOpportunityTypeForRoles,
  type ManualInteractionDraft,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listContacts, saveContact } from "@/features/contacts/resources/contacts";
import { listOpportunities, saveOpportunity } from "@/features/opportunities/resources/opportunities";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { SpDateField } from "@/shared/ui/SpDateField";
import { ContactPicker } from "@/shared/ui/ContactPicker";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import { saveManualInteraction } from "../resources/interactions";
import { VoiceCaptureCard } from "../components/VoiceCaptureCard";
import { choiceMetrics, controlMetrics, largeButtonMetrics } from "@/shared/ui/SpField";

/** Tomorrow morning, which is what an advisor picks unprompted more often than not. */
function defaultFollowUp(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Temas kaydedilemedi.";
}

const whenOptions = [
  { label: "Şimdi", hoursAgo: null },
  { label: "Birkaç saat önce", hoursAgo: 4 },
  { label: "Dün", hoursAgo: 24 },
] as const;

export default function CaptureView() {
  const params = useLocalSearchParams<{ contactId?: string }>();
  const router = useRouter();
  const requestedContactId = typeof params.contactId === "string" ? params.contactId : "";
  const theme = useSpTheme();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactId, setContactId] = useState(requestedContactId);
  const [channel, setChannel] = useState<ManualInteractionDraft["channel"]>("in_person");
  const [objective, setObjective] = useState<ManualInteractionDraft["objective"]>("get_acquainted");
  const [outcome, setOutcome] = useState("");
  const [askOutcome, setAskOutcome] = useState<ManualInteractionDraft["askOutcome"]>("not_asked");
  const [nextActionType, setNextActionType] = useState<ManualInteractionDraft["nextActionType"]>(null);
  const [nextActionAtValue, setNextActionAtValue] = useState("");
  const [noteSummary, setNoteSummary] = useState("");
  const [direction, setDirection] = useState<ManualInteractionDraft["direction"]>("mutual");
  const [hoursAgo, setHoursAgo] = useState<number | null>(null);
  const [captureMode, setCaptureMode] = useState<"voice" | "manual">("voice");
  const [quickContactOpen, setQuickContactOpen] = useState(false);
  const [quickContactName, setQuickContactName] = useState("");
  const [quickContactPhone, setQuickContactPhone] = useState("");
  const [quickContactPending, setQuickContactPending] = useState(false);
  const [quickContactError, setQuickContactError] = useState<string | null>(null);
  const [opportunityPending, setOpportunityPending] = useState(false);
  const [createdOpportunityId, setCreatedOpportunityId] = useState<string | null>(null);
  const [opportunityError, setOpportunityError] = useState<string | null>(null);

  const contactsQuery = useQuery({
    queryKey: apiQueryKeys.contacts,
    queryFn: listContacts,
    enabled: Boolean(session),
  });
  const contacts = contactsQuery.data ?? [];
  const selectedContactId = contacts.some((contact) => contact.id === contactId) ? contactId : "";
  const selectedContact = contacts.find((contact) => contact.id === selectedContactId) ?? null;
  const selectedContactName = selectedContact?.fullName ?? selectedContact?.label ?? "Seçilen kişi";
  const suggestedOpportunityType = suggestOpportunityTypeForRoles(selectedContact?.roles ?? []);
  const opportunitiesQuery = useQuery({
    queryKey: apiQueryKeys.opportunities,
    queryFn: listOpportunities,
    enabled: Boolean(session && saved && suggestedOpportunityType),
  });
  const existingOpportunity = opportunitiesQuery.data?.find((opportunity) => (
    opportunity.subjectContactId === selectedContactId
    && opportunity.type === suggestedOpportunityType
    && opportunity.stage !== "won"
    && opportunity.stage !== "lost"
  )) ?? null;
  const availableOpportunityId = createdOpportunityId ?? existingOpportunity?.id ?? null;

  async function createQuickContact() {
    if (!session) return;
    const parsed = contactDraftSchema.safeParse({
      fullName: quickContactName,
      phone: quickContactPhone,
      metAtPlace: "",
      source: "in_person",
      role: "unknown",
    });
    if (!parsed.success) {
      setQuickContactError(parsed.error.issues[0]?.message ?? "Kişi bilgilerini kontrol et.");
      return;
    }
    setQuickContactPending(true);
    setQuickContactError(null);
    try {
      const contact = await saveContact(session, parsed.data);
      setContactId(contact.id);
      setQuickContactOpen(false);
      setQuickContactName("");
      setQuickContactPhone("");
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts });
    } catch (nextError) {
      setQuickContactError(messageFrom(nextError));
    } finally {
      setQuickContactPending(false);
    }
  }

  async function submit() {
    if (!session) return;
    const nextActionAt = nextActionAtValue ? new Date(nextActionAtValue).getTime() : null;
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

  async function createOpportunityFromInteraction() {
    if (!session || !suggestedOpportunityType || !nextActionType || !nextActionAtValue || availableOpportunityId) return;
    setOpportunityPending(true);
    setOpportunityError(null);
    try {
      const created = await saveOpportunity(session, {
        subjectContactId: selectedContactId,
        type: suggestedOpportunityType,
        nextActionType,
        nextActionAt: new Date(nextActionAtValue).getTime(),
      });
      setCreatedOpportunityId(created.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunities }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ]);
    } catch (nextError) {
      setOpportunityError(nextError instanceof Error ? nextError.message : "Fırsat oluşturulamadı.");
    } finally {
      setOpportunityPending(false);
    }
  }

  function reset() {
    setContactId("");
    setChannel("in_person");
    setObjective("get_acquainted");
    setDirection("mutual");
    setOutcome("");
    setNoteSummary("");
    setAskOutcome("not_asked");
    setNextActionType(null);
    setNextActionAtValue("");
    setSaved(false);
    setCreatedOpportunityId(null);
    setOpportunityError(null);
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
          <SpCard style={styles.state}><ContactRound color={theme.deed} size={26} /><SpText variant="title">Görüşmedeki kişiyi ekle</SpText><SpText color="secondary">Adı yeterli; kayıttan ayrılmadan hemen görüşme notuna dönersin.</SpText><Pressable onPress={() => setQuickContactOpen(true)} style={[styles.primary, { backgroundColor: theme.ask, alignSelf: "stretch" }]}><Plus color={theme.onAsk} size={18} /><SpText style={{ color: theme.onAsk }}>Hızlı kişi ekle</SpText></Pressable></SpCard>
        ) : saved ? (
          <SpCard style={styles.state}><View style={[styles.icon, { backgroundColor: theme.deedBg }]}><Check color={theme.deed} size={24} /></View><SpText variant="eyebrow" color="deed">KAYDEDİLDİ</SpText><SpText variant="title">{selectedContactName} için temas kaydedildi</SpText><SpText color="secondary">Sonuç: {outcome}</SpText>{nextActionType ? <SpText color="secondary">Sonraki adım: {nextActionTypeLabels[nextActionType]}</SpText> : <SpText color="secondary">Sonraki adım planlanmadı.</SpText>}{suggestedOpportunityType ? <View style={[styles.opportunityPrompt, { backgroundColor: theme.deedBg, borderColor: theme.deed }]}><View style={styles.opportunityCopy}><SpText variant="title">{opportunityTypeLabels[suggestedOpportunityType]}</SpText><SpText variant="bodySmall" color="secondary">{availableOpportunityId ? existingOpportunity && !createdOpportunityId ? "Bu kişi için açık fırsat zaten var." : "Görüşmedeki takip bilgileriyle fırsat oluşturuldu." : nextActionType && nextActionAtValue ? "Rol, aksiyon ve tarih hazır; tekrar doldurmadan fırsata dönüştür." : "Fırsat için sonraki aksiyon ve tarihi tamamla."}</SpText></View>{availableOpportunityId ? <Pressable onPress={() => router.push("/(tabs)/opportunities")} style={[styles.primary, { backgroundColor: theme.ask }]}><SpText style={{ color: theme.onAsk }}>Fırsatı görüntüle</SpText></Pressable> : nextActionType && nextActionAtValue ? <Pressable disabled={opportunityPending || opportunitiesQuery.isPending} onPress={() => void createOpportunityFromInteraction()} style={[styles.primary, { backgroundColor: theme.ask, opacity: opportunityPending || opportunitiesQuery.isPending ? .65 : 1 }]}><SpText style={{ color: theme.onAsk }}>{opportunityPending ? "Fırsat açılıyor…" : opportunitiesQuery.isPending ? "Açık fırsat kontrol ediliyor…" : `Fırsat aç: ${opportunityTypeLabels[suggestedOpportunityType]}`}</SpText></Pressable> : <Pressable onPress={() => router.push({ pathname: "/(tabs)/opportunities", params: { create: "1", contactId: selectedContactId } })} style={[styles.primary, { backgroundColor: theme.ask }]}><SpText style={{ color: theme.onAsk }}>Fırsat ayrıntılarını tamamla</SpText></Pressable>}</View> : null}{opportunityError ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{opportunityError}</SpText></View> : null}<Pressable disabled={opportunityPending} onPress={reset} style={[styles.secondary, { borderColor: theme.line, opacity: opportunityPending ? .65 : 1 }]}><SpText>Yeni kişi için temas kaydet</SpText></Pressable></SpCard>
        ) : <>
          <View accessibilityRole="tablist" style={[styles.modeTabs, { borderColor: theme.line, backgroundColor: theme.sunk }]}><Pressable accessibilityRole="tab" accessibilityState={{ selected: captureMode === "voice" }} onPress={() => setCaptureMode("voice")} style={[styles.modeTab, captureMode === "voice" && { backgroundColor: theme.card }]}><SpText color={captureMode === "voice" ? "deed" : "secondary"}>Sesli anlat</SpText></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: captureMode === "manual" }} onPress={() => setCaptureMode("manual")} style={[styles.modeTab, captureMode === "manual" && { backgroundColor: theme.card }]}><SpText color={captureMode === "manual" ? "deed" : "secondary"}>Manuel yaz</SpText></Pressable></View>
          <Pressable onPress={() => setQuickContactOpen(true)} style={[styles.quickContact, { borderColor: theme.line }]}><Plus color={theme.deed} size={16} /><SpText variant="bodySmall" color="deed">Listede yoksa hızlı kişi ekle</SpText></Pressable>
          {captureMode === "voice" ? <VoiceCaptureCard key={selectedContactId} session={session!} contacts={contacts} initialContactId={selectedContactId} onSaved={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
              queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
            ]);
          }} /> : null}
          {captureMode === "manual" ? <>
          <SpCard style={styles.section}><SpText variant="eyebrow">1 · KİM</SpText><ContactPicker contacts={contacts} value={selectedContactId} onChange={setContactId} /><SpText variant="title">Kanal</SpText><View accessibilityLabel="Kanal" accessibilityRole="radiogroup" style={styles.choices}>{interactionChannels.map((item) => <Pressable {...radioProps(channel === item)} key={item} onPress={() => setChannel(item)} style={choice(channel === item)}><SpText variant="bodySmall" color={channel === item ? "deed" : "secondary"}>{interactionChannelLabels[item]}</SpText></Pressable>)}</View><SpText variant="title">Amaç</SpText><View accessibilityLabel="Amaç" accessibilityRole="radiogroup" style={styles.choices}>{interactionObjectives.map((item) => <Pressable {...radioProps(objective === item)} key={item} onPress={() => setObjective(item)} style={choice(objective === item)}><SpText variant="bodySmall" color={objective === item ? "deed" : "secondary"}>{interactionObjectiveLabels[item]}</SpText></Pressable>)}</View></SpCard>
          <SpCard style={styles.section}><SpText variant="eyebrow">2 · NE OLDU</SpText><SpText variant="title">Kısa sonuç</SpText><TextInput accessibilityLabel="Kısa sonuç" multiline placeholder="Örn. Salı günü satış planını konuşacağız." placeholderTextColor={theme.textTertiary} style={[inputStyle, styles.multiline]} value={outcome} onChangeText={setOutcome} /><SpText variant="title">Talep sonucu</SpText><View accessibilityLabel="Talep sonucu" accessibilityRole="radiogroup" style={styles.choices}>{askOutcomes.map((item) => <Pressable {...radioProps(askOutcome === item)} key={item} onPress={() => setAskOutcome(item)} style={choice(askOutcome === item)}><SpText variant="bodySmall" color={askOutcome === item ? "deed" : "secondary"}>{askOutcomeLabels[item]}</SpText></Pressable>)}</View><SpText variant="title">Yön</SpText><View accessibilityLabel="Yön" accessibilityRole="radiogroup" style={styles.choices}>{interactionDirections.map((item) => <Pressable {...radioProps(direction === item)} key={item} onPress={() => setDirection(item)} style={choice(direction === item)}><SpText variant="bodySmall" color={direction === item ? "deed" : "secondary"}>{interactionDirectionLabels[item]}</SpText></Pressable>)}</View><SpText variant="title">Ne zaman oldu</SpText><View accessibilityLabel="Ne zaman oldu" accessibilityRole="radiogroup" style={styles.choices}>{whenOptions.map((item) => <Pressable {...radioProps(hoursAgo === item.hoursAgo)} key={item.label} onPress={() => setHoursAgo(item.hoursAgo)} style={choice(hoursAgo === item.hoursAgo)}><SpText variant="bodySmall" color={hoursAgo === item.hoursAgo ? "deed" : "secondary"}>{item.label}</SpText></Pressable>)}</View><SpText variant="title">Ek not</SpText><TextInput accessibilityLabel="Ek not" multiline placeholder="İsteğe bağlı" placeholderTextColor={theme.textTertiary} style={[inputStyle, styles.multiline]} value={noteSummary} onChangeText={setNoteSummary} /></SpCard>
          <SpCard style={styles.section}><SpText variant="eyebrow">3 · SONRAKİ ADIM</SpText><SpText variant="title">Aksiyon</SpText><View accessibilityLabel="Aksiyon" accessibilityRole="radiogroup" style={styles.choices}><Pressable {...radioProps(nextActionType === null)} onPress={() => { setNextActionType(null); setNextActionAtValue(""); }} style={choice(nextActionType === null)}><SpText variant="bodySmall" color={nextActionType === null ? "deed" : "secondary"}>Henüz yok</SpText></Pressable>{nextActionTypes.map((item) => <Pressable {...radioProps(nextActionType === item)} key={item} onPress={() => { setNextActionType(item); setNextActionAtValue((current) => current || defaultFollowUp()); }} style={choice(nextActionType === item)}><SpText variant="bodySmall" color={nextActionType === item ? "deed" : "secondary"}>{nextActionTypeLabels[item]}</SpText></Pressable>)}</View>{nextActionType ? <SpDateField label="Zaman" onChange={setNextActionAtValue} value={nextActionAtValue} /> : null}</SpCard>
          {error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{error}</SpText></View> : null}
          <Pressable accessibilityRole="button" disabled={pending || !selectedContactId} onPress={() => void submit()} style={({ pressed }) => [styles.primary, { backgroundColor: theme.ask, opacity: pressed || pending || !selectedContactId ? .65 : 1 }]}><Save color={theme.onAsk} size={18} /><SpText style={{ color: theme.onAsk }}>{pending ? "Kaydediliyor…" : selectedContact ? `${selectedContactName} için kaydet` : "Teması kaydet"}</SpText></Pressable>
          </> : null}
        </>}
      </ScrollView>
      <Modal animationType="slide" onRequestClose={() => setQuickContactOpen(false)} presentationStyle="pageSheet" visible={quickContactOpen}>
        <SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}><View style={styles.modalTitle}><SpText variant="eyebrow" color="deed">AKIŞTAN ÇIKMADAN</SpText><SpText variant="hero">Hızlı kişi ekle</SpText><SpText color="secondary">Yalnız ad zorunlu. Ayrıntıları daha sonra tamamlayabilirsin.</SpText></View><Pressable accessibilityLabel="Kapat" onPress={() => setQuickContactOpen(false)} style={[styles.iconButton, { borderColor: theme.line }]}><X color={theme.textSecondary} size={20} /></Pressable></View>
            <SpText variant="title">Ad veya tanımlayıcı</SpText><TextInput autoFocus placeholder="Örn. Elif Hanım" placeholderTextColor={theme.textTertiary} style={inputStyle} value={quickContactName} onChangeText={setQuickContactName} />
            <SpText variant="title">Telefon · isteğe bağlı</SpText><TextInput keyboardType="phone-pad" placeholder="05xx xxx xx xx" placeholderTextColor={theme.textTertiary} style={inputStyle} value={quickContactPhone} onChangeText={setQuickContactPhone} />
            {quickContactError ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{quickContactError}</SpText></View> : null}
            <Pressable disabled={quickContactPending} onPress={() => void createQuickContact()} style={[styles.primary, { backgroundColor: theme.ask, opacity: quickContactPending ? .65 : 1 }]}><SpText style={{ color: theme.onAsk }}>{quickContactPending ? "Ekleniyor…" : "Kişiyi ekle ve devam et"}</SpText></Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { padding: space.xl, paddingBottom: space["5xl"], gap: space.lg }, header: { gap: space.sm, marginBottom: space.md },
  section: { gap: space.md }, choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, choice: { ...choiceMetrics },
  input: { ...controlMetrics }, multiline: { minHeight: 94, textAlignVertical: "top" },
  primary: { ...largeButtonMetrics }, error: { padding: space.md, borderRadius: radius.md },
  secondary: { ...largeButtonMetrics, borderWidth: StyleSheet.hairlineWidth, backgroundColor: "transparent" },
  opportunityPrompt: { alignSelf: "stretch", padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, gap: space.md }, opportunityCopy: { gap: space.xs },
  state: { minHeight: 250, alignItems: "center", justifyContent: "center", gap: space.md }, icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  divider: { flexDirection: "row", alignItems: "center", gap: space.md, marginVertical: space.sm }, line: { height: StyleSheet.hairlineWidth, flex: 1 },
  modeTabs: { minHeight: 52, padding: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, flexDirection: "row", gap: 4 },
  modeTab: { flex: 1, minHeight: 42, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  quickContact: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  modalContent: { padding: space.xl, paddingBottom: space["5xl"], gap: space.md }, modalTitle: { flex: 1, gap: space.sm },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.lg }, iconButton: { width: 44, height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
