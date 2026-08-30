"use client";

import { useState, type FormEvent } from "react";
import { Bell, Download, FileText, Lock, MessageCircleMore, Save, ShieldCheck, UserRoundCog, Users } from "lucide-react";
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
  type ContactDraft,
  type DataSubjectRequestType,
  type WorkspaceSettingsDraft,
  type WorkspaceSettingsView,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listContacts, type ContactRecord } from "@/features/contacts/resources/contacts";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { ContactCombobox } from "@/shared/ui/ContactCombobox";
import { useActiveAnchor } from "@/shared/ui/useActiveAnchor";
import { WhatsAppGroupSettingsCard } from "../components/WhatsAppGroupSettingsCard";
import {
  createDataSubjectRequest,
  getContactDataExport,
  listDataSubjectRequests,
  loadWorkspaceSettings,
  resolveDataSubjectRequest,
  saveWorkspaceSettings,
} from "../resources/settings";

const settingsSections = ["advisor-profile", "reminders", "whatsapp-group", "data-controller", "voice-privacy", "data-requests"] as const;

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Ayarlar güncellenemedi.";
}

function contactDraft(contact: ContactRecord): ContactDraft {
  return {
    fullName: contact.fullName ?? contact.label ?? "İsimsiz kişi",
    phone: contact.phone ?? "",
    metAtPlace: contact.metAtPlace ?? "",
    source: contact.source,
    role: contact.roles[0] ?? "unknown",
  };
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

export function SettingsView() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: apiQueryKeys.workspaceSettings, queryFn: loadWorkspaceSettings });
  const requestsQuery = useQuery({ queryKey: apiQueryKeys.dataSubjectRequests, queryFn: listDataSubjectRequests });
  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts });
  const activeSection = useActiveAnchor(settingsSections, 96, Boolean(settingsQuery.data));
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

  async function resolve(requestId: string, decision: "approved" | "rejected", type: DataSubjectRequestType, targetContactId: string) {
    if (!session) return;
    const contact = contacts.find((item) => item.id === targetContactId);
    setPending(true); setError(null); setMessage(null);
    try {
      await resolveDataSubjectRequest(session, {
        requestId,
        decision,
        resolutionNote: decision === "approved" ? "Kimlik doğrulandı ve talep uygulandı." : "Kimlik veya kapsam doğrulanamadı.",
        correctedContact: decision === "approved" && type === "correction" && contact ? contactDraft(contact) : null,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.dataSubjectRequests }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
      ]);
      setMessage(type === "deletion" && decision === "approved" ? "Silme yayılım işi başlatıldı." : "Talep sonuçlandırıldı.");
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  async function exportContact(targetContactId: string) {
    setPending(true); setError(null);
    try {
      const value = await getContactDataExport(targetContactId);
      downloadJson(value, `spherepath-contact-export-${targetContactId}.json`);
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  if (settingsQuery.isPending || !draft) return <AppShell><div className="content-state">Ayarlar yükleniyor…</div></AppShell>;
  if (settingsQuery.error) return <AppShell><p className="form-error notice">{messageFrom(settingsQuery.error)}</p></AppShell>;
  const requests = requestsQuery.data ?? [];
  const pendingRequests = requests.filter((item) => item.status === "pending_verification");
  const iysApprovedCount = contacts.filter((contact) => contact.privacy.iysStatus === "approved").length;
  const noticeVersion = contacts.map((contact) => contact.privacy.noticeVersion).find(Boolean) ?? "—";

  return <AppShell>
    <header className="page-header settings-header"><div><p className="eyebrow">ÇALIŞMA ALANI</p><h1>Ayarlar ve uyum</h1><p className="context-sentence">Profil, ofis yükümlülükleri, hatırlatmalar ve veri sahibi talepleri.</p></div><div className="header-actions">{editedDraft ? <span className="unsaved-label">Kaydedilmemiş değişiklikler</span> : null}<button className="secondary-action inline-action" disabled={!editedDraft || pending} type="button" onClick={() => setDraft(null)}>Vazgeç</button><button className="primary-action inline-action" disabled={!editedDraft || pending} form="workspace-settings-form" type="submit"><Save size={16} /> {pending ? "Kaydediliyor…" : "Kaydet"}</button></div></header>
    {message ? <p className="success-notice">{message}</p> : null}{error ? <p className="form-error notice">{error}</p> : null}
    <div className="settings-workspace">
      <nav className="settings-subnav" aria-label="Ayar bölümleri">
        <div><span>Hesap</span>
          <a aria-current={activeSection === "advisor-profile" ? "true" : undefined} className={activeSection === "advisor-profile" ? "active" : ""} href="#advisor-profile"><UserRoundCog size={16} /> Danışman profili</a>
          <a aria-current={activeSection === "reminders" ? "true" : undefined} className={activeSection === "reminders" ? "active" : ""} href="#reminders"><Bell size={16} /> Hatırlatmalar</a>
        </div>
        <div><span>Ofis</span>
          <a href="/team"><Users size={16} /> Ekip ve davetler</a>
          <a aria-current={activeSection === "whatsapp-group" ? "true" : undefined} className={activeSection === "whatsapp-group" ? "active" : ""} href="#whatsapp-group"><MessageCircleMore size={16} /> WhatsApp grubu</a>
          <a aria-current={activeSection === "data-controller" ? "true" : undefined} className={activeSection === "data-controller" ? "active" : ""} href="#data-controller"><ShieldCheck size={16} /> Veri sorumlusu</a>
        </div>
        <div><span>Uyum</span>
          <a aria-current={activeSection === "data-requests" ? "true" : undefined} className={activeSection === "data-requests" ? "active" : ""} href="#data-requests"><FileText size={16} /> Veri sahibi talepleri <em>{pendingRequests.length}</em></a>
          <a aria-current={activeSection === "voice-privacy" ? "true" : undefined} className={activeSection === "voice-privacy" ? "active" : ""} href="#voice-privacy"><Lock size={16} /> Ses ve gizlilik</a>
          <a href="#data-requests"><Download size={16} /> Veri dışa aktarma</a>
        </div>
      </nav>
      <div className="settings-main">
        <div className="settings-summary"><SpCard><span>VERBİS</span><strong className="good-text">{verbisStatusLabels[draft.verbisStatus]}</strong><small>{draft.dataControllerName || "Veri sorumlusu belirtilmedi"}</small></SpCard><SpCard><span>Aydınlatma metni</span><strong>{noticeVersion}</strong><small>Kişi kayıtlarında kullanılan sürüm</small></SpCard><SpCard><span>İYS onaylı</span><strong>{iysApprovedCount} / {contacts.length}</strong><div><span style={{ width: `${contacts.length ? Math.round((iysApprovedCount / contacts.length) * 100) : 0}%` }} /></div></SpCard><SpCard><span>Açık talep</span><strong className={pendingRequests.length ? "warm-text" : "good-text"}>{pendingRequests.length} bekliyor</strong><small>{pendingRequests.length ? "Kimlik doğrulama ve yanıt bekliyor" : "Bekleyen talep yok"}</small></SpCard></div>
    <form className="settings-sections" id="workspace-settings-form" onSubmit={save}>
      <SpCard className="settings-card" id="advisor-profile">
        <div className="settings-title"><UserRoundCog size={20} /><div><p className="eyebrow">PROFİL</p><h2>Danışman ayarları</h2></div></div>
        <div className="form-row"><label>Ad soyad<input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></label><label>Telefon<input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label></div>
        <label>Varsayılan bölgeler <span className="optional">virgülle ayır</span><input value={draft.defaultRegions.join(", ")} onChange={(event) => setDraft({ ...draft, defaultRegions: event.target.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 5) })} /></label>
        <div className="form-row"><label>Aylık portföy hedefi<input type="number" min="1" max="100" value={draft.monthlyPortfolioTarget ?? ""} onChange={(event) => setDraft({ ...draft, monthlyPortfolioTarget: event.target.value ? Number(event.target.value) : null })} /></label><label>Haftalık kapasite<input type="number" min="1" max="100" value={draft.weeklyCapacity ?? ""} onChange={(event) => setDraft({ ...draft, weeklyCapacity: event.target.value ? Number(event.target.value) : null })} /></label></div>
      </SpCard>

      <SpCard className="settings-card" id="reminders">
        <div className="settings-title"><Bell size={20} /><div><p className="eyebrow">HATIRLATMA</p><h2>Günlük plan hatırlatıcısı</h2></div></div>
        <label className="check-label"><input type="checkbox" checked={draft.dailyPlanReminderEnabled} onChange={(event) => setDraft({ ...draft, dailyPlanReminderEnabled: event.target.checked })} /> Her sabah günün planını hatırlat</label>
        <div className="form-row"><label>Saat<input type="number" min="0" max="23" disabled={!draft.dailyPlanReminderEnabled} value={draft.dailyPlanReminderHour} onChange={(event) => setDraft({ ...draft, dailyPlanReminderHour: Number(event.target.value) })} /></label><label>Dakika<input type="number" min="0" max="59" disabled={!draft.dailyPlanReminderEnabled} value={draft.dailyPlanReminderMinute} onChange={(event) => setDraft({ ...draft, dailyPlanReminderMinute: Number(event.target.value) })} /></label></div>
        <p className="privacy-hint">Hatırlatma cihaz saatine göre gönderilir ve yalnız o günün planı hazırsa görünür.</p>
      </SpCard>

      <SpCard className="settings-card" id="data-controller">
        <div className="settings-title"><ShieldCheck size={20} /><div><p className="eyebrow">VERİ SORUMLUSU</p><h2>Ofis uyum bilgileri</h2></div></div>
        <div className="form-row"><label>Ülke<select value={draft.country} onChange={(event) => setDraft({ ...draft, country: event.target.value as WorkspaceSettingsDraft["country"] })}>{Object.entries(countryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Veri sorumlusu adı<input value={draft.dataControllerName} onChange={(event) => setDraft({ ...draft, dataControllerName: event.target.value })} /></label><label>VERBİS durumu<select value={draft.verbisStatus} onChange={(event) => setDraft({ ...draft, verbisStatus: event.target.value as WorkspaceSettingsDraft["verbisStatus"] })}>{verbisStatuses.map((item) => <option key={item} value={item}>{verbisStatusLabels[item]}</option>)}</select></label></div>
        {draft.country === "TRNC" ? <div className="trnc-gate"><strong>KKTC zorunlu doğrulama kapısı</strong><p>Firebase verisi KKTC dışına çıktığı için çalışma başlamadan önce hem dosyalama bildirimi hem aktarım ruhsatı gerekir.</p><label className="check-label"><input type="checkbox" checked={draft.trncFilingConfirmed} onChange={(event) => setDraft({ ...draft, trncFilingConfirmed: event.target.checked })} /> m.8 dosyalama bildirimi tamamlandı</label><label className="check-label"><input type="checkbox" checked={draft.trncTransferLicenseConfirmed} onChange={(event) => setDraft({ ...draft, trncTransferLicenseConfirmed: event.target.checked })} /> Yurt dışı aktarım ruhsatı alındı</label></div> : null}
        <p className="privacy-hint">Bu ekran hukuki danışmanlık yerine geçmez. Üretim öncesi yerel hukukçu doğrulaması gerekir.</p>
      </SpCard>

      <div className="settings-sections-footer"><button className="primary-action inline-action" disabled={!editedDraft || pending} type="submit"><Save size={18} /> {pending ? "Kaydediliyor…" : "Ayarları kaydet"}</button></div>
    </form>
    <WhatsAppGroupSettingsCard />
    <section className="office-team-section" id="voice-privacy"><div className="section-heading"><div><p className="eyebrow">SES VE GİZLİLİK</p><h2>Görüşme sonrası güvenli not</h2><p>Sesli not yalnız danışmanın görüşme bittikten sonra verdiği özettir; karşı taraf kaydedilmez.</p></div></div><div className="settings-grid"><SpCard className="settings-card"><div className="settings-title"><Lock size={20} /><div><p className="eyebrow">KALICI KORUMALAR</p><h2>Değiştirilemeyen güvenlik sınırları</h2></div></div><ul className="privacy-policy-list"><li>Aktif görüşme sırasında kayıt başlatılmaz; yalnız olduğunuzu ayrıca onaylamanız gerekir.</li><li>Ham ses ve maskelenmemiş döküm kalıcı olarak saklanmaz.</li><li>Hassas veri kategorileri inceleme öncesinde maskelenir.</li><li>Çıkarılan taslak, danışman onayı olmadan kişi veya fırsat kaydına dönüşmez.</li></ul><a className="secondary-action inline-link" href="/capture">Sesli not akışını aç</a></SpCard><SpCard className="settings-card"><div className="settings-title"><ShieldCheck size={20} /><div><p className="eyebrow">VERİ HAKLARI</p><h2>Dışa aktarma ve silme</h2></div></div><p className="privacy-copy">Kişi bazlı JSON dışa aktarımı ve silme talebi aşağıdaki veri sahibi talepleri bölümünden kimlik doğrulamasıyla yürütülür.</p><a className="secondary-action inline-link" href="#data-requests">Veri sahibi taleplerine git</a></SpCard></div></section>
    <section className="privacy-requests" id="data-requests"><div className="section-heading"><div><p className="eyebrow">VERİ SAHİBİ HAKLARI</p><h2>Talep ve yanıt takibi</h2></div></div><div className="settings-grid"><SpCard className="settings-card"><h2>Yeni talep</h2><form className="form-stack" onSubmit={createRequest}><ContactCombobox contacts={contacts} label="Kişi" value={selectedContactId} onChange={setContactId} placeholder="Kişi ara ve seç" /><label>Talep türü<select value={requestType} onChange={(event) => setRequestType(event.target.value as DataSubjectRequestType)}>{dataSubjectRequestTypes.map((item) => <option key={item} value={item}>{dataSubjectRequestTypeLabels[item]}</option>)}</select></label><label>Kimlik / başvuru referansı <span className="optional">isteğe bağlı</span><input value={requesterReference} onChange={(event) => setRequesterReference(event.target.value)} /></label><label>Açıklama<textarea value={details} onChange={(event) => setDetails(event.target.value)} /></label><button className="secondary-action" disabled={pending || !selectedContactId} type="submit">Talebi kaydet</button></form></SpCard><div className="request-list">{(requestsQuery.data ?? []).map((item) => <SpCard className="request-card" key={item.id}><div><strong>{item.contactName}</strong><span>{dataSubjectRequestTypeLabels[item.type]} · {item.status}</span><small>Son yanıt: {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(item.dueAt)}</small></div><div className="request-actions">{item.type === "access" ? <button type="button" onClick={() => void exportContact(item.contactId)}><Download size={15} /> JSON indir</button> : null}{item.status === "pending_verification" ? <><button type="button" onClick={() => void resolve(item.id, "approved", item.type, item.contactId)}>Onayla</button><button type="button" onClick={() => void resolve(item.id, "rejected", item.type, item.contactId)}>Reddet</button></> : null}</div></SpCard>)}{requestsQuery.data?.length === 0 ? <SpCard><p>Henüz veri sahibi talebi yok.</p></SpCard> : null}</div></div></section>
      </div>
    </div>
  </AppShell>;
}
