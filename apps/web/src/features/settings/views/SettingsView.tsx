"use client";
import { TestWorkspaceCard } from "../components/TestWorkspaceCard";


import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, Lock, MessageCircleMore, Save, ShieldCheck, UserRoundCog, Users } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiQueryKeys,
  countryLabels,
  createDataSubjectRequestSchema,
  dataRequestCopy,
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
import { useSession } from "@/features/auth/resources/session";
import { listContacts } from "@/features/contacts/resources/contacts";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { ContactCombobox } from "@/shared/ui/ContactCombobox";
import { WhatsAppGroupSettingsCard } from "../components/WhatsAppGroupSettingsCard";
import { PhoneNormalizationCard } from "../components/PhoneNormalizationCard";
import { TelephonySettingsCard } from "../components/TelephonySettingsCard";
import {
  createDataSubjectRequest,
  getContactDataExport,
  listDataSubjectRequests,
  loadWorkspaceSettings,
  saveWorkspaceSettings,
} from "../resources/settings";
import { PhoneField } from "@/shared/ui/MaskedFields";
import { handleFormKeyDown, SpInput, SpSelect, SpTextarea } from "@/shared/ui/SpField";

type SettingsArea = "start" | "communication" | "office" | "compliance";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Ayarlar güncellenemedi.";
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

function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

import { DataRequestActions } from "../components/DataRequestActions";
import { OfficeTeamPanel } from "../components/OfficeTeamPanel";

