import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ArrowRight, BriefcaseBusiness, Plus, X } from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  apiQueryKeys,
  nextActionTypeLabels,
  nextActionTypes,
  nextOpportunityStages,
  opportunityDraftSchema,
  opportunityStageLabels,
  opportunityTransitionSchema,
  opportunityTypeLabels,
  opportunityTypes,
  type NextActionType,
  type OpportunityStage,
  type OpportunityType,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listContacts } from "@/features/contacts/resources/contacts";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import { listOpportunities, moveOpportunity, saveOpportunity, type OpportunityRecord } from "../resources/opportunities";

const dayOptions = [{ label: "Yarın", days: 1 }, { label: "3 gün", days: 3 }, { label: "1 hafta", days: 7 }] as const;
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Fırsat işlemi tamamlanamadı.";

export default function OpportunitiesView() {
  const theme = useSpTheme();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const opportunitiesQuery = useQuery({ queryKey: apiQueryKeys.opportunities, queryFn: listOpportunities });
  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts });
  const contacts = contactsQuery.data ?? [];
  const opportunities = opportunitiesQuery.data ?? [];
  const [createOpen, setCreateOpen] = useState(false);
  const [moving, setMoving] = useState<OpportunityRecord | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactId, setContactId] = useState("");
  const [type, setType] = useState<OpportunityType>("seller_listing");
  const [actionType, setActionType] = useState<NextActionType>("call");
  const [actionDays, setActionDays] = useState(1);
  const [targetStage, setTargetStage] = useState<OpportunityStage>("first_contact");
  const [reason, setReason] = useState("");
  const [lostReason, setLostReason] = useState("");
  const selectedContactId = contactId || contacts[0]?.id || "";
  const choice = (selected: boolean) => [styles.choice, { backgroundColor: selected ? theme.deedBg : theme.background, borderColor: selected ? theme.deed : theme.line }];
  const inputStyle = [styles.input, { backgroundColor: theme.background, borderColor: theme.line, color: theme.textPrimary }];

  async function invalidate() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunities }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview })]);
  }

  async function create() {
    if (!session) return;
    const parsed = opportunityDraftSchema.safeParse({ subjectContactId: selectedContactId, type, nextActionType: actionType, nextActionAt: Date.now() + actionDays * 86_400_000 });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Fırsat bilgilerini kontrol et.");
    setPending(true); setError(null);
    try { await saveOpportunity(session, parsed.data); setCreateOpen(false); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  function openMove(opportunity: OpportunityRecord) {
    const next = nextOpportunityStages(opportunity.stage)[0];
    if (!next) return;
    setMoving(opportunity); setTargetStage(next); setActionType("call"); setActionDays(1); setReason(""); setLostReason(""); setError(null);
  }

  async function move() {
    if (!session || !moving) return;
    const terminal = targetStage === "won" || targetStage === "lost";
    const parsed = opportunityTransitionSchema.safeParse({ opportunityId: moving.id, toStage: targetStage, reason: reason.trim() || null, lostReason: targetStage === "lost" ? lostReason.trim() || null : null, nextActionType: terminal ? null : actionType, nextActionAt: terminal ? null : Date.now() + actionDays * 86_400_000 });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Aşama bilgilerini kontrol et.");
    setPending(true); setError(null);
    try { await moveOpportunity(session, parsed.data); setMoving(null); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}><ScrollView contentContainerStyle={styles.content}><View style={styles.header}><SpText variant="eyebrow" color="deed">PORTFÖY ÜRETİMİ</SpText><SpText variant="hero">Fırsatlar</SpText><SpText color="secondary">Her lead’i net bir aşama ve kabul edilmiş sonraki aksiyonla ilerlet.</SpText></View><Pressable disabled={!contacts.length} onPress={() => { setCreateOpen(true); setError(null); }} style={({ pressed }) => [styles.primary, { backgroundColor: theme.ask, opacity: pressed || !contacts.length ? .6 : 1 }]}><Plus color={theme.onAsk} size={19} /><SpText style={{ color: theme.onAsk }}>Yeni fırsat</SpText></Pressable>
  {error && !createOpen && !moving ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{error}</SpText></View> : null}
  {opportunitiesQuery.isPending ? <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Fırsatlar yükleniyor…</SpText></View> : opportunitiesQuery.error ? <SpCard style={styles.state}><SpText variant="title">Fırsatlar yüklenemedi</SpText><SpText color="secondary">{messageFrom(opportunitiesQuery.error)}</SpText></SpCard> : opportunities.length === 0 ? <SpCard style={styles.state}><BriefcaseBusiness color={theme.deed} size={26} /><SpText variant="title">İlk fırsatını oluştur</SpText><SpText color="secondary">Kayıtlı bir kişiyi lead’e dönüştür ve sıradaki aksiyonu belirle.</SpText></SpCard> : opportunities.map((opportunity) => <SpCard key={opportunity.id} style={styles.card}><View style={styles.cardTop}><View style={[styles.badge, { backgroundColor: opportunity.stage === "lost" ? theme.askBg : theme.deedBg }]}><SpText variant="eyebrow" color={opportunity.stage === "lost" ? "ask" : "deed"}>{opportunityStageLabels[opportunity.stage]}</SpText></View><SpText variant="bodySmall" color="secondary">{opportunityTypeLabels[opportunity.type]}</SpText></View><SpText variant="title">{opportunity.subjectContactName}</SpText><SpText color="secondary">{opportunity.nextActionAt ? `${opportunity.nextActionType ? nextActionTypeLabels[opportunity.nextActionType] : "Sonraki aksiyon"} · ${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(opportunity.nextActionAt)}` : "Fırsat kapandı"}</SpText>{nextOpportunityStages(opportunity.stage).length ? <Pressable onPress={() => openMove(opportunity)} style={[styles.secondary, { borderColor: theme.line }]}><SpText variant="bodySmall">Aşamayı ilerlet</SpText><ArrowRight color={theme.textSecondary} size={16} /></Pressable> : null}</SpCard>)}</ScrollView>

  <Modal animationType="slide" presentationStyle="pageSheet" visible={createOpen} onRequestClose={() => setCreateOpen(false)}><SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}><ScrollView contentContainerStyle={styles.form}><View style={styles.sheetHeader}><View><SpText variant="eyebrow" color="deed">YENİ LEAD</SpText><SpText variant="hero">Fırsat oluştur</SpText></View><Pressable onPress={() => setCreateOpen(false)} style={[styles.iconButton, { borderColor: theme.line }]}><X color={theme.textSecondary} size={20} /></Pressable></View><SpText variant="title">Kişi</SpText><View style={styles.choices}>{contacts.map((contact) => <Pressable key={contact.id} onPress={() => setContactId(contact.id)} style={choice(selectedContactId === contact.id)}><SpText variant="bodySmall" color={selectedContactId === contact.id ? "deed" : "secondary"}>{contact.fullName ?? contact.label}</SpText></Pressable>)}</View><SpText variant="title">Fırsat türü</SpText><View style={styles.choices}>{opportunityTypes.map((item) => <Pressable key={item} onPress={() => setType(item)} style={choice(type === item)}><SpText variant="bodySmall" color={type === item ? "deed" : "secondary"}>{opportunityTypeLabels[item]}</SpText></Pressable>)}</View><ActionFields actionType={actionType} actionDays={actionDays} choice={choice} setActionDays={setActionDays} setActionType={setActionType} />{error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{error}</SpText></View> : null}<Pressable disabled={pending} onPress={() => void create()} style={[styles.primary, { backgroundColor: theme.ask }]}><SpText style={{ color: theme.onAsk }}>{pending ? "Oluşturuluyor…" : "Fırsatı oluştur"}</SpText></Pressable></ScrollView></SafeAreaView></Modal>

  <Modal animationType="slide" presentationStyle="pageSheet" visible={Boolean(moving)} onRequestClose={() => setMoving(null)}><SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}><ScrollView contentContainerStyle={styles.form}><View style={styles.sheetHeader}><View><SpText variant="eyebrow" color="deed">AŞAMA GEÇİŞİ</SpText><SpText variant="hero">{moving?.subjectContactName}</SpText></View><Pressable onPress={() => setMoving(null)} style={[styles.iconButton, { borderColor: theme.line }]}><X color={theme.textSecondary} size={20} /></Pressable></View>{moving ? <><SpText variant="title">Yeni aşama</SpText><View style={styles.choices}>{nextOpportunityStages(moving.stage).map((stage) => <Pressable key={stage} onPress={() => setTargetStage(stage)} style={choice(targetStage === stage)}><SpText variant="bodySmall" color={targetStage === stage ? "deed" : "secondary"}>{opportunityStageLabels[stage]}</SpText></Pressable>)}</View><SpText variant="title">Geçiş notu</SpText><TextInput multiline placeholder="İsteğe bağlı" placeholderTextColor={theme.textTertiary} style={[inputStyle, styles.multiline]} value={reason} onChangeText={setReason} />{targetStage === "lost" ? <><SpText variant="title">Kayıp nedeni</SpText><TextInput multiline placeholder="Neden kaybedildi?" placeholderTextColor={theme.textTertiary} style={[inputStyle, styles.multiline]} value={lostReason} onChangeText={setLostReason} /></> : targetStage !== "won" ? <ActionFields actionType={actionType} actionDays={actionDays} choice={choice} setActionDays={setActionDays} setActionType={setActionType} /> : null}{error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{error}</SpText></View> : null}<Pressable disabled={pending} onPress={() => void move()} style={[styles.primary, { backgroundColor: theme.ask }]}><SpText style={{ color: theme.onAsk }}>{pending ? "İlerletiliyor…" : "Aşamayı kaydet"}</SpText></Pressable></> : null}</ScrollView></SafeAreaView></Modal>
  </SafeAreaView>;
}

