import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ArrowRight, BriefcaseBusiness, Clock3, Plus, X } from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  apiQueryKeys,
  nextActionTypeLabels,
  nextActionTypes,
  nextOpportunityStages,
  opportunityDraftSchema,
  opportunityStageCorrectionSchema,
  opportunityStageLabel,
  opportunityStages,
  opportunityTransitionSchema,
  opportunityTypeLabels,
  opportunityTypes,
  suggestOpportunityTypeForRoles,
  type NextActionType,
  type OpportunityStage,
  type OpportunityType,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listContacts } from "@/features/contacts/resources/contacts";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { SpDateField } from "@/shared/ui/SpDateField";
import { ContactPicker } from "@/shared/ui/ContactPicker";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import { correctOpportunity, getOpportunityDetail, listOpportunities, moveOpportunity, saveOpportunity, type OpportunityRecord } from "../resources/opportunities";
import { buttonMetrics, choiceMetrics, controlMetrics, largeButtonMetrics } from "@/shared/ui/SpField";

/** Tomorrow morning, which is what an advisor picks unprompted more often than not. */
function defaultFollowUp(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function dateTimeValue(timestamp: number | null): string {
  if (timestamp === null) return defaultFollowUp();
  const date = new Date(timestamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Fırsat işlemi tamamlanamadı.";

export default function OpportunitiesView() {
  const params = useLocalSearchParams<{ create?: string; contactId?: string }>();
  const router = useRouter();
  const requestedContactId = typeof params.contactId === "string" ? params.contactId : "";
  const [referenceTime] = useState(Date.now);
  const theme = useSpTheme();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const opportunitiesQuery = useQuery({ queryKey: apiQueryKeys.opportunities, queryFn: listOpportunities });
  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts });
  const contacts = contactsQuery.data ?? [];
  const opportunities = opportunitiesQuery.data ?? [];
  const [createOpen, setCreateOpen] = useState(false);
  const activeCreateOpen = createOpen || params.create === "1";
  const [moving, setMoving] = useState<OpportunityRecord | null>(null);
  const [correcting, setCorrecting] = useState<OpportunityRecord | null>(null);
  const [selected, setSelected] = useState<OpportunityRecord | null>(null);
  const detailQuery = useQuery({ queryKey: apiQueryKeys.opportunityDetail(selected?.id ?? "none"), queryFn: () => getOpportunityDetail(selected!.id), enabled: Boolean(selected) });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactId, setContactId] = useState(requestedContactId);
  const [type, setType] = useState<OpportunityType>("seller_listing");
  const [typeWasChosen, setTypeWasChosen] = useState(false);
  const [actionType, setActionType] = useState<NextActionType>("call");
  const [actionAt, setActionAt] = useState(defaultFollowUp());
  const [targetStage, setTargetStage] = useState<OpportunityStage>("first_contact");
  const [reason, setReason] = useState("");
  const [lostReason, setLostReason] = useState(""); const [lostKind, setLostKind] = useState<"lost" | "duplicate">("lost");
  const [correctionReason, setCorrectionReason] = useState("");
  const [journeyFilter, setJourneyFilter] = useState<"owner" | "requirement">("owner");
  const visibleOpportunities = opportunities.filter((opportunity) => {
    const requirement = opportunity.type === "buyer_requirement" || opportunity.type === "tenant_requirement";
    return (journeyFilter === "requirement") === requirement;
  });
  const selectedContactId = contactId || (contacts.some((contact) => contact.id === requestedContactId) ? requestedContactId : "");
  const suggestedType = suggestOpportunityTypeForRoles(contacts.find((contact) => contact.id === selectedContactId)?.roles ?? []);
  const effectiveType = typeWasChosen ? type : suggestedType ?? type;
  const chooseContact = (nextContactId: string) => {
    setContactId(nextContactId);
    setTypeWasChosen(false);
    const suggestion = suggestOpportunityTypeForRoles(contacts.find((contact) => contact.id === nextContactId)?.roles ?? []);
    if (suggestion) setType(suggestion);
  };
  // A seller can genuinely have two properties, so this warns rather than blocks.
  const duplicateOpportunity = selectedContactId
    ? opportunities.find((item) => item.subjectContactId === selectedContactId && item.type === effectiveType
        && !["won", "lost"].includes(item.stage))
    : undefined;
  const choice = (selected: boolean) => [styles.choice, { backgroundColor: selected ? theme.deedBg : theme.background, borderColor: selected ? theme.deed : theme.line }];
  const inputStyle = [styles.input, { backgroundColor: theme.background, borderColor: theme.line, color: theme.textPrimary }];

  async function invalidate() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunities }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }), ...(moving ? [queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunityDetail(moving.id) })] : [])]);
  }

  function closeCreate() {
    setCreateOpen(false);
    if (params.create === "1") router.setParams({ create: undefined, contactId: undefined });
  }

  async function create() {
    if (!session) return;
    const parsed = opportunityDraftSchema.safeParse({ subjectContactId: selectedContactId, type: effectiveType, nextActionType: actionType, nextActionAt: new Date(actionAt).getTime() });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Fırsat bilgilerini kontrol et.");
    setPending(true); setError(null);
    try { await saveOpportunity(session, parsed.data); setJourneyFilter(effectiveType === "buyer_requirement" || effectiveType === "tenant_requirement" ? "requirement" : "owner"); closeCreate(); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  function openMove(opportunity: OpportunityRecord) {
    const next = nextOpportunityStages(opportunity.stage)[0];
    if (!next) return;
    setMoving(opportunity); setTargetStage(next); setActionType(opportunity.nextActionType ?? "call"); setActionAt(dateTimeValue(opportunity.nextActionAt)); setReason(""); setLostReason(""); setError(null);
  }

  async function move() {
    if (!session || !moving) return;
    const terminal = targetStage === "won" || targetStage === "lost";
    const parsed = opportunityTransitionSchema.safeParse({ opportunityId: moving.id, toStage: targetStage, reason: reason.trim() || null, lostReason: targetStage === "lost" ? lostReason.trim() || null : null, lostKind: targetStage === "lost" ? lostKind : "lost", nextActionType: terminal ? null : actionType, nextActionAt: terminal ? null : new Date(actionAt).getTime() });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Aşama bilgilerini kontrol et.");
    setPending(true); setError(null);
    try { await moveOpportunity(session, parsed.data); setMoving(null); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  async function correct() {
    if (!session || !correcting) return;
    const terminal = targetStage === "won" || targetStage === "lost";
    const parsed = opportunityStageCorrectionSchema.safeParse({ opportunityId: correcting.id, toStage: targetStage, reason: correctionReason, lostReason: targetStage === "lost" ? lostReason.trim() || null : null, lostKind: targetStage === "lost" ? lostKind : "lost", nextActionType: terminal ? null : actionType, nextActionAt: terminal ? null : new Date(actionAt).getTime() });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Düzeltme bilgilerini kontrol et.");
    setPending(true); setError(null);
    try { await correctOpportunity(session, parsed.data); setCorrecting(null); setSelected(null); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}><ScrollView contentContainerStyle={styles.content}><View style={styles.header}><SpText variant="eyebrow" color="deed">AKTİF TALEPLER</SpText><SpText variant="hero">Fırsatlar</SpText><SpText color="secondary">Her talebi bulunduğu aşama ve sıradaki işle birlikte ilerlet.</SpText></View><Pressable disabled={!contacts.length} onPress={() => { setCreateOpen(true); setError(null); }} style={({ pressed }) => [styles.primary, { backgroundColor: theme.ask, opacity: pressed || !contacts.length ? .6 : 1 }]}><Plus color={theme.onAsk} size={19} /><SpText style={{ color: theme.onAsk }}>Yeni fırsat</SpText></Pressable>
  {error && !createOpen && !moving ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{error}</SpText></View> : null}
  {opportunities.length ? <View style={styles.choices}><Pressable onPress={() => setJourneyFilter("owner")} style={choice(journeyFilter === "owner")}><SpText variant="bodySmall" color={journeyFilter === "owner" ? "deed" : "secondary"}>Portföy adayları</SpText></Pressable><Pressable onPress={() => setJourneyFilter("requirement")} style={choice(journeyFilter === "requirement")}><SpText variant="bodySmall" color={journeyFilter === "requirement" ? "deed" : "secondary"}>Müşteri talepleri</SpText></Pressable></View> : null}
  {opportunitiesQuery.isPending ? <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Fırsatlar yükleniyor…</SpText></View> : opportunitiesQuery.error ? <SpCard style={styles.state}><SpText variant="title">Fırsatlar yüklenemedi</SpText><SpText color="secondary">{messageFrom(opportunitiesQuery.error)}</SpText></SpCard> : opportunities.length === 0 ? <SpCard style={styles.state}><BriefcaseBusiness color={theme.deed} size={26} /><SpText variant="title">İlk fırsatını oluştur</SpText><SpText color="secondary">Kayıtlı bir kişiyi talebe dönüştür ve sıradaki işi belirle.</SpText></SpCard> : visibleOpportunities.length === 0 ? <SpCard style={styles.state}><SpText variant="title">Bu yolda kayıt yok</SpText><SpText color="secondary">Diğer fırsat yoluna geçebilir veya yeni kayıt oluşturabilirsin.</SpText></SpCard> : visibleOpportunities.map((opportunity) => <SpCard key={opportunity.id} style={styles.card}><View style={styles.cardTop}><View style={[styles.badge, { backgroundColor: opportunity.stage === "lost" ? theme.askBg : theme.deedBg }]}><SpText variant="eyebrow" color={opportunity.stage === "lost" ? "ask" : "deed"}>{opportunityStageLabel(opportunity.stage, opportunity.type)}</SpText></View><SpText variant="bodySmall" color="secondary">{opportunityTypeLabels[opportunity.type]}</SpText></View><SpText variant="title">{opportunity.subjectContactName}</SpText><SpText color="secondary">{opportunity.nextActionAt ? `${opportunity.nextActionType ? nextActionTypeLabels[opportunity.nextActionType] : "Sonraki aksiyon"} · ${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(opportunity.nextActionAt)}` : "Fırsat kapandı"}</SpText><View style={styles.cardActions}><Pressable onPress={() => setSelected(opportunity)} style={[styles.secondary, styles.flexAction, { borderColor: theme.line }]}><Clock3 color={theme.textSecondary} size={16} /><SpText variant="bodySmall">Geçmiş</SpText></Pressable>{nextOpportunityStages(opportunity.stage).length ? <Pressable onPress={() => openMove(opportunity)} style={[styles.secondary, styles.flexAction, { borderColor: theme.line }]}><SpText variant="bodySmall">İlerlet</SpText><ArrowRight color={theme.textSecondary} size={16} /></Pressable> : null}</View></SpCard>)}</ScrollView>

  <Modal animationType="slide" presentationStyle="pageSheet" visible={Boolean(selected)} onRequestClose={() => setSelected(null)}><SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}><ScrollView contentContainerStyle={styles.form}><View style={styles.sheetHeader}><View><SpText variant="eyebrow" color="deed">FIRSAT GEÇMİŞİ</SpText><SpText variant="hero">{selected?.subjectContactName}</SpText></View><Pressable onPress={() => setSelected(null)} style={[styles.iconButton, { borderColor: theme.line }]}><X color={theme.textSecondary} size={20} /></Pressable></View>{detailQuery.isPending ? <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Geçmiş yükleniyor…</SpText></View> : detailQuery.error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{messageFrom(detailQuery.error)}</SpText></View> : <>{selected ? <View style={[styles.detailSummary, { backgroundColor: theme.background }]}><SpText variant="eyebrow" color="deed">{opportunityStageLabel(selected.stage, selected.type)}</SpText><SpText color="secondary">Bu aşamada {Math.max(0, Math.floor((referenceTime - selected.stageEnteredAt) / 86_400_000))} gündür.</SpText></View> : null}<View style={styles.timeline}>{detailQuery.data?.stageEvents.map((stageEvent, index) => <View key={stageEvent.id} style={styles.timelineItem}><View style={styles.timelineRail}><View style={[styles.timelineDot, { backgroundColor: theme.deed }]} />{index < (detailQuery.data?.stageEvents.length ?? 0) - 1 ? <View style={[styles.timelineLine, { backgroundColor: theme.line }]} /> : null}</View><View style={styles.timelineContent}><SpText variant="title">{selected ? opportunityStageLabel(stageEvent.toStage as OpportunityStage, selected.type) : stageEvent.toStage}</SpText><SpText variant="bodySmall" color="secondary">{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(stageEvent.occurredAt)}</SpText>{stageEvent.reason ? <SpText color="secondary">{stageEvent.reason}</SpText> : null}</View></View>)}</View>{selected ? <Pressable onPress={() => { setCorrecting(selected); setTargetStage(opportunityStages.find((stage) => stage !== selected.stage) ?? "new_lead"); setCorrectionReason(""); setLostReason(""); setError(null); }} style={[styles.secondary, { borderColor: theme.line }]}><SpText variant="bodySmall">Aşamayı düzelt</SpText></Pressable> : null}</>}</ScrollView></SafeAreaView></Modal>

  <Modal animationType="slide" presentationStyle="pageSheet" visible={activeCreateOpen} onRequestClose={closeCreate}><SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}><ScrollView contentContainerStyle={styles.form}><View style={styles.sheetHeader}><View><SpText variant="eyebrow" color="deed">YENİ TALEP</SpText><SpText variant="hero">Fırsat oluştur</SpText></View><Pressable onPress={closeCreate} style={[styles.iconButton, { borderColor: theme.line }]}><X color={theme.textSecondary} size={20} /></Pressable></View><ContactPicker contacts={contacts} value={selectedContactId} onChange={chooseContact} /><SpText variant="title">Fırsat türü</SpText><View style={styles.choices}>{opportunityTypes.map((item) => <Pressable key={item} onPress={() => { setType(item); setTypeWasChosen(true); }} style={choice(effectiveType === item)}><SpText variant="bodySmall" color={effectiveType === item ? "deed" : "secondary"}>{opportunityTypeLabels[item]}</SpText></Pressable>)}</View><ActionFields actionType={actionType} actionAt={actionAt} choice={choice} setActionAt={setActionAt} setActionType={setActionType} />{duplicateOpportunity ? <View style={[styles.error, { backgroundColor: theme.deedBg }]}><SpText color="deed" variant="bodySmall">Bu kişinin zaten açık bir “{opportunityTypeLabels[effectiveType]}” fırsatı var. Ayrı bir mülk için ikincisini açabilirsiniz.</SpText></View> : null}{error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{error}</SpText></View> : null}<Pressable disabled={pending || !selectedContactId} onPress={() => void create()} style={[styles.primary, { backgroundColor: theme.ask, opacity: pending || !selectedContactId ? .6 : 1 }]}><SpText style={{ color: theme.onAsk }}>{pending ? "Oluşturuluyor…" : duplicateOpportunity ? "Yine de oluştur" : "Fırsatı oluştur"}</SpText></Pressable></ScrollView></SafeAreaView></Modal>

  <Modal animationType="slide" presentationStyle="pageSheet" visible={Boolean(moving)} onRequestClose={() => setMoving(null)}><SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}><ScrollView contentContainerStyle={styles.form}><View style={styles.sheetHeader}><View><SpText variant="eyebrow" color="deed">AŞAMA GEÇİŞİ</SpText><SpText variant="hero">{moving?.subjectContactName}</SpText></View><Pressable onPress={() => setMoving(null)} style={[styles.iconButton, { borderColor: theme.line }]}><X color={theme.textSecondary} size={20} /></Pressable></View>{moving ? <><SpText variant="title">Yeni aşama</SpText><View style={styles.choices}>{nextOpportunityStages(moving.stage).map((stage) => <Pressable key={stage} onPress={() => setTargetStage(stage)} style={choice(targetStage === stage)}><SpText variant="bodySmall" color={targetStage === stage ? "deed" : "secondary"}>{opportunityStageLabel(stage, moving.type)}</SpText></Pressable>)}</View><SpText variant="title">Geçiş notu</SpText><TextInput multiline placeholder="İsteğe bağlı" placeholderTextColor={theme.textTertiary} style={[inputStyle, styles.multiline]} value={reason} onChangeText={setReason} />{targetStage === "lost" ? <><SpText variant="title">Kaydı neden kapatıyorsun?</SpText><View style={styles.choices}>{([["lost", "İş kaybedildi"], ["duplicate", "Mükerrer kayıt"]] as const).map(([kind, label]) => <Pressable key={kind} onPress={() => setLostKind(kind)} style={choice(lostKind === kind)}><SpText variant="bodySmall" color={lostKind === kind ? "deed" : "secondary"}>{label}</SpText></Pressable>)}</View><SpText variant="title">{lostKind === "duplicate" ? "Açıklama" : "Kayıp nedeni"}</SpText><TextInput multiline placeholder="Neden kaybedildi?" placeholderTextColor={theme.textTertiary} style={[inputStyle, styles.multiline]} value={lostReason} onChangeText={setLostReason} /></> : targetStage !== "won" ? <ActionFields actionType={actionType} actionAt={actionAt} choice={choice} setActionAt={setActionAt} setActionType={setActionType} /> : null}{error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{error}</SpText></View> : null}<Pressable disabled={pending} onPress={() => void move()} style={[styles.primary, { backgroundColor: theme.ask }]}><SpText style={{ color: theme.onAsk }}>{pending ? "İlerletiliyor…" : "Aşamayı kaydet"}</SpText></Pressable></> : null}</ScrollView></SafeAreaView></Modal>

  <Modal animationType="slide" presentationStyle="pageSheet" visible={Boolean(correcting)} onRequestClose={() => setCorrecting(null)}><SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}><ScrollView contentContainerStyle={styles.form}><View style={styles.sheetHeader}><View><SpText variant="eyebrow" color="deed">KAYIT DÜZELTME</SpText><SpText variant="hero">{correcting?.subjectContactName}</SpText></View><Pressable onPress={() => setCorrecting(null)} style={[styles.iconButton, { borderColor: theme.line }]}><X color={theme.textSecondary} size={20} /></Pressable></View>{correcting ? <><SpText color="secondary">Geçmiş silinmez; bu düzeltme denetim izine eklenir.</SpText><SpText variant="title">Doğru aşama</SpText><View style={styles.choices}>{opportunityStages.filter((stage) => stage !== correcting.stage).map((stage) => <Pressable key={stage} onPress={() => setTargetStage(stage)} style={choice(targetStage === stage)}><SpText variant="bodySmall" color={targetStage === stage ? "deed" : "secondary"}>{opportunityStageLabel(stage, correcting.type)}</SpText></Pressable>)}</View><SpText variant="title">Düzeltme nedeni</SpText><TextInput multiline placeholder="Neden düzeltiyorsun?" placeholderTextColor={theme.textTertiary} style={[inputStyle, styles.multiline]} value={correctionReason} onChangeText={setCorrectionReason} />{targetStage === "lost" ? <><SpText variant="title">Kaydı neden kapatıyorsun?</SpText><View style={styles.choices}>{([["lost", "İş kaybedildi"], ["duplicate", "Mükerrer kayıt"]] as const).map(([kind, label]) => <Pressable key={kind} onPress={() => setLostKind(kind)} style={choice(lostKind === kind)}><SpText variant="bodySmall" color={lostKind === kind ? "deed" : "secondary"}>{label}</SpText></Pressable>)}</View><SpText variant="title">{lostKind === "duplicate" ? "Açıklama" : "Kayıp nedeni"}</SpText><TextInput multiline style={[inputStyle, styles.multiline]} value={lostReason} onChangeText={setLostReason} /></> : targetStage !== "won" ? <ActionFields actionType={actionType} actionAt={actionAt} choice={choice} setActionAt={setActionAt} setActionType={setActionType} /> : null}{error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{error}</SpText></View> : null}<Pressable disabled={pending || correctionReason.trim().length < 2} onPress={() => void correct()} style={[styles.primary, { backgroundColor: theme.ask, opacity: pending || correctionReason.trim().length < 2 ? .6 : 1 }]}><SpText style={{ color: theme.onAsk }}>{pending ? "Kaydediliyor…" : "Düzeltmeyi kaydet"}</SpText></Pressable></> : null}</ScrollView></SafeAreaView></Modal>
  </SafeAreaView>;
}

