import { useMemo, useState } from "react";
import { Contact, ContactField } from "expo-contacts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Archive, BookUser, ContactRound, History, LogOut, Pencil, Plus, Search, ShieldCheck, UserRoundPlus, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  apiQueryKeys,
  contactDraftSchema,
  contactRoleLabels,
  contactRoles,
  contactSourceLabels,
  contactSources,
  contactPrivacyDraftSchema,
  iysStatusLabels,
  iysStatuses,
  legalBasisLabels,
  legalBases,
  marketingChannelLabels,
  marketingChannels,
  nextActionTypeLabels,
  nextActionTypes,
  referralDraftSchema,
  type ContactDraft,
  type ContactPrivacyDraft,
} from "@spherepath/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { ContactPicker } from "@/shared/ui/ContactPicker";
import { ContactCallAction } from "../components/ContactCallAction";
import { ContactHistorySheet } from "../components/ContactHistorySheet";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import { archiveContact, listContacts, saveContact, saveContactPrivacy, type ContactRecord } from "../resources/contacts";
import { listReferrals, saveReferral } from "@/features/referrals/resources/referrals";
import { PhoneInput } from "@/shared/ui/MaskedInputs";
import { choiceMetrics, controlMetrics, largeButtonMetrics } from "@/shared/ui/SpField";

const emptyDraft: ContactDraft = {
  fullName: "",
  internalLabel: "",
  phone: "",
  metAtPlace: "",
  source: "in_person",
  role: "unknown",
};

function draftFrom(contact: ContactRecord): ContactDraft {
  return {
    fullName: contact.fullName ?? contact.label ?? "",
    internalLabel: contact.internalLabel ?? (contact.fullName ? contact.label ?? "" : ""),
    phone: contact.phone ?? "",
    metAtPlace: contact.metAtPlace ?? "",
    source: contact.source,
    role: contact.roles[0] ?? "unknown",
  };
}
function privacyDraft(contact: ContactRecord): ContactPrivacyDraft { return { contactId: contact.id, coreCrmLegalBasis: contact.privacy.purposes?.core_crm?.legalBasis ?? "legitimate_interest", noticeStatus: contact.privacy.noticeStatus, noticeMethod: contact.privacy.noticeMethod, noticeVersion: contact.privacy.noticeVersion, marketingConsent: contact.privacy.marketingConsent, marketingChannels: contact.privacy.marketingChannels ?? [], iysStatus: contact.privacy.iysStatus ?? "unknown", profilingObjection: contact.privacy.profilingObjection }; }

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "İşlem tamamlanamadı.";
}