function ActionFields({ actionType, actionDays, choice, setActionDays, setActionType }: { actionType: NextActionType; actionDays: number; choice(selected: boolean): object[]; setActionDays(value: number): void; setActionType(value: NextActionType): void }) {
  return <><SpText variant="title">Sonraki aksiyon</SpText><View style={styles.choices}>{nextActionTypes.map((item) => <Pressable key={item} onPress={() => setActionType(item)} style={choice(actionType === item)}><SpText variant="bodySmall" color={actionType === item ? "deed" : "secondary"}>{nextActionTypeLabels[item]}</SpText></Pressable>)}</View><SpText variant="title">Zaman</SpText><View style={styles.choices}>{dayOptions.map((item) => <Pressable key={item.days} onPress={() => setActionDays(item.days)} style={choice(actionDays === item.days)}><SpText variant="bodySmall" color={actionDays === item.days ? "deed" : "secondary"}>{item.label}</SpText></Pressable>)}</View></>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: space.xl, paddingBottom: space["5xl"], gap: space.lg }, header: { gap: space.sm }, primary: { minHeight: 50, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }, state: { minHeight: 240, alignItems: "center", justifyContent: "center", gap: space.md }, card: { gap: space.md }, cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }, badge: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.sm }, secondary: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }, error: { padding: space.md, borderRadius: radius.md }, form: { padding: space.xl, paddingBottom: space["5xl"], gap: space.md }, sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.md, marginBottom: space.md }, iconButton: { width: 44, height: 44, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" }, choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, choice: { minHeight: 40, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center", paddingHorizontal: space.md }, input: { minHeight: 50, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md, fontFamily: "Karla_400Regular", fontSize: 16 }, multiline: { minHeight: 92, textAlignVertical: "top" } });