function ActionFields({ actionType, actionAt, choice, setActionAt, setActionType }: { actionType: NextActionType; actionAt: string; choice(selected: boolean): object[]; setActionAt(value: string): void; setActionType(value: NextActionType): void }) {
  return <><SpText variant="title">Sonraki aksiyon</SpText><View style={styles.choices}>{nextActionTypes.map((item) => <Pressable key={item} onPress={() => setActionType(item)} style={choice(actionType === item)}><SpText variant="bodySmall" color={actionType === item ? "deed" : "secondary"}>{nextActionTypeLabels[item]}</SpText></Pressable>)}</View><SpText variant="title">Zaman</SpText><View style={styles.choices}>{<SpDateField label="Zaman" onChange={setActionAt} value={actionAt} />}</View></>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: space.xl, paddingBottom: space["5xl"], gap: space.lg }, header: { gap: space.sm }, primary: { ...largeButtonMetrics }, state: { minHeight: 240, alignItems: "center", justifyContent: "center", gap: space.md }, card: { gap: space.md }, cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }, cardActions: { flexDirection: "row", gap: space.sm }, flexAction: { flex: 1 }, badge: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.sm }, secondary: { ...buttonMetrics }, error: { padding: space.md, borderRadius: radius.md }, form: { padding: space.xl, paddingBottom: space["5xl"], gap: space.md }, sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.md, marginBottom: space.md }, iconButton: { width: 44, height: 44, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" }, detailSummary: { padding: space.lg, borderRadius: radius.md, gap: space.sm }, timeline: { gap: 0 }, timelineItem: { flexDirection: "row", gap: space.md, minHeight: 86 }, timelineRail: { width: 16, alignItems: "center" }, timelineDot: { width: 11, height: 11, borderRadius: 6, marginTop: 6 }, timelineLine: { width: StyleSheet.hairlineWidth, flex: 1 }, timelineContent: { flex: 1, gap: space.xs, paddingBottom: space.lg }, choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, choice: { ...choiceMetrics }, input: { ...controlMetrics }, multiline: { minHeight: 92, textAlignVertical: "top" } });