export default function ContactsView() {
  const theme = useSpTheme();
  const router = useRouter();
  const { next, contactId, action } = useLocalSearchParams<{ next?: string; contactId?: string; action?: string }>();
  const { session, signOut } = useSession();
  const queryClient = useQueryClient();
  const [panelOpen, setPanelOpen] = useState(next === "listings");
  const [editing, setEditing] = useState<ContactRecord | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyDraft);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referralSource, setReferralSource] = useState<ContactRecord | null>(null);
  const [historyContact, setHistoryContact] = useState<ContactRecord | null>(null);
  const [referredContactId, setReferredContactId] = useState("");
  const [referredLabel, setReferredLabel] = useState("");
  const [privacyEditing, setPrivacyEditing] = useState<ContactRecord | null>(null);
  const [privacy, setPrivacy] = useState<ContactPrivacyDraft | null>(null);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(40);

  const contactsQuery = useQuery({
    queryKey: apiQueryKeys.contacts,
    queryFn: listContacts,
    enabled: Boolean(session),
  });
  const contacts = useMemo(() => contactsQuery.data ?? [], [contactsQuery.data]);
  const [openedPrivacyFor, setOpenedPrivacyFor] = useState<string | null>(null);
  const privacyLinkTarget = action === "privacy" && contactId && openedPrivacyFor !== contactId
    ? contacts.find((contact) => contact.id === contactId) ?? null
    : null;
  if (privacyLinkTarget) {
    setOpenedPrivacyFor(privacyLinkTarget.id);
    setPrivacyEditing(privacyLinkTarget);
    setPrivacy(privacyDraft(privacyLinkTarget));
  }
  const filteredContacts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return contacts;
    return contacts.filter((contact) => [contact.fullName, contact.label, contact.internalLabel, contact.phone, contact.metAtPlace]
      .some((value) => value?.toLocaleLowerCase("tr-TR").includes(needle)));
  }, [contacts, search]);
  const visibleContacts = filteredContacts.slice(0, visibleCount);
  const referralsQuery = useQuery({ queryKey: apiQueryKeys.referrals, queryFn: listReferrals, enabled: Boolean(session) });

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft);
    setError(null);
    setPanelOpen(true);
  }

  async function chooseFromAddressBook() {
    setError(null);
    try {
      const selected = await Contact.presentPicker();
      if (!selected) return;
      const details = await selected.getDetails([ContactField.FULL_NAME, ContactField.PHONES]);
      setDraft({
        ...draft,
        fullName: details.fullName?.trim() || draft.fullName,
        phone: details.phones?.find((item) => item.number)?.number?.trim() || draft.phone,
        source: "address_book",
      });
    } catch (nextError) {
      setError(`${messageFrom(nextError)} Bilgileri elle girmeye devam edebilirsin.`);
    }
  }

  function openEdit(contact: ContactRecord) {
    setEditing(contact);
    setDraft(draftFrom(contact));
    setError(null);
    setPanelOpen(true);
  }

  async function submit() {
    if (!session) return;
    const parsed = contactDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Kişi bilgilerini kontrol et.");
      return;
    }
    setPending(true);
    try {
      const savedContact = await saveContact(session, parsed.data, editing ?? undefined);
      setPanelOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ]);
      if (!editing && next === "listings") {
        router.replace({ pathname: "/(tabs)/listings", params: { action: "add-listing", ownerContactId: savedContact.id } });
      }
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(false);
    }
  }

  function remove(contact: ContactRecord) {
    Alert.alert("Kişiyi arşivle", `${contact.fullName ?? "Bu kişi"} kişi listesinden kaldırılsın mı?`, [
      { text: "Vazgeç", style: "cancel" },
      { text: "Arşivle", style: "destructive", onPress: () => session && void archiveContact(session, contact.id).then(() => Promise.all([queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview })])).catch((nextError: unknown) => setError(messageFrom(nextError))) },
    ]);
  }

  async function submitReferral() {
    if (!session || !referralSource) return;
    const parsed = referralDraftSchema.safeParse({ sourceContactId: referralSource.id, referredContactId: referredContactId || null, referredLabel: referredContactId ? null : referredLabel.trim() || null });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Referans bilgisini kontrol et.");
    setPending(true); setError(null);
    try { await saveReferral(session, parsed.data); setReferralSource(null); setReferredContactId(""); setReferredLabel(""); await Promise.all([queryClient.invalidateQueries({ queryKey: apiQueryKeys.referrals }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview })]); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }
  async function submitPrivacy() { if (!session || !privacy) return; const parsed = contactPrivacyDraftSchema.safeParse(privacy); if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Uyum bilgilerini kontrol et."); setPending(true); setError(null); try { await saveContactPrivacy(session, parsed.data); setPrivacyEditing(null); setPrivacy(null); await queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }); } catch (nextError) { setError(messageFrom(nextError)); } finally { setPending(false); } }

  const inputStyle = [styles.input, { backgroundColor: theme.background, borderColor: theme.line, color: theme.textPrimary }];
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}><SpText variant="eyebrow" color="deed">İLİŞKİ AĞI</SpText><SpText variant="hero">Kişiler</SpText><SpText color="secondary">Tanıştığın kişileri ve ilişkinin sıradaki adımını düzenle.</SpText></View>
          <Pressable accessibilityLabel="Oturumu kapat" onPress={() => void signOut()} style={[styles.iconButton, { borderColor: theme.line }]}><LogOut color={theme.textSecondary} size={19} /></Pressable>
        </View>

        <Pressable onPress={openCreate} style={({ pressed }) => [styles.primary, { backgroundColor: theme.ask, opacity: pressed ? .72 : 1 }]}><Plus color={theme.onAsk} size={19} /><SpText style={{ color: theme.onAsk }}>Yeni kişi</SpText></Pressable>
        {contacts.length > 0 ? <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.line }]}><Search color={theme.textSecondary} size={19} /><TextInput accessibilityLabel="Kişilerde ara" value={search} onChangeText={(value) => { setSearch(value); setVisibleCount(40); }} placeholder="Ad, telefon veya tanışma yeri ara" placeholderTextColor={theme.textTertiary} style={[styles.searchInput, { color: theme.textPrimary }]} /><SpText variant="caption" color="secondary">{filteredContacts.length}</SpText></View> : null}
        {(referralsQuery.data?.length ?? 0) > 0 ? <View style={styles.referrals}><SpText variant="eyebrow" color="deed">İLK TEMAS BEKLEYEN REFERANSLAR</SpText>{referralsQuery.data?.slice(0, 3).map((referral) => <SpCard key={referral.id} style={styles.referralCard}><SpText variant="title">{referral.referredContactName}</SpText><SpText variant="bodySmall" color="secondary">{referral.sourceContactName} aracılığıyla · Aydınlatma bekliyor</SpText></SpCard>)}</View> : null}
        {(error ?? (contactsQuery.error ? messageFrom(contactsQuery.error) : null)) && !panelOpen ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{error ?? messageFrom(contactsQuery.error)}</SpText></View> : null}

        {contactsQuery.isPending ? <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Kişiler yükleniyor…</SpText></View> : contacts.length === 0 ? (
          <SpCard style={styles.empty}><View style={[styles.largeIcon, { backgroundColor: theme.deedBg }]}><ContactRound color={theme.deed} size={24} /></View><SpText variant="title">İlk kişini ekle</SpText><SpText color="secondary">Ad veya tanımlayıcı, kaynak ve rol başlangıç için yeterli.</SpText></SpCard>
        ) : visibleContacts.length === 0 ? <SpCard><SpText color="secondary">Aramana uyan kişi bulunamadı.</SpText></SpCard> : visibleContacts.map((contact) => (
          <SpCard key={contact.id} style={styles.card}>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/contact/[id]", params: { id: contact.id } })} style={styles.contactTop}><View style={[styles.avatar, { backgroundColor: theme.deedBg }]}><SpText variant="title" color="deed">{(contact.fullName ?? contact.label ?? "?").slice(0, 1).toLocaleUpperCase("tr-TR")}</SpText></View><View style={styles.contactCopy}><SpText variant="title">{contact.fullName ?? contact.label}</SpText><SpText variant="bodySmall" color="secondary">{contact.phone ?? "Telefon eklenmedi"}</SpText></View></Pressable>{contact.phone ? <ContactCallAction contactId={contact.id} /> : null}
            <View style={styles.chips}><View style={[styles.chip, { backgroundColor: theme.sunk }]}><SpText variant="bodySmall" color="secondary">{(contact.roles.length ? contact.roles : ["unknown" as const]).map((role) => contactRoleLabels[role]).join(" · ")}</SpText></View><View style={[styles.chip, { backgroundColor: theme.sunk }]}><SpText variant="bodySmall" color="secondary">{contactSourceLabels[contact.source]}</SpText></View></View>
            <SpText variant="bodySmall" color="secondary">{contact.metAtPlace || "Tanışma yeri belirtilmedi"}</SpText>
            {(contact.memory?.keyThingsToRemember?.length ?? 0) > 0 ? <View style={[styles.memory, { backgroundColor: theme.deedBg }]}><SpText variant="caption" color="deed">HATIRLANACAKLAR</SpText>{contact.memory.keyThingsToRemember.slice(0, 3).map((item) => <SpText key={item} variant="caption" color="secondary">{item}</SpText>)}</View> : null}
            <View style={styles.compliance}><View style={[styles.complianceChip, { backgroundColor: contact.privacy.noticeStatus === "completed" ? theme.deedBg : theme.askBg }]}><SpText variant="bodySmall" color={contact.privacy.noticeStatus === "completed" ? "deed" : "ask"}>{contact.privacy.noticeStatus === "completed" ? "Aydınlatma tamam" : "Aydınlatma bekliyor"}</SpText></View>{contact.privacy.marketingConsent === "withdrawn" ? <View style={[styles.complianceChip, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">İletişim istemiyor</SpText></View> : null}</View><View style={[styles.actions, { borderTopColor: theme.line }]}><Pressable onPress={() => setHistoryContact(contact)} style={styles.action}><History color={theme.textSecondary} size={16} /><SpText variant="bodySmall" color="secondary">Geçmiş</SpText></Pressable><Pressable onPress={() => { setReferralSource(contact); setError(null); }} style={styles.action}><UserRoundPlus color={theme.textSecondary} size={16} /><SpText variant="bodySmall" color="secondary">Referans</SpText></Pressable><Pressable onPress={() => { setPrivacyEditing(contact); setPrivacy(privacyDraft(contact)); setError(null); }} style={styles.action}><ShieldCheck color={theme.textSecondary} size={16} /><SpText variant="bodySmall" color="secondary">Uyum</SpText></Pressable><Pressable onPress={() => openEdit(contact)} style={styles.action}><Pencil color={theme.textSecondary} size={16} /></Pressable><Pressable onPress={() => remove(contact)} style={styles.action}><Archive color={theme.textSecondary} size={16} /></Pressable></View>
          </SpCard>
        ))}
        {visibleContacts.length < filteredContacts.length ? <Pressable accessibilityRole="button" onPress={() => setVisibleCount((count) => count + 40)} style={[styles.loadMore, { borderColor: theme.line }]}><SpText color="deed">40 kişi daha göster</SpText><SpText variant="caption" color="secondary">{visibleContacts.length}/{filteredContacts.length}</SpText></Pressable> : null}
      </ScrollView>

      <ContactHistorySheet contactId={historyContact?.id ?? null} contactName={historyContact?.fullName ?? historyContact?.label ?? "Kişi"} onClose={() => setHistoryContact(null)} />
      <Modal animationType="slide" onRequestClose={() => setPanelOpen(false)} presentationStyle="pageSheet" visible={panelOpen}>
        <SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}><View><SpText variant="eyebrow" color="deed">HIZLI KAYIT</SpText><SpText variant="hero">{editing ? "Kişiyi düzenle" : "Yeni kişi"}</SpText></View><Pressable accessibilityLabel="Kapat" onPress={() => setPanelOpen(false)} style={[styles.iconButton, { borderColor: theme.line }]}><X color={theme.textSecondary} size={20} /></Pressable></View>
            {!editing ? <Pressable onPress={() => void chooseFromAddressBook()} style={[styles.addressBook, { backgroundColor: theme.deedBg }]}><BookUser color={theme.deed} size={18} /><View style={styles.contactCopy}><SpText color="deed">Rehberden tek kişi seç</SpText><SpText variant="bodySmall" color="secondary">Yalnızca seçtiğin kişinin adı ve telefonu forma alınır.</SpText></View></Pressable> : null}
            <SpText variant="bodySmall" color="secondary">Ad soyad</SpText><TextInput autoFocus={Boolean(editing)} placeholder="Örn. Ayşe Kaya" placeholderTextColor={theme.textTertiary} style={inputStyle} value={draft.fullName} onChangeText={(fullName) => setDraft({ ...draft, fullName })} />
            <SpText variant="bodySmall" color="secondary">İç etiket · isteğe bağlı, müşteriye gösterilmez</SpText><TextInput placeholder="Örn. Marina açık ev · sıcak aday" placeholderTextColor={theme.textTertiary} style={inputStyle} value={draft.internalLabel ?? ""} onChangeText={(internalLabel) => setDraft({ ...draft, internalLabel })} />
            <SpText variant="bodySmall" color="secondary">Telefon · isteğe bağlı</SpText><PhoneInput style={inputStyle} value={draft.phone} onChangeText={(phone) => setDraft({ ...draft, phone })} />
            <SpText variant="bodySmall" color="secondary">Tanışma yeri · isteğe bağlı</SpText><TextInput placeholder="Örn. Marina açık ev etkinliği" placeholderTextColor={theme.textTertiary} style={inputStyle} value={draft.metAtPlace} onChangeText={(metAtPlace) => setDraft({ ...draft, metAtPlace })} />
            <SpText variant="bodySmall" color="secondary">Kaynak</SpText><View style={styles.chips}>{contactSources.map((source) => <Pressable key={source} onPress={() => setDraft({ ...draft, source })} style={[styles.choice, { backgroundColor: draft.source === source ? theme.deedBg : theme.background, borderColor: draft.source === source ? theme.deed : theme.line }]}><SpText variant="bodySmall" color={draft.source === source ? "deed" : "secondary"}>{contactSourceLabels[source]}</SpText></Pressable>)}</View>
            <SpText variant="bodySmall" color="secondary">Rol</SpText><View style={styles.chips}>{contactRoles.map((role) => <Pressable key={role} onPress={() => setDraft({ ...draft, role })} style={[styles.choice, { backgroundColor: draft.role === role ? theme.deedBg : theme.background, borderColor: draft.role === role ? theme.deed : theme.line }]}><SpText variant="bodySmall" color={draft.role === role ? "deed" : "secondary"}>{contactRoleLabels[role]}</SpText></Pressable>)}</View>
            {!editing ? <><SpText variant="bodySmall" color="secondary">İlk takip · isteğe bağlı</SpText><View style={styles.chips}><Pressable onPress={() => setDraft({ ...draft, nextActionType: null, nextActionAt: null })} style={[styles.choice, { backgroundColor: !draft.nextActionType ? theme.deedBg : theme.background, borderColor: !draft.nextActionType ? theme.deed : theme.line }]}><SpText variant="bodySmall" color={!draft.nextActionType ? "deed" : "secondary"}>Henüz yok</SpText></Pressable>{nextActionTypes.slice(0, 4).map((type) => <Pressable key={type} onPress={() => setDraft({ ...draft, nextActionType: type, nextActionAt: draft.nextActionAt ?? Date.now() + 86_400_000 })} style={[styles.choice, { backgroundColor: draft.nextActionType === type ? theme.deedBg : theme.background, borderColor: draft.nextActionType === type ? theme.deed : theme.line }]}><SpText variant="bodySmall" color={draft.nextActionType === type ? "deed" : "secondary"}>{nextActionTypeLabels[type]}</SpText></Pressable>)}</View>{draft.nextActionType ? <View style={styles.chips}>{[1, 3, 7].map((days) => <Pressable key={days} onPress={() => setDraft({ ...draft, nextActionAt: Date.now() + days * 86_400_000 })} style={[styles.choice, { backgroundColor: theme.background, borderColor: theme.line }]}><SpText variant="bodySmall" color="secondary">{days === 1 ? "Yarın" : `${days} gün`}</SpText></Pressable>)}</View> : null}</> : null}
            {error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{error}</SpText></View> : null}
            <Pressable disabled={pending} onPress={() => void submit()} style={({ pressed }) => [styles.primary, { backgroundColor: theme.ask, opacity: pressed || pending ? .65 : 1 }]}><SpText style={{ color: theme.onAsk }}>{pending ? "Kaydediliyor…" : editing ? "Değişiklikleri kaydet" : "Kişiyi kaydet"}</SpText></Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal animationType="slide" onRequestClose={() => setReferralSource(null)} presentationStyle="pageSheet" visible={Boolean(referralSource)}><SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}><ScrollView contentContainerStyle={styles.form}><View style={styles.sheetHeader}><View><SpText variant="eyebrow" color="deed">REFERANS KAYDI</SpText><SpText variant="hero">{referralSource?.fullName ?? referralSource?.label}</SpText></View><Pressable onPress={() => setReferralSource(null)} style={[styles.iconButton, { borderColor: theme.line }]}><X color={theme.textSecondary} size={20} /></Pressable></View><ContactPicker contacts={contacts.filter((item) => item.id !== referralSource?.id)} label="Kayıtlı kişi · varsa" value={referredContactId} onChange={setReferredContactId} placeholder="Kişi ara veya kısa tanım yaz" />{!referredContactId ? <><SpText variant="title">Kısa tanım</SpText><TextInput placeholder="Örn. Komşusu Mehmet Bey" placeholderTextColor={theme.textTertiary} style={inputStyle} value={referredLabel} onChangeText={setReferredLabel} /></> : null}<View style={[styles.privacyHint, { backgroundColor: theme.deedBg }]}><SpText variant="bodySmall" color="deed">Bu referans doğrudan pazarlamaya alınmaz. İlk temasta aydınlatma tamamlanmalıdır.</SpText></View>{error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{error}</SpText></View> : null}<Pressable disabled={pending} onPress={() => void submitReferral()} style={[styles.primary, { backgroundColor: theme.ask }]}><SpText style={{ color: theme.onAsk }}>{pending ? "Kaydediliyor…" : "Referansı kaydet"}</SpText></Pressable></ScrollView></SafeAreaView></Modal>
      <Modal animationType="slide" onRequestClose={() => setPrivacyEditing(null)} presentationStyle="pageSheet" visible={Boolean(privacyEditing)}><SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}><ScrollView contentContainerStyle={styles.form}>{privacy ? <><View style={styles.sheetHeader}><View><SpText variant="eyebrow" color="deed">AYDINLATMA VE İZİN</SpText><SpText variant="hero">{privacyEditing?.fullName ?? privacyEditing?.label}</SpText></View><Pressable onPress={() => setPrivacyEditing(null)} style={[styles.iconButton, { borderColor: theme.line }]}><X color={theme.textSecondary} size={20} /></Pressable></View><SpText variant="title">CRM hukuki sebebi</SpText><View style={styles.chips}>{legalBases.map((item) => <PrivacyChoice key={item} label={legalBasisLabels[item]} selected={privacy.coreCrmLegalBasis === item} choose={() => setPrivacy({ ...privacy, coreCrmLegalBasis: item })} />)}</View><SpText variant="title">Aydınlatma · rızadan ayrı</SpText><View style={styles.chips}><PrivacyChoice label="Bekliyor" selected={privacy.noticeStatus === "pending"} choose={() => setPrivacy({ ...privacy, noticeStatus: "pending", noticeMethod: null, noticeVersion: null })} /><PrivacyChoice label="Okudum/anladım kaydı tamam" selected={privacy.noticeStatus === "completed"} choose={() => setPrivacy({ ...privacy, noticeStatus: "completed", noticeMethod: privacy.noticeMethod ?? "verbal", noticeVersion: privacy.noticeVersion ?? "v1" })} /></View>{privacy.noticeStatus === "completed" ? <><SpText variant="title">Aydınlatma yöntemi</SpText><View style={styles.chips}>{(["verbal", "written", "electronic"] as const).map((item) => <PrivacyChoice key={item} label={item === "verbal" ? "Sözlü" : item === "written" ? "Yazılı" : "Elektronik"} selected={privacy.noticeMethod === item} choose={() => setPrivacy({ ...privacy, noticeMethod: item })} />)}</View><SpText variant="title">Metin sürümü</SpText><TextInput style={inputStyle} value={privacy.noticeVersion ?? ""} onChangeText={(noticeVersion) => setPrivacy({ ...privacy, noticeVersion })} /></> : null}<SpText variant="title">Pazarlama rızası</SpText><View style={styles.chips}>{(["unknown", "granted", "withdrawn"] as const).map((item) => <PrivacyChoice key={item} label={item === "unknown" ? "Bilinmiyor" : item === "granted" ? "Verildi" : "Geri alındı"} selected={privacy.marketingConsent === item} choose={() => setPrivacy({ ...privacy, marketingConsent: item, marketingChannels: item === "granted" ? privacy.marketingChannels : [] })} />)}</View>{privacy.marketingConsent === "granted" ? <><SpText variant="title">İzinli kanallar</SpText><View style={styles.chips}>{marketingChannels.map((item) => <PrivacyChoice key={item} label={marketingChannelLabels[item]} selected={privacy.marketingChannels.includes(item)} choose={() => setPrivacy({ ...privacy, marketingChannels: privacy.marketingChannels.includes(item) ? privacy.marketingChannels.filter((channel) => channel !== item) : [...privacy.marketingChannels, item] })} />)}</View></> : null}<SpText variant="title">İYS durumu</SpText><View style={styles.chips}>{iysStatuses.map((item) => <PrivacyChoice key={item} label={iysStatusLabels[item]} selected={privacy.iysStatus === item} choose={() => setPrivacy({ ...privacy, iysStatus: item })} />)}</View><Pressable onPress={() => setPrivacy({ ...privacy, profilingObjection: !privacy.profilingObjection })} style={[styles.privacyHint, { backgroundColor: privacy.profilingObjection ? theme.askBg : theme.background, borderColor: theme.line, borderWidth: StyleSheet.hairlineWidth }]}><SpText variant="bodySmall" color={privacy.profilingObjection ? "ask" : "secondary"}>{privacy.profilingObjection ? "✓ " : ""}Otomatik analiz/eşleştirme itirazı var</SpText></Pressable>{error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{error}</SpText></View> : null}<Pressable disabled={pending} onPress={() => void submitPrivacy()} style={[styles.primary, { backgroundColor: theme.ask }]}><SpText style={{ color: theme.onAsk }}>{pending ? "Kaydediliyor…" : "Uyum kaydını güncelle"}</SpText></Pressable></> : null}</ScrollView></SafeAreaView></Modal>
    </SafeAreaView>
  );
}

