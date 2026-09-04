import { useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from "react-native";
import { ArrowLeft, Download, LogOut, Save, ShieldCheck, Lock } from "lucide-react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiQueryKeys,
  countryLabels,
  createDataSubjectRequestSchema,
  dataSubjectRequestTypeLabels,
  dataSubjectRequestStatusLabels,
  dataSubjectRequestTypes,
  verbisStatusLabels,
  verbisStatuses,
  workspaceSettingsSchema,
  type DataSubjectRequestType,
  type WorkspaceSettingsDraft,
  type WorkspaceSettingsView,
} from "@spherepath/shared";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/features/auth/resources/session";
import { listContacts } from "@/features/contacts/resources/contacts";
import { SpCard } from "@/shared/ui/SpCard";
import { OfficeTeamPanel } from "../components/OfficeTeamPanel";
import { PhoneNormalizationCard } from "../components/PhoneNormalizationCard";
import { WhatsAppGroupSettingsCard } from "../components/WhatsAppGroupSettingsCard";
import { TelephonySettingsCard } from "../components/TelephonySettingsCard";
import { SpText } from "@/shared/ui/SpText";
import { ContactPicker } from "@/shared/ui/ContactPicker";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import { syncDailyPlanReminder } from "../resources/notifications";
import {
  createDataSubjectRequest,
  getContactDataExport,
  listDataSubjectRequests,
  loadWorkspaceSettings,
  resolveDataSubjectRequest,
  saveWorkspaceSettings,
} from "../resources/settings";
import { PhoneInput } from "@/shared/ui/MaskedInputs";
import { buttonMetrics, choiceMetrics, controlMetrics, largeButtonMetrics, textareaMetrics } from "@/shared/ui/SpField";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "İşlem tamamlanamadı.";
}

type SettingsArea = "start" | "communication" | "office" | "compliance";

function editableSettings(settings: WorkspaceSettingsView): WorkspaceSettingsDraft {
  return {
    displayName: settings.displayName,
    phone: settings.phone,
    defaultRegions: settings.defaultRegions,
    monthlyPortfolioTarget: settings.monthlyPortfolioTarget,
    weeklyCapacity: settings.weeklyCapacity,
    country: settings.country,
    dataControllerName: settings.dataControllerName,
    verbisStatus: settings.verbisStatus,
    trncFilingConfirmed: settings.trncFilingConfirmed,
    trncTransferLicenseConfirmed: settings.trncTransferLicenseConfirmed,
    dailyPlanReminderEnabled: settings.dailyPlanReminderEnabled,
    dailyPlanReminderHour: settings.dailyPlanReminderHour,
    dailyPlanReminderMinute: settings.dailyPlanReminderMinute,
  };
}

