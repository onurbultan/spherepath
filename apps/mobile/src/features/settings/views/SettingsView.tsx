import { useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from "react-native";
import { ArrowLeft, Download, LogOut, Save, ShieldCheck } from "lucide-react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiQueryKeys,
  countryLabels,
  createDataSubjectRequestSchema,
  dataSubjectRequestTypeLabels,
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
import { SpText } from "@/shared/ui/SpText";
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

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "İşlem tamamlanamadı.";
}

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

  const contacts = contactsQuery.data ?? [];
  const selectedContactId = contactId || contacts[0]?.id || "";
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

  async function shareExport(targetContactId: string) {
    setPending(true); setError(null);
    try {
      const value = await getContactDataExport(targetContactId);
      await Share.share({ title: "Spherepath kişi veri kopyası", message: JSON.stringify(value, null, 2) });
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  if (settingsQuery.isPending || !draft) return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><View style={styles.state}><SpText color="secondary">Ayarlar yükleniyor…</SpText></View></SafeAreaView>;
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.headerRow}><Pressable accessibilityLabel="Geri" onPress={() => router.back()} style={[styles.iconButton, { borderColor: theme.line }]}><ArrowLeft color={theme.textSecondary} size={20} /></Pressable><View style={styles.headerCopy}><SpText variant="eyebrow" color="deed">ÇALIŞMA ALANI</SpText><SpText variant="hero">Ayarlar ve uyum</SpText></View></View>
    {message ? <View style={[styles.notice, { backgroundColor: theme.deedBg }]}><SpText color="deed">{message}</SpText></View> : null}{error ?? (settingsQuery.error ? messageFrom(settingsQuery.error) : null) ? <View style={[styles.notice, { backgroundColor: theme.askBg }]}><SpText color="ask">{error ?? messageFrom(settingsQuery.error)}</SpText></View> : null}
    <SpCard style={styles.card}><SpText variant="eyebrow" color="deed">PROFİL</SpText><SpText variant="title">Danışman ayarları</SpText><SpText variant="bodySmall" color="secondary">Ad soyad</SpText><TextInput style={inputStyle} value={draft.displayName} onChangeText={(displayName) => setDraft({ ...draft, displayName })} /><SpText variant="bodySmall" color="secondary">Telefon</SpText><TextInput keyboardType="phone-pad" style={inputStyle} value={draft.phone} onChangeText={(phone) => setDraft({ ...draft, phone })} /><SpText variant="bodySmall" color="secondary">Varsayılan bölgeler · virgülle ayır</SpText><TextInput style={inputStyle} value={draft.defaultRegions.join(", ")} onChangeText={(value) => setDraft({ ...draft, defaultRegions: value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 5) })} /><SpText variant="bodySmall" color="secondary">Günlük plan saati</SpText><View style={styles.row}><Pressable onPress={() => setDraft({ ...draft, dailyPlanReminderEnabled: !draft.dailyPlanReminderEnabled })} style={[styles.choice, { borderColor: draft.dailyPlanReminderEnabled ? theme.deed : theme.line, backgroundColor: draft.dailyPlanReminderEnabled ? theme.deedBg : theme.background }]}><SpText color={draft.dailyPlanReminderEnabled ? "deed" : "secondary"}>{draft.dailyPlanReminderEnabled ? "Hatırlatıcı açık" : "Hatırlatıcı kapalı"}</SpText></Pressable><TextInput keyboardType="number-pad" maxLength={2} style={[...inputStyle, styles.time]} value={String(draft.dailyPlanReminderHour)} onChangeText={(value) => setDraft({ ...draft, dailyPlanReminderHour: Math.min(23, Number(value) || 0) })} /><SpText>:</SpText><TextInput keyboardType="number-pad" maxLength={2} style={[...inputStyle, styles.time]} value={String(draft.dailyPlanReminderMinute)} onChangeText={(value) => setDraft({ ...draft, dailyPlanReminderMinute: Math.min(59, Number(value) || 0) })} /></View></SpCard>
    <SpCard style={styles.card}><View style={styles.titleRow}><ShieldCheck color={theme.deed} size={20} /><SpText variant="title">Ofis uyumu</SpText></View><SpText variant="bodySmall" color="secondary">Ülke</SpText><View style={styles.row}>{(["TR", "TRNC"] as const).map((country) => <Pressable key={country} onPress={() => setDraft({ ...draft, country })} style={[styles.choice, { borderColor: draft.country === country ? theme.deed : theme.line, backgroundColor: draft.country === country ? theme.deedBg : theme.background }]}><SpText color={draft.country === country ? "deed" : "secondary"}>{countryLabels[country]}</SpText></Pressable>)}</View><SpText variant="bodySmall" color="secondary">Veri sorumlusu adı</SpText><TextInput style={inputStyle} value={draft.dataControllerName} onChangeText={(dataControllerName) => setDraft({ ...draft, dataControllerName })} /><SpText variant="bodySmall" color="secondary">VERBİS durumu</SpText><View style={styles.row}>{verbisStatuses.map((verbisStatus) => <Pressable key={verbisStatus} onPress={() => setDraft({ ...draft, verbisStatus })} style={[styles.choice, { borderColor: draft.verbisStatus === verbisStatus ? theme.deed : theme.line }]}><SpText variant="bodySmall" color={draft.verbisStatus === verbisStatus ? "deed" : "secondary"}>{verbisStatusLabels[verbisStatus]}</SpText></Pressable>)}</View>{draft.country === "TRNC" ? <><Pressable onPress={() => setDraft({ ...draft, trncFilingConfirmed: !draft.trncFilingConfirmed })} style={[styles.notice, { backgroundColor: theme.askBg }]}><SpText color="ask">{draft.trncFilingConfirmed ? "✓" : "○"} m.8 dosyalama bildirimi tamamlandı</SpText></Pressable><Pressable onPress={() => setDraft({ ...draft, trncTransferLicenseConfirmed: !draft.trncTransferLicenseConfirmed })} style={[styles.notice, { backgroundColor: theme.askBg }]}><SpText color="ask">{draft.trncTransferLicenseConfirmed ? "✓" : "○"} Yurt dışı aktarım ruhsatı alındı</SpText></Pressable></> : null}</SpCard>
    <Pressable disabled={pending} onPress={() => void save()} style={[styles.primary, { backgroundColor: theme.ask }]}><Save color={theme.onAsk} size={18} /><SpText style={{ color: theme.onAsk }}>{pending ? "Kaydediliyor…" : "Ayarları kaydet"}</SpText></Pressable>
    <SpCard style={styles.card}><SpText variant="eyebrow" color="deed">VERİ SAHİBİ HAKLARI</SpText><SpText variant="title">Yeni talep</SpText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{contacts.map((contact) => <Pressable key={contact.id} onPress={() => setContactId(contact.id)} style={[styles.choice, { borderColor: selectedContactId === contact.id ? theme.deed : theme.line }]}><SpText variant="bodySmall" color={selectedContactId === contact.id ? "deed" : "secondary"}>{contact.fullName ?? contact.label}</SpText></Pressable>)}</ScrollView><View style={styles.row}>{dataSubjectRequestTypes.map((type) => <Pressable key={type} onPress={() => setRequestType(type)} style={[styles.choice, { borderColor: requestType === type ? theme.deed : theme.line }]}><SpText variant="bodySmall" color={requestType === type ? "deed" : "secondary"}>{dataSubjectRequestTypeLabels[type]}</SpText></Pressable>)}</View><TextInput multiline placeholder="Talebin açıklaması" placeholderTextColor={theme.textTertiary} style={[...inputStyle, styles.textarea]} value={requestDetails} onChangeText={setRequestDetails} /><Pressable disabled={pending || !selectedContactId} onPress={() => void createRequest()} style={[styles.secondary, { borderColor: theme.line }]}><SpText color="deed">Talebi kaydet</SpText></Pressable></SpCard>
    {(requestsQuery.data ?? []).map((item) => <SpCard key={item.id} style={styles.request}><SpText variant="title">{item.contactName}</SpText><SpText variant="bodySmall" color="secondary">{dataSubjectRequestTypeLabels[item.type]} · {item.status}</SpText><View style={styles.row}>{item.type === "access" ? <Pressable onPress={() => void shareExport(item.contactId)} style={[styles.smallAction, { borderColor: theme.line }]}><Download color={theme.deed} size={15} /><SpText variant="bodySmall" color="deed">Paylaş</SpText></Pressable> : null}{item.status === "pending_verification" ? <Pressable onPress={() => void approve(item.id, item.type)} style={[styles.smallAction, { borderColor: theme.line }]}><SpText variant="bodySmall" color="deed">Onayla</SpText></Pressable> : null}</View></SpCard>)}
    <Pressable onPress={() => void signOut()} style={[styles.secondary, { borderColor: theme.line }]}><LogOut color={theme.textSecondary} size={18} /><SpText color="secondary">Oturumu kapat</SpText></Pressable>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { padding: space.xl, paddingBottom: space["5xl"], gap: space.lg }, state: { flex: 1, alignItems: "center", justifyContent: "center" }, headerRow: { flexDirection: "row", gap: space.md, alignItems: "flex-start", marginTop: space.lg }, headerCopy: { flex: 1, gap: space.xs }, iconButton: { width: 44, height: 44, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" }, card: { gap: space.md }, titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm }, input: { minHeight: 50, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, fontFamily: "Karla_400Regular", fontSize: 16 }, textarea: { minHeight: 96, paddingTop: space.md, textAlignVertical: "top" }, row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }, choice: { minHeight: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, paddingHorizontal: space.md, alignItems: "center", justifyContent: "center" }, time: { width: 54, textAlign: "center" }, primary: { minHeight: 52, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }, secondary: { minHeight: 48, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }, notice: { borderRadius: radius.md, padding: space.md }, request: { gap: space.sm }, smallAction: { minHeight: 38, paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: space.xs },
});