function PrivacyChoice({ label, selected, choose }: { label: string; selected: boolean; choose(): void }) {
  const theme = useSpTheme();
  return <Pressable onPress={choose} style={[styles.choice, { backgroundColor: selected ? theme.deedBg : theme.background, borderColor: selected ? theme.deed : theme.line }]}><SpText variant="bodySmall" color={selected ? "deed" : "secondary"}>{label}</SpText></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { padding: space.xl, paddingBottom: space["5xl"], gap: space.lg },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md }, headerCopy: { flex: 1, gap: space.sm },
  iconButton: { width: 44, height: 44, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  searchBox: { minHeight: 50, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", gap: space.sm },
  searchInput: { minHeight: 48, flex: 1, fontFamily: "Karla_400Regular", fontSize: 16 },
  loadMore: { minHeight: 50, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primary: { ...largeButtonMetrics },
  state: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: space.md },
  empty: { minHeight: 240, gap: space.md, justifyContent: "center" }, largeIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  card: { gap: space.md }, contactTop: { flexDirection: "row", gap: space.md, alignItems: "center" }, contactCopy: { flex: 1, gap: space.xs }, memory: { gap: space.xs, padding: space.md, borderRadius: radius.sm },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" }, chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm },
  referrals: { gap: space.sm }, referralCard: { gap: space.xs }, privacyHint: { padding: space.md, borderRadius: radius.md }, compliance: { flexDirection: "row" }, complianceChip: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.sm },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, flexDirection: "row", gap: space.xl }, action: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: space.sm },
  error: { padding: space.md, borderRadius: radius.md }, form: { padding: space.xl, paddingBottom: space["5xl"], gap: space.md },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.md, marginBottom: space.lg },
  input: { ...controlMetrics },
  choice: { ...choiceMetrics },
  addressBook: { minHeight: 64, borderRadius: radius.md, padding: space.md, flexDirection: "row", alignItems: "center", gap: space.md },
});