export function SettingsView() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: apiQueryKeys.workspaceSettings, queryFn: loadWorkspaceSettings });
  const requestsQuery = useQuery({ queryKey: apiQueryKeys.dataSubjectRequests, queryFn: listDataSubjectRequests });
  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts });
  const searchParams = useSearchParams();
  const requestedSection = searchParams.get("section");
  const [chosenArea, setSettingsArea] = useState<SettingsArea | null>(null);
  const settingsArea: SettingsArea = chosenArea
    ?? (["start", "communication", "office", "compliance"].includes(requestedSection ?? "") ? requestedSection as SettingsArea : "start");
  const [editedDraft, setDraft] = useState<WorkspaceSettingsDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contactId, setContactId] = useState("");
  const [requestType, setRequestType] = useState<DataSubjectRequestType>("access");
  const [requesterReference, setRequesterReference] = useState("");
  const [details, setDetails] = useState("");

  const contacts = contactsQuery.data ?? [];
  const selectedContactId = contactId;
  const draft = editedDraft ?? (settingsQuery.data ? editableSettings(settingsQuery.data) : null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !draft) return;
    const parsed = workspaceSettingsSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Ayarları kontrol edin."); return; }
    setPending(true); setError(null); setMessage(null);
    try {
      await saveWorkspaceSettings(session, parsed.data);
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.workspaceSettings });
      setDraft(null);
      setMessage("Ayarlar kaydedildi.");
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const parsed = createDataSubjectRequestSchema.safeParse({ contactId: selectedContactId, type: requestType, requesterReference, details });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Talebi kontrol edin."); return; }
    setPending(true); setError(null); setMessage(null);
    try {
      await createDataSubjectRequest(session, parsed.data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.dataSubjectRequests }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
      ]);
      setDetails(""); setRequesterReference(""); setMessage("Veri sahibi talebi kaydedildi.");
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  async function exportContact(requestId: string, targetContactId: string) {
    setPending(true); setError(null);
    try {
      const value = await getContactDataExport(requestId);
      downloadJson(value, `spherepath-contact-export-${targetContactId}.json`);
      setMessage("Veri kopyası indirmesi başlatıldı; teslim ayrıca kaydedilir.");
    } catch (nextError) { setError(messageFrom(nextError)); throw nextError; }
    finally { setPending(false); }
  }

  if (settingsQuery.isError) return <AppShell><div className="content-state" role="alert"><strong>Ayarlar yüklenemedi.</strong><span>{messageFrom(settingsQuery.error)}</span><button className="secondary-action" type="button" onClick={() => void settingsQuery.refetch()}>Yeniden dene</button></div><TestWorkspaceCard /></AppShell>;
  if (settingsQuery.isPending || !draft) return <AppShell><div className="content-state">Ayarlar yükleniyor…</div><TestWorkspaceCard /></AppShell>;
  const requests = requestsQuery.data ?? [];
  const pendingRequests = requests.filter((item) => ["pending_verification", "approved", "processing"].includes(item.status));
  const iysApprovedCount = contacts.filter((contact) => contact.privacy.iysStatus === "approved").length;
  const noticeVersion = contacts.map((contact) => contact.privacy.noticeVersion).find(Boolean) ?? "—";

  return <AppShell>
    <header className="page-header settings-header"><div><p className="eyebrow">ÇALIŞMA ALANI</p><h1>Ayarlar ve ekip</h1><p className="context-sentence">Profilin, ofis ekibin, iletişim bağlantıların ve uyum kayıtların.</p></div></header>
    {message ? <p className="success-notice">{message}</p> : null}{error ? <p className="form-error notice">{error}</p> : null}
    <div className="settings-workspace">
      <nav className="settings-subnav" aria-label="Ayar bölümleri">
        <button aria-current={settingsArea === "start" ? "page" : undefined} className={settingsArea === "start" ? "active" : ""} onClick={() => setSettingsArea("start")} type="button"><UserRoundCog size={16} /> Profil</button>
        <button aria-current={settingsArea === "office" ? "page" : undefined} className={settingsArea === "office" ? "active" : ""} onClick={() => setSettingsArea("office")} type="button"><Users size={16} /> Ofis ve ekip</button>
        <button aria-current={settingsArea === "communication" ? "page" : undefined} className={settingsArea === "communication" ? "active" : ""} onClick={() => setSettingsArea("communication")} type="button"><MessageCircleMore size={16} /> İletişim</button>
        <button aria-current={settingsArea === "compliance" ? "page" : undefined} className={settingsArea === "compliance" ? "active" : ""} onClick={() => setSettingsArea("compliance")} type="button"><ShieldCheck size={16} /> Uyum{pendingRequests.length ? <em>{pendingRequests.length}</em> : null}</button>
      </nav>
      <div className="settings-main">
        {/* Four compliance tiles above a profile form is a dashboard in the
            wrong room. The state lives here as one line and its detail on the
            tab that actually owns it. */}
        {settingsArea === "compliance"
          ? <div className="settings-summary"><SpCard><span>VERBİS</span><strong className="good-text">{verbisStatusLabels[draft.verbisStatus]}</strong><small>{draft.dataControllerName || "Veri sorumlusu belirtilmedi"}</small></SpCard><SpCard><span>Aydınlatma metni</span><strong>{noticeVersion}</strong><small>Kişi kayıtlarında kullanılan sürüm</small></SpCard><SpCard><span>İYS onaylı</span><strong>{iysApprovedCount} / {contacts.length}</strong><div><span style={{ width: `${contacts.length ? Math.round((iysApprovedCount / contacts.length) * 100) : 0}%` }} /></div></SpCard><SpCard><span>Açık talep</span><strong className={pendingRequests.length ? "warm-text" : "good-text"}>{pendingRequests.length} bekliyor</strong><small>{pendingRequests.length ? "Kimlik doğrulama ve yanıt bekliyor" : "Bekleyen talep yok"}</small></SpCard></div>
          : <button className="settings-compliance-line" onClick={() => setSettingsArea("compliance")} type="button"><ShieldCheck size={17} aria-hidden /><span>{contacts.length - contacts.filter((contact) => contact.privacy.noticeStatus === "pending").length}/{contacts.length} kişide aydınlatma tamam, {iysApprovedCount}&apos;i İYS onaylı{pendingRequests.length ? <> · <strong>{pendingRequests.length} veri sahibi talebi yanıt bekliyor</strong></> : null}</span><em>Uyum sekmesi</em></button>}
    <form onKeyDown={handleFormKeyDown} className="settings-sections" id="workspace-settings-form" onSubmit={save}>
      {settingsArea === "start" ? <>
      <SpCard className="settings-card" id="advisor-profile">
        <div className="settings-title"><UserRoundCog size={20} /><div><p className="eyebrow">PROFİL</p><h2>Danışman ayarları</h2></div></div>
        <div className="form-row"><label>Ad soyad<SpInput value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></label><label>Telefon<PhoneField value={draft.phone} onChange={(phone) => setDraft({ ...draft, phone })} /></label></div>
        <label>Varsayılan bölgeler <span className="optional">virgülle ayır</span><SpInput value={draft.defaultRegions.join(", ")} onChange={(event) => setDraft({ ...draft, defaultRegions: event.target.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 5) })} /></label>
        <div className="form-row"><label>Aylık portföy hedefi<SpInput type="number" min="1" max="100" value={draft.monthlyPortfolioTarget ?? ""} onChange={(event) => setDraft({ ...draft, monthlyPortfolioTarget: event.target.value ? Number(event.target.value) : null })} /></label><label>Haftalık kapasite<SpInput type="number" min="1" max="100" value={draft.weeklyCapacity ?? ""} onChange={(event) => setDraft({ ...draft, weeklyCapacity: event.target.value ? Number(event.target.value) : null })} /></label></div>
      </SpCard>

      <SpCard className="settings-card" id="reminders">
        <div className="settings-title"><Bell size={20} /><div><p className="eyebrow">HATIRLATMA</p><h2>Günlük plan hatırlatıcısı</h2></div></div>
        <label className="check-label"><SpInput type="checkbox" checked={draft.dailyPlanReminderEnabled} onChange={(event) => setDraft({ ...draft, dailyPlanReminderEnabled: event.target.checked })} /> Her sabah günün planını hatırlat</label>
        <div className="form-row"><label>Saat<SpInput type="number" min="0" max="23" disabled={!draft.dailyPlanReminderEnabled} value={draft.dailyPlanReminderHour} onChange={(event) => setDraft({ ...draft, dailyPlanReminderHour: Number(event.target.value) })} /></label><label>Dakika<SpInput type="number" min="0" max="59" disabled={!draft.dailyPlanReminderEnabled} value={draft.dailyPlanReminderMinute} onChange={(event) => setDraft({ ...draft, dailyPlanReminderMinute: Number(event.target.value) })} /></label></div>
        <p className="privacy-hint">Hatırlatma cihaz saatine göre gönderilir ve yalnız o günün planı hazırsa görünür.</p>
      </SpCard>
      </> : null}

      {settingsArea === "communication" ? <>{session?.role === "broker" ? <TelephonySettingsCard /> : <SpCard className="settings-card"><h2>Ofis telefon altyapısı</h2><p className="privacy-copy">Santral ve gelen arama eşleştirme ayarlarını ofis yöneticisi yönetir.</p></SpCard>}<PhoneNormalizationCard /></> : null}
      {settingsArea === "office" ? <>
      <SpCard className="settings-card" id="data-controller">
        <div className="settings-title"><ShieldCheck size={20} /><div><p className="eyebrow">VERİ SORUMLUSU</p><h2>Ofis uyum bilgileri</h2></div></div>
        <div className="form-row"><label>Ülke<SpSelect value={draft.country} onChange={(event) => setDraft({ ...draft, country: event.target.value as WorkspaceSettingsDraft["country"] })}>{Object.entries(countryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SpSelect></label><label>Veri sorumlusu adı<SpInput value={draft.dataControllerName} onChange={(event) => setDraft({ ...draft, dataControllerName: event.target.value })} /></label><label>VERBİS durumu<SpSelect value={draft.verbisStatus} onChange={(event) => setDraft({ ...draft, verbisStatus: event.target.value as WorkspaceSettingsDraft["verbisStatus"] })}>{verbisStatuses.map((item) => <option key={item} value={item}>{verbisStatusLabels[item]}</option>)}</SpSelect></label></div>
        {draft.country === "TRNC" ? <div className="trnc-gate"><strong>KKTC zorunlu doğrulama kapısı</strong><p>Firebase verisi KKTC dışına çıktığı için çalışma başlamadan önce hem dosyalama bildirimi hem aktarım ruhsatı gerekir.</p><label className="check-label"><SpInput type="checkbox" checked={draft.trncFilingConfirmed} onChange={(event) => setDraft({ ...draft, trncFilingConfirmed: event.target.checked })} /> m.8 dosyalama bildirimi tamamlandı</label><label className="check-label"><SpInput type="checkbox" checked={draft.trncTransferLicenseConfirmed} onChange={(event) => setDraft({ ...draft, trncTransferLicenseConfirmed: event.target.checked })} /> Yurt dışı aktarım ruhsatı alındı</label></div> : null}
        <p className="privacy-hint">Bu ekran hukuki danışmanlık yerine geçmez. Üretim öncesi yerel hukukçu doğrulaması gerekir.</p>
      </SpCard>
      </> : null}
      {settingsArea === "office" ? <OfficeTeamPanel /> : null}

    </form>
    {editedDraft ? <div className="settings-save-bar" role="status"><span className="settings-save-dot" aria-hidden /><strong>Kaydedilmemiş değişiklikler</strong><button className="secondary-action compact-action" disabled={pending} type="button" onClick={() => setDraft(null)}>Vazgeç</button><button className="primary-action compact-action" disabled={pending} form="workspace-settings-form" type="submit"><Save size={15} /> {pending ? "Kaydediliyor…" : "Kaydet"}</button></div> : null}
    {settingsArea === "communication" ? <WhatsAppGroupSettingsCard /> : null}
    {settingsArea === "compliance" ? <>
    <section className="office-team-section" id="voice-privacy"><div className="section-heading"><div><p className="eyebrow">SES VE GİZLİLİK</p><h2>Görüşme sonrası güvenli not</h2><p>Sesli not yalnız danışmanın görüşme bittikten sonra verdiği özettir; karşı taraf kaydedilmez.</p></div></div><div className="settings-grid"><SpCard className="settings-card"><div className="settings-title"><Lock size={20} /><div><p className="eyebrow">KALICI KORUMALAR</p><h2>Değiştirilemeyen güvenlik sınırları</h2></div></div><ul className="privacy-policy-list"><li>Aktif görüşme sırasında kayıt başlatılmaz; yalnız olduğunuzu ayrıca onaylamanız gerekir.</li><li>Ham ses ve maskelenmemiş döküm kalıcı olarak saklanmaz.</li><li>Hassas veri kategorileri inceleme öncesinde maskelenir.</li><li>Çıkarılan taslak, danışman onayı olmadan kişi veya fırsat kaydına dönüşmez.</li></ul><a className="secondary-action inline-link" href="/capture">Sesli not akışını aç</a></SpCard><SpCard className="settings-card"><div className="settings-title"><ShieldCheck size={20} /><div><p className="eyebrow">VERİ HAKLARI</p><h2>Dışa aktarma ve silme</h2></div></div><p className="privacy-copy">Kişi bazlı JSON dışa aktarımı ve silme talebi aşağıdaki veri sahibi talepleri bölümünden kimlik doğrulamasıyla yürütülür.</p></SpCard></div></section>
    <section className="privacy-requests" id="data-requests"><div className="section-heading"><div><p className="eyebrow">VERİ SAHİBİ HAKLARI</p><h2>Talep ve yanıt takibi</h2></div></div><div className="settings-grid"><SpCard className="settings-card"><h2>Yeni talep</h2><form onKeyDown={handleFormKeyDown} className="form-stack" onSubmit={createRequest}><ContactCombobox contacts={contacts} label="Kişi" value={selectedContactId} onChange={setContactId} placeholder="Kişi ara ve seç" /><label>Talep türü<SpSelect value={requestType} onChange={(event) => setRequestType(event.target.value as DataSubjectRequestType)}>{dataSubjectRequestTypes.map((item) => <option key={item} value={item}>{dataSubjectRequestTypeLabels[item]}</option>)}</SpSelect></label><label>Kimlik / başvuru referansı <span className="optional">isteğe bağlı</span><SpInput value={requesterReference} onChange={(event) => setRequesterReference(event.target.value)} /></label><label>Açıklama<SpTextarea value={details} onChange={(event) => setDetails(event.target.value)} /></label><button className="secondary-action" disabled={pending || !selectedContactId} type="submit">Talebi kaydet</button></form></SpCard><div className="request-list">{(requestsQuery.data ?? []).map((item) => <SpCard className="request-card" key={item.id}><div><strong>{item.contactName}</strong><span>{dataSubjectRequestTypeLabels[item.type]} · {dataSubjectRequestStatusLabels[item.status]}</span><small>{dataRequestCopy.due}: {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(item.dueAt)}</small></div><DataRequestActions item={item} contact={contacts.find((contact) => contact.id === item.contactId)} exportData={() => exportContact(item.id, item.contactId)} /></SpCard>)}{requestsQuery.data?.length === 0 ? <SpCard><p>Henüz veri sahibi talebi yok.</p></SpCard> : null}</div></div></section>
    </> : null}
      </div>
    </div>
  <TestWorkspaceCard /></AppShell>;
}
