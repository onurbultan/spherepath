import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { BriefcaseBusiness, Building2, CalendarPlus, Save, UserRoundPlus, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  classifyInboxText,
  contactDraftSchema,
  inboxItemKinds,
  nextActionTypeLabels,
  nextActionTypes,
  opportunityTypeLabels,
  portfolioAuthorizationLabels,
  propertyTypeLabels,
  type InboxItemKind,
  type InboxItemAnalysis,
  type InboxItemRecord,
  type NextActionType,
  type OpportunityType,
  type PortfolioItemDraft,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import type { ContactRecord } from "@/features/contacts/resources/contacts";
import { ContactPicker } from "@/shared/ui/ContactPicker";
import { SpText } from "@/shared/ui/SpText";
import { SpDateField } from "@/shared/ui/SpDateField";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import { analyzePortfolioText } from "@/features/matching/resources/portfolio";
import { analyzeInboxItem, changeInboxItem, processInboxItem as processItem } from "../resources/inbox";
import { PhoneInput } from "@/shared/ui/MaskedInputs";
import { buttonMetrics, choiceMetrics, controlMetrics, largeButtonMetrics } from "@/shared/ui/SpField";

/** Tomorrow morning, which is what an advisor picks unprompted more often than not. */
function defaultFollowUp(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const kindLabels: Record<InboxItemKind, string> = { note: "Not", person: "Kişi", property: "Mülk", requirement: "Talep", follow_up: "Takip" };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Not işlenemedi.";

export function NoteProcessingSheet({ item, contacts, onClose, onChanged }: { item: InboxItemRecord; contacts: readonly ContactRecord[]; onClose(): void; onChanged(): Promise<void> | void }) {
  const theme = useSpTheme(); const { session } = useSession();
  const inferred = classifyInboxText(item.safeText);
  const [text, setText] = useState(item.safeText); const [kind, setKind] = useState<InboxItemKind>(item.kind); const [contactId, setContactId] = useState(item.linkedContactId ?? "");
  const [personName, setPersonName] = useState(inferred.explicitContact?.fullName ?? ""); const [personPhone, setPersonPhone] = useState(inferred.explicitContact?.phone ?? "");
  const [opportunityType, setOpportunityType] = useState<Extract<OpportunityType, "buyer_requirement" | "tenant_requirement">>("buyer_requirement");
  const [actionType, setActionType] = useState<NextActionType>("call"); const [actionAt, setActionAt] = useState(defaultFollowUp);
  const [portfolio, setPortfolio] = useState<PortfolioItemDraft | null>(null); const [pending, setPending] = useState<"save" | "analyze" | "process" | null>(null); const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<InboxItemAnalysis | null>(null);
  const activeItem = item;
  const expectedAction = kind === "person" ? "contact_created" : kind === "property" ? "portfolio_created" : kind === "requirement" ? "opportunity_created" : kind === "follow_up" ? "follow_up_scheduled" : null;
  const processed = expectedAction !== null && activeItem.appliedActions.some((action) => action.type === expectedAction && action.undoneAt === null);
  const inputStyle = [styles.input, { borderColor: theme.line, backgroundColor: theme.background, color: theme.textPrimary }];
  const choice = (selected: boolean) => [styles.choice, { borderColor: selected ? theme.deed : theme.line, backgroundColor: selected ? theme.deedBg : theme.card }];
  async function saveEdits() { if (!session) return; await changeInboxItem(session, { inboxItemId: activeItem.id, text, kind, linkedContactId: contactId || null }); await onChanged(); }
  async function save() { setPending("save"); setError(null); try { await saveEdits(); onClose(); } catch (next) { setError(messageFrom(next)); } finally { setPending(null); } }
  async function analyze() { if (text.trim().length < 10) return setError("Mülkü çözümlemek için biraz daha bilgi yaz."); setPending("analyze"); setError(null); try { await saveEdits(); setPortfolio(await analyzePortfolioText(text.trim())); } catch (next) { setError(messageFrom(next)); } finally { setPending(null); } }
  async function analyzeRequirement() { if (text.trim().length < 10) return setError("Talebi çözümlemek için biraz daha bilgi yaz."); setPending("analyze"); setError(null); try { await saveEdits(); const result = await analyzeInboxItem({ inboxItemId: activeItem.id }); setAnalysis(result); setOpportunityType(result.opportunityType); if (result.nextActionType) setActionType(result.nextActionType); if (result.nextActionAt) setActionAt(new Date(result.nextActionAt - new Date(result.nextActionAt).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)); } catch (next) { setError(messageFrom(next)); } finally { setPending(null); } }
  async function process() {
    if (!session) return; setPending("process"); setError(null);
    try {
      await saveEdits(); const nextActionAt = new Date(actionAt).getTime();
      if (kind === "person") await processItem(session, { inboxItemId: activeItem.id, action: "person", contact: contactDraftSchema.parse({ fullName: personName, phone: personPhone, metAtPlace: "Akış notu", source: "other", role: "unknown" }) });
      else if (kind === "requirement") { if (!contactId) throw new Error("Talebi oluşturmak için kişiyi seç."); if (!analysis) throw new Error("Önce talep bilgilerini çıkarıp kontrol et."); await processItem(session, { inboxItemId: activeItem.id, action: "requirement", contactId, opportunityType, nextActionType: actionType, nextActionAt, approvedInsights: analysis.insights }); }
      else if (kind === "follow_up") { if (!contactId) throw new Error("Takibi oluşturmak için kişiyi seç."); await processItem(session, { inboxItemId: activeItem.id, action: "follow_up", contactId, nextActionType: actionType, nextActionAt }); }
      else if (kind === "property") { if (!portfolio) throw new Error("Önce mülk bilgilerini çıkar."); await processItem(session, { inboxItemId: activeItem.id, action: "portfolio", contactId: contactId || null, portfolio }); }
      await onChanged(); onClose();
    } catch (next) { setError(messageFrom(next)); } finally { setPending(null); }
  }
  return <Modal animationType="slide" presentationStyle="pageSheet" visible onRequestClose={onClose}><SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><View style={styles.flex}><SpText variant="eyebrow" color="deed">NOTU DÜZENLE VE İŞLE</SpText><SpText variant="hero">Bu not neye dönüşsün?</SpText></View><Pressable accessibilityLabel="Kapat" onPress={onClose} style={[styles.icon, { borderColor: theme.line }]}><X size={20} color={theme.textSecondary} /></Pressable></View>
    <SpText color="secondary">Önce metni ve türü düzelt; sonra gerçek kaydı oluştur.</SpText><SpText variant="title">Not metni</SpText><TextInput multiline style={[inputStyle, styles.multiline]} value={text} onChangeText={setText} />
    <SpText variant="title">Not türü</SpText><View style={styles.choices}>{inboxItemKinds.map((value) => <Pressable key={value} onPress={() => { setKind(value); setPortfolio(null); }} style={choice(kind === value)}><SpText variant="bodySmall" color={kind === value ? "deed" : "secondary"}>{kindLabels[value]}</SpText></Pressable>)}</View>
    {kind !== "person" ? <ContactPicker contacts={contacts} label={kind === "property" ? "İlgili kişi · isteğe bağlı" : "İlgili kişi"} value={contactId} onChange={setContactId} /> : <><SpText variant="title">Adı</SpText><TextInput style={inputStyle} value={personName} onChangeText={setPersonName} /><SpText variant="title">Telefon · isteğe bağlı</SpText><PhoneInput style={inputStyle} value={personPhone} onChangeText={setPersonPhone} /></>}
    {kind === "requirement" ? <>{analysis ? <View style={[styles.review, { backgroundColor: theme.goodBg, borderColor: theme.good }]}><SpText variant="title">Talep bilgileri çıkarıldı</SpText><SpText color="secondary">{analysis.insights.propertyPreferences.preferredLocations.join(", ") || "Bölge belirtilmedi"} · {analysis.insights.propertyPreferences.budgetRange?.max ? `${analysis.insights.propertyPreferences.budgetRange.max.toLocaleString("tr-TR")} TL` : "Bütçe belirtilmedi"}</SpText><SpText color="secondary">{analysis.insights.propertyPreferences.mustHaves.join(", ") || "Özel kriter belirtilmedi"}</SpText></View> : <Pressable disabled={pending !== null} onPress={() => void analyzeRequirement()} style={[styles.secondary, { borderColor: theme.line }]}><BriefcaseBusiness size={18} color={theme.deed} /><SpText color="deed">{pending === "analyze" ? "Talep çözümleniyor…" : "Talep bilgilerini ve tarihi çıkar"}</SpText></Pressable>}<SpText variant="title">Talep türü</SpText><View style={styles.choices}>{(["buyer_requirement", "tenant_requirement"] as const).map((value) => <Pressable key={value} onPress={() => setOpportunityType(value)} style={choice(opportunityType === value)}><SpText variant="bodySmall" color={opportunityType === value ? "deed" : "secondary"}>{opportunityTypeLabels[value]}</SpText></Pressable>)}</View></> : null}
    {kind === "requirement" || kind === "follow_up" ? <><SpText variant="title">Sonraki adım</SpText><View style={styles.choices}>{nextActionTypes.slice(0, 4).map((value) => <Pressable key={value} onPress={() => setActionType(value)} style={choice(actionType === value)}><SpText variant="bodySmall" color={actionType === value ? "deed" : "secondary"}>{nextActionTypeLabels[value]}</SpText></Pressable>)}</View><SpDateField label="Ne zaman?" onChange={setActionAt} value={actionAt} /></> : null}
    {kind === "property" ? portfolio ? <View style={[styles.review, { backgroundColor: theme.goodBg, borderColor: theme.good }]}><SpText variant="title">Çıkarılan portföy</SpText><SpText>{portfolio.headline}</SpText><SpText color="secondary">{portfolio.location} · {propertyTypeLabels[portfolio.propertyType]}</SpText><SpText color="secondary">{portfolio.askingPrice ? `${portfolio.askingPrice.amount.toLocaleString("tr-TR")} ${portfolio.askingPrice.currency}` : "Fiyat belirtilmedi"} · {(portfolio.propertyType === "land" ? portfolio.landAreaM2 : portfolio.areaM2) ?? "Alan belirtilmedi"} m²</SpText>{portfolio.propertyType !== "land" ? <SpText color="secondary">{portfolio.bedroomCount ?? "?"}+{portfolio.livingRoomCount ?? "?"} · {portfolioAuthorizationLabels[portfolio.authorizationType]}</SpText> : <SpText color="secondary">{portfolioAuthorizationLabels[portfolio.authorizationType]}</SpText>}<SpText color="secondary">{portfolio.summary}</SpText></View> : <Pressable disabled={pending !== null} onPress={() => void analyze()} style={[styles.secondary, { borderColor: theme.line }]}><Building2 size={18} color={theme.deed} /><SpText color="deed">{pending === "analyze" ? "Çözümleniyor…" : "Mülk bilgilerini çıkar"}</SpText></Pressable> : null}
    {processed ? <View style={[styles.review, { backgroundColor: theme.goodBg, borderColor: theme.good }]}><SpText color="deed">Bu not daha önce gerçek bir kayda dönüştürülmüş.</SpText></View> : null}{error ? <View style={[styles.review, { backgroundColor: theme.askBg, borderColor: theme.ask }]}><SpText color="ask">{error}</SpText></View> : null}
    <View style={styles.actions}><Pressable disabled={pending !== null} onPress={() => void save()} style={[styles.secondary, { borderColor: theme.line }]}><Save size={17} color={theme.textSecondary} /><SpText>{pending === "save" ? "Kaydediliyor…" : "Yalnızca kaydet"}</SpText></Pressable>{kind !== "note" ? <Pressable disabled={pending !== null || processed || (kind === "property" && !portfolio)} onPress={() => void process()} style={[styles.primary, { backgroundColor: theme.deed, opacity: pending !== null || processed || (kind === "property" && !portfolio) ? .5 : 1 }]}>{kind === "person" ? <UserRoundPlus size={17} color={theme.onDeed} /> : kind === "property" ? <Building2 size={17} color={theme.onDeed} /> : kind === "requirement" ? <BriefcaseBusiness size={17} color={theme.onDeed} /> : <CalendarPlus size={17} color={theme.onDeed} />}<SpText style={{ color: theme.onDeed }}>{pending === "process" ? "İşleniyor…" : kind === "person" ? "Kişi oluştur" : kind === "property" ? "Havuza ekle" : kind === "requirement" ? "Talep oluştur" : "Takibi oluştur"}</SpText></Pressable> : null}</View>
  </ScrollView></SafeAreaView></Modal>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: space.xl, paddingBottom: 80, gap: space.lg }, header: { flexDirection: "row", alignItems: "flex-start", gap: space.md }, flex: { flex: 1 }, icon: { width: 44, height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, alignItems: "center", justifyContent: "center" }, input: { ...controlMetrics }, multiline: { minHeight: 120, textAlignVertical: "top" }, choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, choice: { ...choiceMetrics }, review: { gap: space.sm, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md }, actions: { gap: space.sm, marginTop: space.md }, primary: { ...largeButtonMetrics }, secondary: { ...buttonMetrics } });
