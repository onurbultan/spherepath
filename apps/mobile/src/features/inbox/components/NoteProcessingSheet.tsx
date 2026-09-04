import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { BriefcaseBusiness, Building2, CalendarPlus, Save, UserRoundPlus, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  classifyInboxText,
  contactRoleLabels,
  contactRoles,
  contactDraftSchema,
  contactSourceLabels,
  contactSources,
  inboxItemKinds,
  inboxOpportunityType,
  nextActionTypeLabels,
  nextActionTypes,
  opportunityTypeLabels,
  portfolioAuthorizationLabels,
  propertyFeatureLabels,
  propertyFeatures,
  propertyTypeLabels,
  type InboxItemKind,
  type InboxItemAnalysis,
  type InboxItemRecord,
  type NextActionType,
  type OpportunityType,
  type ContactDraft,
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
function localDateTime(timestamp: number): string { const date = new Date(timestamp); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }

const kindLabels: Record<InboxItemKind, string> = { note: "Not", person: "Kişi", property: "Mülk", requirement: "Talep", follow_up: "Takip" };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Not işlenemedi.";
const numberOrNull = (value: string): number | null => value.trim() ? Number(value) : null;

function roleForOpportunity(type: OpportunityType): ContactDraft["role"] {
  if (type === "seller_listing") return "seller";
  if (type === "landlord_listing") return "landlord";
  if (type === "tenant_requirement") return "tenant";
  return "buyer";
}

function requirementOpportunity(type: OpportunityType): Extract<OpportunityType, "buyer_requirement" | "tenant_requirement"> {
  return type === "tenant_requirement" ? type : "buyer_requirement";
}

export function NoteProcessingSheet({ item, contacts, initialKind, onClose, onChanged }: { item: InboxItemRecord; contacts: readonly ContactRecord[]; initialKind?: InboxItemKind; onClose(): void; onChanged(updatedItem?: InboxItemRecord): Promise<void> | void }) {
  const theme = useSpTheme(); const { session } = useSession();
  const inferred = classifyInboxText(item.safeText);
  const inferredOpportunity = item.analysis ? inboxOpportunityType(item.analysis.insights) : "buyer_requirement";
  const [text, setText] = useState(item.safeText); const [kind, setKind] = useState<InboxItemKind>(initialKind ?? item.kind); const [contactId, setContactId] = useState(item.linkedContactId ?? "");
  const [personName, setPersonName] = useState(item.analysis?.insights.contactName?.trim() || inferred.explicitContact?.fullName || ""); const [personPhone, setPersonPhone] = useState(item.analysis?.insights.contactPhone?.trim() || inferred.explicitContact?.phone || "");
  const [personSource, setPersonSource] = useState<ContactDraft["source"]>(/telefon|arad|çağrı/iu.test(item.safeText) ? "inbound_call" : "in_person");
  const [personRole, setPersonRole] = useState<ContactDraft["role"]>(roleForOpportunity(inferredOpportunity));
  const [metAtPlace, setMetAtPlace] = useState("Görüşme notu");
  const [opportunityType, setOpportunityType] = useState<OpportunityType>(inferredOpportunity);
  const [createPersonOpportunity, setCreatePersonOpportunity] = useState(Boolean(item.analysis?.insights.propertySituations.length || item.analysis?.insights.propertyPreferences.transactionType));
  const [actionType, setActionType] = useState<NextActionType>(item.analysis?.nextActionType ?? "call"); const [actionAt, setActionAt] = useState(() => item.analysis?.nextActionAt ? localDateTime(item.analysis.nextActionAt) : defaultFollowUp());
  const [portfolio, setPortfolio] = useState<PortfolioItemDraft | null>(null); const [pending, setPending] = useState<"save" | "analyze" | "process" | null>(null); const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<InboxItemAnalysis | null>(item.analysis);
  const activeItem = item;
  const expectedAction = kind === "person" ? "contact_created" : kind === "property" ? "portfolio_created" : kind === "requirement" ? "opportunity_created" : kind === "follow_up" ? "follow_up_scheduled" : null;
  const processed = expectedAction !== null && activeItem.appliedActions.some((action) => action.type === expectedAction && action.undoneAt === null);
  const inputStyle = [styles.input, { borderColor: theme.line, backgroundColor: theme.background, color: theme.textPrimary }];
  const choice = (selected: boolean) => [styles.choice, { borderColor: selected ? theme.deed : theme.line, backgroundColor: selected ? theme.deedBg : theme.card }];
  useEffect(() => {
    if (analysis !== null || item.analysis === null) return;
    const result = item.analysis;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnalysis(result);
    const inferredType = inboxOpportunityType(result.insights);
    setOpportunityType(inferredType);
    setPersonRole(roleForOpportunity(inferredType));
    setCreatePersonOpportunity(Boolean(result.insights.propertySituations.length || result.insights.propertyPreferences.transactionType));
    if (result.insights.contactName?.trim()) setPersonName(result.insights.contactName.trim());
    if (result.insights.contactPhone?.trim()) setPersonPhone(result.insights.contactPhone.trim());
    if (result.nextActionType) setActionType(result.nextActionType);
    if (result.nextActionAt) setActionAt(localDateTime(result.nextActionAt));
  }, [analysis, item.analysis]);
  async function saveEdits() { if (!session) return null; const updatedItem = await changeInboxItem(session, { inboxItemId: activeItem.id, text, kind, linkedContactId: contactId || null }); await onChanged(updatedItem); return updatedItem; }
  async function save() { setPending("save"); setError(null); try { await saveEdits(); onClose(); } catch (next) { setError(messageFrom(next)); } finally { setPending(null); } }
  async function analyze() { if (text.trim().length < 10) return setError("Mülkü çözümlemek için biraz daha bilgi yaz."); setPending("analyze"); setError(null); try { await saveEdits(); setPortfolio(await analyzePortfolioText(text.trim())); } catch (next) { setError(messageFrom(next)); } finally { setPending(null); } }
  async function analyzeRequirement() { if (text.trim().length < 10) return setError("Notu çözümlemek için biraz daha bilgi yaz."); setPending("analyze"); setError(null); try { await saveEdits(); const result = await analyzeInboxItem({ inboxItemId: activeItem.id }); const inferredType = inboxOpportunityType(result.insights); setAnalysis(result); setOpportunityType(inferredType); setPersonRole(roleForOpportunity(inferredType)); setCreatePersonOpportunity(Boolean(result.insights.propertySituations.length || result.insights.propertyPreferences.transactionType)); if (result.insights.contactName?.trim()) setPersonName(result.insights.contactName.trim()); if (result.insights.contactPhone?.trim()) setPersonPhone(result.insights.contactPhone.trim()); if (result.nextActionType) setActionType(result.nextActionType); if (result.nextActionAt) setActionAt(localDateTime(result.nextActionAt)); } catch (next) { setError(messageFrom(next)); } finally { setPending(null); } }
  async function process() {
    if (!session) return; setPending("process"); setError(null);
    try {
      await saveEdits(); const nextActionAt = new Date(actionAt).getTime();
      let processedItem: InboxItemRecord | null = null;
      if (kind === "person") processedItem = (await processItem(session, { inboxItemId: activeItem.id, action: "person", contact: contactDraftSchema.parse({ fullName: personName, phone: personPhone, metAtPlace, source: personSource, role: personRole, nextActionType: actionType, nextActionAt }), approvedInsights: analysis?.insights ?? item.analysis?.insights, recordInteraction: true, opportunityType: createPersonOpportunity ? opportunityType : null })).item;
      else if (kind === "requirement") { if (!contactId) throw new Error("Talebi oluşturmak için kişiyi seç."); if (!analysis) throw new Error("Önce talep bilgilerini çıkarıp kontrol et."); processedItem = (await processItem(session, { inboxItemId: activeItem.id, action: "requirement", contactId, opportunityType: requirementOpportunity(opportunityType), nextActionType: actionType, nextActionAt, approvedInsights: analysis.insights })).item; }
      else if (kind === "follow_up") { if (!contactId) throw new Error("Takibi oluşturmak için kişiyi seç."); processedItem = (await processItem(session, { inboxItemId: activeItem.id, action: "follow_up", contactId, nextActionType: actionType, nextActionAt })).item; }
      else if (kind === "property") { if (!portfolio) throw new Error("Önce mülk bilgilerini çıkar."); processedItem = (await processItem(session, { inboxItemId: activeItem.id, action: "portfolio", contactId: contactId || null, portfolio })).item; }
      await onChanged(processedItem ?? undefined); onClose();
    } catch (next) { setError(messageFrom(next)); } finally { setPending(null); }
  }
  return <Modal animationType="slide" presentationStyle="pageSheet" visible onRequestClose={onClose}><SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><View style={styles.flex}><SpText variant="eyebrow" color="deed">NOTU DÜZENLE VE İŞLE</SpText><SpText variant="hero">Bu not neye dönüşsün?</SpText></View><Pressable accessibilityLabel="Kapat" onPress={onClose} style={[styles.icon, { borderColor: theme.line }]}><X size={20} color={theme.textSecondary} /></Pressable></View>
    <SpText color="secondary">Önce metni ve türü düzelt; sonra gerçek kaydı oluştur.</SpText><SpText variant="title">Not metni</SpText><TextInput multiline style={[inputStyle, styles.multiline]} value={text} onChangeText={setText} />
    <SpText variant="title">Not türü</SpText><View style={styles.choices}>{inboxItemKinds.map((value) => <Pressable key={value} onPress={() => { setKind(value); setPortfolio(null); }} style={choice(kind === value)}><SpText variant="bodySmall" color={kind === value ? "deed" : "secondary"}>{kindLabels[value]}</SpText></Pressable>)}</View>
    {kind !== "person" ? <ContactPicker contacts={contacts} label={kind === "property" ? "İlgili kişi · isteğe bağlı" : "İlgili kişi"} value={contactId} onChange={setContactId} /> : <><View style={[styles.review, { backgroundColor: theme.deedBg, borderColor: theme.deed }]}><SpText variant="title">Kişi, görüşme ve takip birlikte kaydedilecek</SpText><SpText color="secondary">Notta iş tarifi varsa fırsatı da aynı adımda açabilirsin.</SpText></View>{analysis === null ? <Pressable disabled={pending !== null} onPress={() => void analyzeRequirement()} style={[styles.secondary, { borderColor: theme.line }]}><BriefcaseBusiness size={18} color={theme.deed} /><SpText color="deed">{pending === "analyze" ? "Not okunuyor…" : "Nottaki bilgileri çıkar"}</SpText></Pressable> : null}<SpText variant="title">Adı</SpText><TextInput style={inputStyle} value={personName} onChangeText={setPersonName} /><SpText variant="title">Telefon · isteğe bağlı</SpText><PhoneInput style={inputStyle} value={personPhone} onChangeText={setPersonPhone} /><SpText variant="title">Tanışma / görüşme yeri</SpText><TextInput style={inputStyle} value={metAtPlace} onChangeText={setMetAtPlace} /><SpText variant="title">Kaynak</SpText><View style={styles.choices}>{contactSources.map((value) => <Pressable key={value} onPress={() => setPersonSource(value)} style={choice(personSource === value)}><SpText variant="bodySmall" color={personSource === value ? "deed" : "secondary"}>{contactSourceLabels[value]}</SpText></Pressable>)}</View><SpText variant="title">Rol</SpText><View style={styles.choices}>{contactRoles.map((value) => <Pressable key={value} onPress={() => setPersonRole(value)} style={choice(personRole === value)}><SpText variant="bodySmall" color={personRole === value ? "deed" : "secondary"}>{contactRoleLabels[value]}</SpText></Pressable>)}</View><Pressable onPress={() => setCreatePersonOpportunity((value) => !value)} style={[styles.secondary, { borderColor: createPersonOpportunity ? theme.deed : theme.line }]}><SpText color={createPersonOpportunity ? "deed" : "secondary"}>{createPersonOpportunity ? "✓ Fırsat oluşturulacak" : "Bu görüşmeden fırsat aç"}</SpText></Pressable>{createPersonOpportunity ? <><SpText variant="title">Fırsat türü</SpText><View style={styles.choices}>{(["buyer_requirement", "tenant_requirement", "seller_listing", "landlord_listing"] as const).map((value) => <Pressable key={value} onPress={() => { setOpportunityType(value); setPersonRole(roleForOpportunity(value)); }} style={choice(opportunityType === value)}><SpText variant="bodySmall" color={opportunityType === value ? "deed" : "secondary"}>{opportunityTypeLabels[value]}</SpText></Pressable>)}</View></> : null}</>}
    {kind === "requirement" ? <>{analysis ? <View style={[styles.review, { backgroundColor: theme.goodBg, borderColor: theme.good }]}><SpText variant="title">Talep bilgilerini kontrol et</SpText><SpText variant="bodySmall" color="secondary">Aranan bölgeler · virgülle ayır</SpText><TextInput style={inputStyle} value={analysis.insights.propertyPreferences.preferredLocations.join(", ")} onChangeText={(value) => setAnalysis({ ...analysis, insights: { ...analysis.insights, propertyPreferences: { ...analysis.insights.propertyPreferences, preferredLocations: value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 8) } } })} /><SpText variant="bodySmall" color="secondary">Azami bütçe</SpText><TextInput keyboardType="number-pad" style={inputStyle} value={analysis.insights.propertyPreferences.budgetRange?.max?.toString() ?? ""} onChangeText={(value) => setAnalysis({ ...analysis, insights: { ...analysis.insights, propertyPreferences: { ...analysis.insights.propertyPreferences, budgetRange: value.trim() ? { min: analysis.insights.propertyPreferences.budgetRange?.min ?? null, max: Number(value), currency: analysis.insights.propertyPreferences.budgetRange?.currency ?? "TRY" } : null } } })} /><View style={styles.choices}><View style={styles.field}><SpText variant="bodySmall" color="secondary">Oda</SpText><TextInput keyboardType="number-pad" style={inputStyle} value={analysis.insights.propertyPreferences.bedroomCountMin?.toString() ?? ""} onChangeText={(value) => setAnalysis({ ...analysis, insights: { ...analysis.insights, propertyPreferences: { ...analysis.insights.propertyPreferences, bedroomCountMin: numberOrNull(value) } } })} /></View><View style={styles.field}><SpText variant="bodySmall" color="secondary">Salon</SpText><TextInput keyboardType="number-pad" style={inputStyle} value={analysis.insights.propertyPreferences.livingRoomCountMin?.toString() ?? ""} onChangeText={(value) => setAnalysis({ ...analysis, insights: { ...analysis.insights, propertyPreferences: { ...analysis.insights.propertyPreferences, livingRoomCountMin: numberOrNull(value) } } })} /></View></View><SpText variant="bodySmall" color="secondary">Olmazsa olmazlar · virgülle ayır</SpText><TextInput style={inputStyle} value={analysis.insights.propertyPreferences.mustHaves.join(", ")} onChangeText={(value) => setAnalysis({ ...analysis, insights: { ...analysis.insights, propertyPreferences: { ...analysis.insights.propertyPreferences, mustHaves: value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 8) } } })} /></View> : <Pressable disabled={pending !== null} onPress={() => void analyzeRequirement()} style={[styles.secondary, { borderColor: theme.line }]}><BriefcaseBusiness size={18} color={theme.deed} /><SpText color="deed">{pending === "analyze" ? "Talep çözümleniyor…" : "Talep bilgilerini ve tarihi çıkar"}</SpText></Pressable>}<SpText variant="title">Talep türü</SpText><View style={styles.choices}>{(["buyer_requirement", "tenant_requirement"] as const).map((value) => <Pressable key={value} onPress={() => setOpportunityType(value)} style={choice(opportunityType === value)}><SpText variant="bodySmall" color={opportunityType === value ? "deed" : "secondary"}>{opportunityTypeLabels[value]}</SpText></Pressable>)}</View></> : null}
    {kind === "person" || kind === "requirement" || kind === "follow_up" ? <><SpText variant="title">{kind === "person" ? "İlk takip" : "Sonraki adım"}</SpText><View style={styles.choices}>{nextActionTypes.map((value) => <Pressable key={value} onPress={() => setActionType(value)} style={choice(actionType === value)}><SpText variant="bodySmall" color={actionType === value ? "deed" : "secondary"}>{nextActionTypeLabels[value]}</SpText></Pressable>)}</View><SpDateField label="Ne zaman?" onChange={setActionAt} value={actionAt} /></> : null}
    {kind === "property" ? portfolio ? <View style={[styles.review, { backgroundColor: theme.goodBg, borderColor: theme.good }]}><SpText variant="title">Çıkarılan portföyü kontrol et</SpText><SpText>{portfolio.headline}</SpText><SpText color="secondary">{portfolio.location} · {propertyTypeLabels[portfolio.propertyType]}</SpText><SpText color="secondary">{portfolio.askingPrice ? `${portfolio.askingPrice.amount.toLocaleString("tr-TR")} ${portfolio.askingPrice.currency}` : "Fiyat belirtilmedi"} · {(portfolio.propertyType === "land" ? portfolio.landAreaM2 : portfolio.areaM2) ?? "Alan belirtilmedi"} m²</SpText>{portfolio.propertyType !== "land" ? <SpText color="secondary">{portfolio.bedroomCount ?? "?"}+{portfolio.livingRoomCount ?? "?"} · {portfolioAuthorizationLabels[portfolio.authorizationType]}</SpText> : <SpText color="secondary">{portfolioAuthorizationLabels[portfolio.authorizationType]}</SpText>}<SpText variant="bodySmall" color="secondary">Yapılandırılmış özellikler</SpText><View style={styles.choices}>{propertyFeatures.map((feature) => <Pressable key={feature} onPress={() => setPortfolio({ ...portfolio, features: portfolio.features.includes(feature) ? portfolio.features.filter((item) => item !== feature) : [...portfolio.features, feature] })} style={choice(portfolio.features.includes(feature))}><SpText variant="bodySmall" color={portfolio.features.includes(feature) ? "deed" : "secondary"}>{propertyFeatureLabels[feature]}</SpText></Pressable>)}</View><SpText variant="bodySmall" color="secondary">Diğer özellikler · virgülle ayır</SpText><TextInput style={inputStyle} value={portfolio.attributes.join(", ")} onChangeText={(value) => setPortfolio({ ...portfolio, attributes: value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20) })} /><SpText color="secondary">{portfolio.summary}</SpText></View> : <Pressable disabled={pending !== null} onPress={() => void analyze()} style={[styles.secondary, { borderColor: theme.line }]}><Building2 size={18} color={theme.deed} /><SpText color="deed">{pending === "analyze" ? "Çözümleniyor…" : "Mülk bilgilerini çıkar"}</SpText></Pressable> : null}
    {processed ? <View style={[styles.review, { backgroundColor: theme.goodBg, borderColor: theme.good }]}><SpText color="deed">Bu not daha önce gerçek bir kayda dönüştürülmüş.</SpText></View> : null}{error ? <View style={[styles.review, { backgroundColor: theme.askBg, borderColor: theme.ask }]}><SpText color="ask">{error}</SpText></View> : null}
    <View style={styles.actions}><Pressable disabled={pending !== null} onPress={() => void save()} style={[styles.secondary, { borderColor: theme.line }]}><Save size={17} color={theme.textSecondary} /><SpText>{pending === "save" ? "Kaydediliyor…" : "Yalnızca kaydet"}</SpText></Pressable>{kind !== "note" ? <Pressable disabled={pending !== null || processed || (kind === "property" && !portfolio)} onPress={() => void process()} style={[styles.primary, { backgroundColor: theme.deed, opacity: pending !== null || processed || (kind === "property" && !portfolio) ? .5 : 1 }]}>{kind === "person" ? <UserRoundPlus size={17} color={theme.onDeed} /> : kind === "property" ? <Building2 size={17} color={theme.onDeed} /> : kind === "requirement" ? <BriefcaseBusiness size={17} color={theme.onDeed} /> : <CalendarPlus size={17} color={theme.onDeed} />}<SpText style={{ color: theme.onDeed }}>{pending === "process" ? "İşleniyor…" : kind === "person" ? "Kişi, görüşme ve işi oluştur" : kind === "property" ? "Havuza ekle" : kind === "requirement" ? "Talep oluştur" : "Takibi oluştur"}</SpText></Pressable> : null}</View>
  </ScrollView></SafeAreaView></Modal>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: space.xl, paddingBottom: 80, gap: space.lg }, header: { flexDirection: "row", alignItems: "flex-start", gap: space.md }, flex: { flex: 1 }, field: { flexGrow: 1, minWidth: 110, gap: space.xs }, icon: { width: 44, height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, alignItems: "center", justifyContent: "center" }, input: { ...controlMetrics }, multiline: { minHeight: 120, textAlignVertical: "top" }, choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, choice: { ...choiceMetrics }, review: { gap: space.sm, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md }, actions: { gap: space.sm, marginTop: space.md }, primary: { ...largeButtonMetrics }, secondary: { ...buttonMetrics } });