export default function SettingsView() {
  const theme = useSpTheme();
  const { session, signOut } = useSession();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: apiQueryKeys.workspaceSettings, queryFn: loadWorkspaceSettings });
  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts });
  const requestsQuery = useQuery({ queryKey: apiQueryKeys.dataSubjectRequests, queryFn: listDataSubjectRequests });
  const [editedDraft, setDraft] = useState<WorkspaceSettingsDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contactId, setContactId] = useState("");
  const [requestType, setRequestType] = useState<DataSubjectRequestType>("access");
  const [requestDetails, setRequestDetails] = useState("");
  const [settingsArea, setSettingsArea] = useState<SettingsArea>("start");

  const contacts = contactsQuery.data ?? [];
  const selectedContactId = contactId;
  const draft = editedDraft ?? (settingsQuery.data ? editableSettings(settingsQuery.data) : null);
  const inputStyle = [styles.input, { backgroundColor: theme.background, borderColor: theme.line, color: theme.textPrimary }];

  async function save() {
    if (!session || !draft) return;
    const parsed = workspaceSettingsSchema.safeParse(draft);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Ayarları kontrol et.");
    setPending(true); setError(null); setMessage(null);
    try {
      await saveWorkspaceSettings(session, parsed.data);
      const reminder = await syncDailyPlanReminder(parsed.data.dailyPlanReminderEnabled, parsed.data.dailyPlanReminderHour, parsed.data.dailyPlanReminderMinute);
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.workspaceSettings });
      setMessage(parsed.data.dailyPlanReminderEnabled && !reminder.scheduled ? "Ayarlar kaydedildi; bildirim izni verilmediği için hatırlatıcı kapalı kaldı." : "Ayarlar ve cihaz hatırlatıcısı güncellendi.");
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  async function createRequest() {
    if (!session) return;
    const parsed = createDataSubjectRequestSchema.safeParse({ contactId: selectedContactId, type: requestType, requesterReference: "Mobil başvuru", details: requestDetails });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Talebi kontrol et.");
    setPending(true); setError(null);
    try {
      await createDataSubjectRequest(session, parsed.data);
      setRequestDetails("");
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.dataSubjectRequests });
      setMessage("Veri sahibi talebi kaydedildi.");
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  async function approve(requestId: string, type: DataSubjectRequestType) {
    if (!session) return;
    if (type === "correction") return Alert.alert("Web uygulaması gerekli", "Düzeltilecek alanları güvenle seçmek için bu talebi web uygulamasından sonuçlandırın.");
    setPending(true); setError(null);
    try {
      await resolveDataSubjectRequest(session, { requestId, decision: "approved", resolutionNote: "Kimlik doğrulandı ve mobil uygulamadan onaylandı.", correctedContact: null });
      await Promise.all([queryClient.invalidateQueries({ queryKey: apiQueryKeys.dataSubjectRequests }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts })]);
      setMessage(type === "deletion" ? "Silme yayılım işi başlatıldı." : "Talep onaylandı.");
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  async function shareExport(requestId: string) {
    setPending(true); setError(null);
    try {
      const value = await getContactDataExport(requestId);
      await Share.share({ title: "Spherepath kişi veri kopyası", message: JSON.stringify(value, null, 2) });
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  if (settingsQuery.isPending || !draft) return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><View style={styles.state}><SpText color="secondary">Ayarlar yükleniyor…</SpText></View></SafeAreaView>;
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.headerRow}><Pressable accessibilityLabel="Geri" onPress={() => router.back()} style={[styles.iconButton, { borderColor: theme.line }]}><ArrowLeft color={theme.textSecondary} size={20} /></Pressable><View style={styles.headerCopy}><SpText variant="eyebrow" color="deed">ÇALIŞMA ALANI</SpText><SpText variant="hero">Ayarlar ve uyum</SpText></View></View>
    {message ? <View style={[styles.notice, { backgroundColor: theme.deedBg }]}><SpText color="deed">{message}</SpText></View> : null}{error ?? (settingsQuery.error ? messageFrom(settingsQuery.error) : null) ? <View style={[styles.notice, { backgroundColor: theme.askBg }]}><SpText color="ask">{error ?? messageFrom(settingsQuery.error)}</SpText></View> : null}
    <View accessibilityRole="tablist" style={styles.areaTabs}>{([{ key: "start", label: "Başlangıç" }, { key: "communication", label: "İletişim" }, { key: "office", label: "Ofis" }, { key: "compliance", label: "Uyum" }] as const).map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: settingsArea === item.key }} key={item.key} onPress={() => setSettingsArea(item.key)} style={[styles.areaTab, { backgroundColor: settingsArea === item.key ? theme.deedBg : theme.card, borderColor: settingsArea === item.key ? theme.deed : theme.line }]}><SpText variant="bodySmall" color={settingsArea === item.key ? "deed" : "secondary"}>{item.label}</SpText></Pressable>)}</View>
    {settingsArea === "start" ? <SpCard style={styles.card}><SpText variant="eyebrow" color="deed">PROFİL</SpText><SpText variant="title">Danışman ayarları</SpText><SpText variant="bodySmall" color="secondary">Ad soyad</SpText><TextInput style={inputStyle} value={draft.displayName} onChangeText={(displayName) => setDraft({ ...draft, displayName })} /><SpText variant="bodySmall" color="secondary">Telefon</SpText><PhoneInput style={inputStyle} value={draft.phone} onChangeText={(phone) => setDraft({ ...draft, phone })} /><SpText variant="bodySmall" color="secondary">Varsayılan bölgeler · virgülle ayır</SpText><TextInput style={inputStyle} value={draft.defaultRegions.join(", ")} onChangeText={(value) => setDraft({ ...draft, defaultRegions: value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 5) })} /><SpText variant="bodySmall" color="secondary">Günlük plan saati</SpText><View style={styles.row}><Pressable onPress={() => setDraft({ ...draft, dailyPlanReminderEnabled: !draft.dailyPlanReminderEnabled })} style={[styles.choice, { borderColor: draft.dailyPlanReminderEnabled ? theme.deed : theme.line, backgroundColor: draft.dailyPlanReminderEnabled ? theme.deedBg : theme.background }]}><SpText color={draft.dailyPlanReminderEnabled ? "deed" : "secondary"}>{draft.dailyPlanReminderEnabled ? "Hatırlatıcı açık" : "Hatırlatıcı kapalı"}</SpText></Pressable><TextInput keyboardType="number-pad" maxLength={2} style={[...inputStyle, styles.time]} value={String(draft.dailyPlanReminderHour)} onChangeText={(value) => setDraft({ ...draft, dailyPlanReminderHour: Math.min(23, Number(value) || 0) })} /><SpText>:</SpText><TextInput keyboardType="number-pad" maxLength={2} style={[...inputStyle, styles.time]} value={String(draft.dailyPlanReminderMinute)} onChangeText={(value) => setDraft({ ...draft, dailyPlanReminderMinute: Math.min(59, Number(value) || 0) })} /></View></SpCard> : null}
    {settingsArea === "office" ? <SpCard style={styles.card}><View style={styles.titleRow}><ShieldCheck color={theme.deed} size={20} /><SpText variant="title">Ofis uyumu</SpText></View><SpText variant="bodySmall" color="secondary">Ülke</SpText><View style={styles.row}>{(["TR", "TRNC"] as const).map((country) => <Pressable key={country} onPress={() => setDraft({ ...draft, country })} style={[styles.choice, { borderColor: draft.country === country ? theme.deed : theme.line, backgroundColor: draft.country === country ? theme.deedBg : theme.background }]}><SpText color={draft.country === country ? "deed" : "secondary"}>{countryLabels[country]}</SpText></Pressable>)}</View><SpText variant="bodySmall" color="secondary">Veri sorumlusu adı</SpText><TextInput style={inputStyle} value={draft.dataControllerName} onChangeText={(dataControllerName) => setDraft({ ...draft, dataControllerName })} /><SpText variant="bodySmall" color="secondary">VERBİS durumu</SpText><View style={styles.row}>{verbisStatuses.map((verbisStatus) => <Pressable key={verbisStatus} onPress={() => setDraft({ ...draft, verbisStatus })} style={[styles.choice, { borderColor: draft.verbisStatus === verbisStatus ? theme.deed : theme.line }]}><SpText variant="bodySmall" color={draft.verbisStatus === verbisStatus ? "deed" : "secondary"}>{verbisStatusLabels[verbisStatus]}</SpText></Pressable>)}</View>{draft.country === "TRNC" ? <><Pressable onPress={() => setDraft({ ...draft, trncFilingConfirmed: !draft.trncFilingConfirmed })} style={[styles.notice, { backgroundColor: theme.askBg }]}><SpText color="ask">{draft.trncFilingConfirmed ? "✓" : "○"} m.8 dosyalama bildirimi tamamlandı</SpText></Pressable><Pressable onPress={() => setDraft({ ...draft, trncTransferLicenseConfirmed: !draft.trncTransferLicenseConfirmed })} style={[styles.notice, { backgroundColor: theme.askBg }]}><SpText color="ask">{draft.trncTransferLicenseConfirmed ? "✓" : "○"} Yurt dışı aktarım ruhsatı alındı</SpText></Pressable></> : null}</SpCard> : null}
    {settingsArea === "start" || settingsArea === "office" ? <Pressable disabled={pending} onPress={() => void save()} style={[styles.primary, { backgroundColor: theme.ask }]}><Save color={theme.onAsk} size={18} /><SpText style={{ color: theme.onAsk }}>{pending ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</SpText></Pressable> : null}
    {settingsArea === "office" ? <OfficeTeamPanel /> : null}
    {settingsArea === "compliance" ? <SpCard style={styles.card}>
      <View style={styles.titleRow}><Lock color={theme.deed} size={20} /><SpText variant="title">Ses ve gizlilik</SpText></View>
      <SpText variant="bodySmall" color="secondary">Sesli not yalnız danışmanın görüşme bittikten sonra verdiği özettir; karşı taraf kaydedilmez.</SpText>
      {["Aktif görüşme sırasında kayıt başlatılmaz; yalnız olduğunuzu ayrıca onaylamanız gerekir.",
        "Ham ses ve maskelenmemiş döküm kalıcı olarak saklanmaz.",
        "Hassas veri kategorileri inceleme öncesinde maskelenir.",
        "Çıkarılan taslak, danışman onayı olmadan kişi veya fırsat kaydına dönüşmez."].map((item) => (
        <SpText key={item} variant="caption" color="secondary">· {item}</SpText>
      ))}
    </SpCard> : null}
    {settingsArea === "communication" ? <><WhatsAppGroupSettingsCard />{session?.role === "broker" ? <TelephonySettingsCard /> : <SpCard style={styles.card}><SpText variant="title">Ofis telefon altyapısı</SpText><SpText variant="bodySmall" color="secondary">Santral ve gelen arama eşleştirme ayarlarını ofis yöneticisi yönetir.</SpText></SpCard>}{session?.role === "broker" ? <PhoneNormalizationCard /> : null}</> : null}
    {settingsArea === "compliance" ? <><SpCard style={styles.card}><SpText variant="eyebrow" color="deed">VERİ SAHİBİ HAKLARI</SpText><SpText variant="title">Yeni talep</SpText><ContactPicker contacts={contacts} value={selectedContactId} onChange={setContactId} placeholder="Kişi ara ve seç" /><View style={styles.row}>{dataSubjectRequestTypes.map((type) => <Pressable key={type} onPress={() => setRequestType(type)} style={[styles.choice, { borderColor: requestType === type ? theme.deed : theme.line }]}><SpText variant="bodySmall" color={requestType === type ? "deed" : "secondary"}>{dataSubjectRequestTypeLabels[type]}</SpText></Pressable>)}</View><TextInput multiline placeholder="Talebin açıklaması" placeholderTextColor={theme.textTertiary} style={[...inputStyle, styles.textarea]} value={requestDetails} onChangeText={setRequestDetails} /><Pressable disabled={pending || !selectedContactId} onPress={() => void createRequest()} style={[styles.secondary, { borderColor: theme.line }]}><SpText color="deed">Talebi kaydet</SpText></Pressable></SpCard>{(requestsQuery.data ?? []).map((item) => <SpCard key={item.id} style={styles.request}><SpText variant="title">{item.contactName}</SpText><SpText variant="bodySmall" color="secondary">{dataSubjectRequestTypeLabels[item.type]} · {dataSubjectRequestStatusLabels[item.status]}</SpText><View style={styles.row}>{item.type === "access" && (item.status === "approved" || item.status === "completed") ? <Pressable onPress={() => void shareExport(item.id)} style={[styles.smallAction, { borderColor: theme.line }]}><Download color={theme.deed} size={15} /><SpText variant="bodySmall" color="deed">Veri kopyasını paylaş</SpText></Pressable> : null}{item.status === "pending_verification" ? <Pressable onPress={() => void approve(item.id, item.type)} style={[styles.smallAction, { borderColor: theme.line }]}><SpText variant="bodySmall" color="deed">Kimliği doğrula ve onayla</SpText></Pressable> : null}</View></SpCard>)}</> : null}
    {settingsArea === "start" ? <Pressable onPress={() => void signOut()} style={[styles.secondary, { borderColor: theme.line }]}><LogOut color={theme.textSecondary} size={18} /><SpText color="secondary">Oturumu kapat</SpText></Pressable> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { padding: space.xl, paddingBottom: space["5xl"], gap: space.lg }, state: { flex: 1, alignItems: "center", justifyContent: "center" }, headerRow: { flexDirection: "row", gap: space.md, alignItems: "flex-start", marginTop: space.lg }, headerCopy: { flex: 1, gap: space.xs }, iconButton: { width: 44, height: 44, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" }, areaTabs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, areaTab: { minHeight: 42, paddingHorizontal: space.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, alignItems: "center", justifyContent: "center" }, card: { gap: space.md }, titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm }, input: { ...controlMetrics }, textarea: { minHeight: textareaMetrics.minHeight, paddingTop: textareaMetrics.paddingVertical, textAlignVertical: "top" }, row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }, choice: { ...choiceMetrics }, time: { width: 54, textAlign: "center" }, primary: { ...largeButtonMetrics }, secondary: { ...buttonMetrics }, notice: { borderRadius: radius.md, padding: space.md }, request: { gap: space.sm }, smallAction: { minHeight: 38, paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: space.xs },
});
