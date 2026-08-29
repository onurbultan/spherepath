"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ChevronLeft, ChevronRight, ContactRound, Download, MessageSquarePlus, Pencil, Plus, RefreshCw, Search, ShieldCheck, UserRoundPlus, X } from "lucide-react";
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
  referralDraftSchema,
  type ContactDraft,
  type ContactPrivacyDraft,
} from "@spherepath/shared";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
import { useSession } from "@/features/auth/resources/session";
import { archiveContact, listContacts, saveContact, saveContactPrivacy, type ContactRecord } from "../resources/contacts";
import { listReferrals, saveReferral } from "@/features/referrals/resources/referrals";

const emptyDraft: ContactDraft = {
  fullName: "",
  phone: "",
  metAtPlace: "",
  source: "in_person",
  role: "unknown",
};

function privacyDraft(contact: ContactRecord): ContactPrivacyDraft {
  return { contactId: contact.id, coreCrmLegalBasis: contact.privacy.purposes?.core_crm?.legalBasis ?? "legitimate_interest", noticeStatus: contact.privacy.noticeStatus, noticeMethod: contact.privacy.noticeMethod, noticeVersion: contact.privacy.noticeVersion, marketingConsent: contact.privacy.marketingConsent, marketingChannels: contact.privacy.marketingChannels ?? [], iysStatus: contact.privacy.iysStatus ?? "unknown", profilingObjection: contact.privacy.profilingObjection };
}

function contactDraft(contact: ContactRecord): ContactDraft {
  return {
    fullName: contact.fullName ?? contact.label ?? "",
    phone: contact.phone ?? "",
    metAtPlace: contact.metAtPlace ?? "",
    source: contact.source,
    role: contact.roles[0] ?? "unknown",
  };
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "İşlem tamamlanamadı.";
}

const DEFAULT_REFERENCE_TIME = Date.now();

function relativeDate(value: number | null, now = DEFAULT_REFERENCE_TIME): string {
  if (value === null) return "Temas yok";
  const days = Math.max(0, Math.floor((now - value) / 86_400_000));
  if (days === 0) return "Bugün";
  if (days === 1) return "Dün";
  if (days < 7) return `${days} gün önce`;
  if (days < 30) return `${Math.floor(days / 7)} hafta önce`;
  return `${Math.floor(days / 30)} ay önce`;
}

function nextActionLabel(contact: ContactRecord): string {
  const type = contact.relationship.nextActionType;
  if (!type || contact.relationship.nextActionAt === null) return "Sonraki adım belirlenmedi";
  return `${nextActionTypeLabels[type]} · ${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(contact.relationship.nextActionAt)}`;
}

export function ContactsView() {
  const [referenceTime] = useState(Date.now);
  const router = useRouter();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<ContactRecord | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyDraft);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referralSource, setReferralSource] = useState<ContactRecord | null>(null);
  const [referredContactId, setReferredContactId] = useState("");
  const [referredLabel, setReferredLabel] = useState("");
  const [privacyEditing, setPrivacyEditing] = useState<ContactRecord | null>(null);
  const [privacy, setPrivacy] = useState<ContactPrivacyDraft | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<ContactDraft["role"] | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<ContactDraft["source"] | "all">("all");
  const [recencyFilter, setRecencyFilter] = useState<"all" | "30">("all");
  const [segmentFilter, setSegmentFilter] = useState<"all" | "pending" | "buyers" | "stale">("all");
  const [page, setPage] = useState(1);
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);

  const contactsQuery = useQuery({
    queryKey: apiQueryKeys.contacts,
    queryFn: listContacts,
    enabled: Boolean(session),
  });
  const contacts = contactsQuery.data ?? [];
  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");
  const thirtyDaysAgo = referenceTime - 30 * 86_400_000;
  const visibleContacts = contacts.filter((contact) => {
    if (roleFilter !== "all" && !contact.roles.includes(roleFilter)) return false;
    if (sourceFilter !== "all" && contact.source !== sourceFilter) return false;
    if (recencyFilter === "30" && (contact.relationship.lastTouchAt ?? 0) < thirtyDaysAgo) return false;
    if (segmentFilter === "pending" && contact.privacy.noticeStatus !== "pending") return false;
    if (segmentFilter === "buyers" && !contact.roles.some((role) => role === "buyer" || role === "investor")) return false;
    if (segmentFilter === "stale" && ((contact.relationship.lastTouchAt ?? 0) >= thirtyDaysAgo || contact.relationship.meaningfulTouchCount === 0)) return false;
    if (!normalizedSearch) return true;
    return [
      contact.fullName,
      contact.label,
      contact.phone,
      contact.metAtPlace,
      ...contact.memory.keyThingsToRemember,
      ...contact.memory.propertyPreferences.preferredLocations,
    ].filter(Boolean).some((value) => String(value).toLocaleLowerCase("tr-TR").includes(normalizedSearch));
  });
  const referralsQuery = useQuery({ queryKey: apiQueryKeys.referrals, queryFn: listReferrals, enabled: Boolean(session) });
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(visibleContacts.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedContacts = visibleContacts.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pendingNoticeCount = contacts.filter((contact) => contact.privacy.noticeStatus === "pending").length;
  const buyerCount = contacts.filter((contact) => contact.roles.some((role) => role === "buyer" || role === "investor")).length;
  const staleCount = contacts.filter((contact) => contact.relationship.meaningfulTouchCount > 0 && (contact.relationship.lastTouchAt ?? 0) < thirtyDaysAgo).length;

  useSheetDismiss(panelOpen, () => setPanelOpen(false));
  useSheetDismiss(Boolean(referralSource), () => setReferralSource(null));
  useSheetDismiss(Boolean(privacyEditing), () => setPrivacyEditing(null));
  useSheetDismiss(Boolean(selectedContact), () => setSelectedContact(null));

  function exportContacts() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(visibleContacts, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "spherepath-contacts.json"; anchor.click();
    URL.revokeObjectURL(url);
  }

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft);
    setError(null);
    setPanelOpen(true);
  }

  function openEdit(contact: ContactRecord) {
    setEditing(contact);
    setDraft(contactDraft(contact));
    setError(null);
    setPanelOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const parsed = contactDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Kişi bilgilerini kontrol et.");
      return;
    }

    setPending(true);
    try {
      await saveContact(session, parsed.data, editing ?? undefined);
      setPanelOpen(false);
      setEditing(null);
      setDraft(emptyDraft);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ]);
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(false);
    }
  }

  async function remove(contact: ContactRecord) {
    if (!window.confirm(`${contact.fullName ?? "Bu kişi"} arşivlensin mi?`)) return;
    try {
      if (!session) return;
      await archiveContact(session, contact.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ]);
    } catch (nextError) {
      setError(messageFrom(nextError));
    }
  }

  async function submitReferral(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || !referralSource) return;
    const parsed = referralDraftSchema.safeParse({ sourceContactId: referralSource.id, referredContactId: referredContactId || null, referredLabel: referredContactId ? null : referredLabel.trim() || null });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Referans bilgisini kontrol et.");
    setPending(true); setError(null);
    try { await saveReferral(session, parsed.data); setReferralSource(null); setReferredContactId(""); setReferredLabel(""); await Promise.all([queryClient.invalidateQueries({ queryKey: apiQueryKeys.referrals }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview })]); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  async function submitPrivacy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || !privacy) return;
    const parsed = contactPrivacyDraftSchema.safeParse(privacy); if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Uyum bilgilerini kontrol et.");
    setPending(true); setError(null);
    try { await saveContactPrivacy(session, parsed.data); setPrivacyEditing(null); setPrivacy(null); await queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  return (
    <AppShell>
      <header className="page-header contacts-header">
        <div><p className="eyebrow">İLİŞKİ AĞI</p><h1>Kişiler</h1><p className="context-sentence">Tanıştığın kişileri, kaynağını, uyum durumunu ve sıradaki ilişki adımını tek tabloda tut.</p></div>
        <div className="header-actions"><button className="secondary-action inline-action" disabled={!contacts.length} type="button" onClick={exportContacts}><Download size={16} aria-hidden /> Dışa aktar</button><button className="primary-action inline-action" type="button" onClick={openCreate}><Plus size={18} aria-hidden /> Yeni kişi</button></div>
      </header>

      {(error ?? (contactsQuery.error ? messageFrom(contactsQuery.error) : null)) && !panelOpen ? <p className="form-error notice" role="alert">{error ?? messageFrom(contactsQuery.error)}</p> : null}
      {contacts.length ? <>
        <div className="contact-segments" role="group" aria-label="Kişi görünümleri">
          <button className={segmentFilter === "all" ? "selected" : ""} onClick={() => { setSegmentFilter("all"); setPage(1); }} type="button">Tümü <span>{contacts.length}</span></button>
          <button className={segmentFilter === "pending" ? "selected" : ""} onClick={() => { setSegmentFilter("pending"); setPage(1); }} type="button">Aydınlatma bekleyen <span>{pendingNoticeCount}</span></button>
          <button className={segmentFilter === "buyers" ? "selected" : ""} onClick={() => { setSegmentFilter("buyers"); setPage(1); }} type="button">Sıcak alıcılar <span>{buyerCount}</span></button>
          <button className={segmentFilter === "stale" ? "selected" : ""} onClick={() => { setSegmentFilter("stale"); setPage(1); }} type="button">30 gündür temassız <span>{staleCount}</span></button>
          {(referralsQuery.data?.length ?? 0) > 0 ? <span className="referral-count">{referralsQuery.data?.length} referans bekliyor</span> : null}
        </div>
        <div className="contact-toolbar">
          <label className="contact-search"><Search size={17} aria-hidden /><span className="sr-only">Kişilerde ara</span><input aria-label="Kişilerde ara" placeholder="Ad, telefon, bölge veya hatırlanacak bilgi" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
          <label><span>Rol</span><select aria-label="Role göre filtrele" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value as ContactDraft["role"] | "all"); setPage(1); }}><option value="all">Tümü</option>{contactRoles.map((role) => <option key={role} value={role}>{contactRoleLabels[role]}</option>)}</select></label>
          <label><span>Kaynak</span><select aria-label="Kaynağa göre filtrele" value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value as ContactDraft["source"] | "all"); setPage(1); }}><option value="all">Tümü</option>{contactSources.map((source) => <option key={source} value={source}>{contactSourceLabels[source]}</option>)}</select></label>
          <label><span>Son temas</span><select aria-label="Son temasa göre filtrele" value={recencyFilter} onChange={(event) => { setRecencyFilter(event.target.value as "all" | "30"); setPage(1); }}><option value="all">Tümü</option><option value="30">Son 30 gün</option></select></label>
          <strong>{visibleContacts.length} kişi</strong>
        </div>
      </> : null}
      {contactsQuery.isPending ? (
        <div className="content-state"><RefreshCw className="spin" size={22} aria-hidden /> Kişiler yükleniyor…</div>
      ) : contacts.length === 0 ? (
        <SpCard className="empty-state"><div className="card-icon secondary"><ContactRound size={20} aria-hidden /></div><h2>İlk kişini ekle</h2><p>Ad veya tanımlayıcı, tanışma kaynağı ve rol başlangıç için yeterli.</p><button className="secondary-action" type="button" onClick={openCreate}>Kişi oluştur</button></SpCard>
      ) : visibleContacts.length === 0 ? (
        <SpCard className="empty-state"><Search size={20} aria-hidden /><h2>Eşleşen kişi bulunamadı</h2><p>Arama metnini veya rol filtresini değiştirin.</p></SpCard>
      ) : (
        <section className="contact-table-card" aria-label="Kişiler">
          <div className="contact-table-header"><span>Kişi</span><span>Rol</span><span>Kaynak</span><span>Son temas</span><span>Sonraki adım</span><span>Uyum</span></div>
          {pagedContacts.map((contact) => <button className="contact-table-row" key={contact.id} onClick={() => setSelectedContact(contact)} type="button">
            <span className="contact-table-person"><span className="contact-avatar">{(contact.fullName ?? contact.label ?? "?").slice(0, 1).toLocaleUpperCase("tr-TR")}</span><span><strong>{contact.fullName ?? contact.label}</strong><small>{contact.phone ?? "Telefon eklenmedi"}</small></span></span>
            <span>{contactRoleLabels[contact.roles[0] ?? "unknown"]}</span><span>{contactSourceLabels[contact.source]}</span><span>{relativeDate(contact.relationship.lastTouchAt, referenceTime)}</span><span className={contact.relationship.nextActionAt !== null && contact.relationship.nextActionAt < referenceTime ? "overdue-text" : ""}>{nextActionLabel(contact)}</span><span><span className={`compliance-pill ${contact.privacy.noticeStatus === "completed" ? "compliant" : "pending"}`}>{contact.privacy.iysStatus === "approved" ? "İYS onaylı" : contact.privacy.noticeStatus === "completed" ? "Aydınlatma tamam" : "Aydınlatma bekliyor"}</span></span>
          </button>)}
          <footer className="contact-pagination"><span>{visibleContacts.length} kişiden <strong>{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, visibleContacts.length)}</strong> gösteriliyor</span><div><button aria-label="Önceki sayfa" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button"><ChevronLeft size={14} /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 5).map((item) => <button className={safePage === item ? "selected" : ""} key={item} onClick={() => setPage(item)} type="button">{item}</button>)}<button aria-label="Sonraki sayfa" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} type="button"><ChevronRight size={14} /></button></div></footer>
        </section>
      )}

      {selectedContact ? <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedContact(null); }}><section className="form-sheet contact-detail-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">KİŞİ DETAYI</p><h2>{selectedContact.fullName ?? selectedContact.label}</h2><span className="sheet-subtitle">{contactRoleLabels[selectedContact.roles[0] ?? "unknown"]} · {contactSourceLabels[selectedContact.source]}</span></div><button className="icon-action" aria-label="Kapat" type="button" onClick={() => setSelectedContact(null)}><X size={20} /></button></div><div className="contact-detail-actions"><button className="primary-action inline-action" type="button" onClick={() => router.push(`/capture?contactId=${encodeURIComponent(selectedContact.id)}`)}><MessageSquarePlus size={16} /> Temas kaydet</button><button className="secondary-action inline-action" type="button" onClick={() => { setSelectedContact(null); setReferralSource(selectedContact); }}><UserRoundPlus size={16} /> Referans</button></div><div className="contact-detail-facts"><div><span>Telefon</span><strong>{selectedContact.phone ?? "Eklenmedi"}</strong></div><div><span>Tanışma yeri</span><strong>{selectedContact.metAtPlace || "Belirtilmedi"}</strong></div><div><span>Son temas</span><strong>{relativeDate(selectedContact.relationship.lastTouchAt)}</strong></div><div><span>Sonraki adım</span><strong>{nextActionLabel(selectedContact)}</strong></div></div>{selectedContact.memory.keyThingsToRemember.length ? <div className="contact-detail-section"><p className="eyebrow">HATIRLANACAKLAR</p><ul>{selectedContact.memory.keyThingsToRemember.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}{selectedContact.memory.propertyPreferences.preferredLocations.length || selectedContact.memory.propertyPreferences.mustHaves.length ? <div className="contact-detail-section"><p className="eyebrow">GAYRİMENKUL HAFIZASI</p><div className="opportunity-highlights">{selectedContact.memory.propertyPreferences.preferredLocations.map((item) => <span key={item}>{item}</span>)}{selectedContact.memory.propertyPreferences.mustHaves.map((item) => <span key={item}>Olmazsa olmaz: {item}</span>)}</div></div> : null}<div className="contact-detail-section"><p className="eyebrow">UYUM</p><div className="privacy-status"><span className={selectedContact.privacy.noticeStatus === "completed" ? "compliant" : "pending"}>{selectedContact.privacy.noticeStatus === "completed" ? "Aydınlatma tamam" : "Aydınlatma bekliyor"}</span><span>{selectedContact.privacy.marketingConsent === "granted" ? "Pazarlama izni var" : "Pazarlama izni yok"}</span></div></div><div className="contact-detail-footer"><button className="secondary-action inline-action" onClick={() => { setSelectedContact(null); setPrivacyEditing(selectedContact); setPrivacy(privacyDraft(selectedContact)); }} type="button"><ShieldCheck size={16} /> Uyumu düzenle</button><button className="secondary-action inline-action" onClick={() => { setSelectedContact(null); openEdit(selectedContact); }} type="button"><Pencil size={16} /> Düzenle</button><button className="secondary-action danger-secondary inline-action" onClick={() => void remove(selectedContact)} type="button"><Archive size={16} /> Arşivle</button></div></section></div> : null}

      {panelOpen ? (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPanelOpen(false); }}>
          <section className="form-sheet" role="dialog" aria-modal="true" aria-labelledby="contact-form-title">
            <div className="sheet-heading"><div><p className="eyebrow">HIZLI KAYIT</p><h2 id="contact-form-title">{editing ? "Kişiyi düzenle" : "Yeni kişi"}</h2></div><button className="icon-action" aria-label="Kapat" type="button" onClick={() => setPanelOpen(false)}><X size={20} /></button></div>
            <form className="form-stack" onSubmit={submit}>
              <label>Ad, soyad veya tanımlayıcı<input autoFocus value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} required /></label>
              <label>Telefon <span className="optional">isteğe bağlı</span><input inputMode="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
              <label>Tanışma yeri <span className="optional">isteğe bağlı</span><input value={draft.metAtPlace} onChange={(event) => setDraft({ ...draft, metAtPlace: event.target.value })} placeholder="Örn. Marina açık ev etkinliği" /></label>
              <div className="form-row">
                <label>Kaynak<select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value as ContactDraft["source"] })}>{contactSources.map((source) => <option key={source} value={source}>{contactSourceLabels[source]}</option>)}</select></label>
                <label>Rol<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as ContactDraft["role"] })}>{contactRoles.map((role) => <option key={role} value={role}>{contactRoleLabels[role]}</option>)}</select></label>
              </div>
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Kaydediliyor…" : editing ? "Değişiklikleri kaydet" : "Kişiyi kaydet"}</button>
            </form>
          </section>
        </div>
      ) : null}
      {referralSource ? <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setReferralSource(null); }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">REFERANS KAYDI</p><h2>{referralSource.fullName ?? referralSource.label}</h2></div><button className="icon-action" aria-label="Kapat" type="button" onClick={() => setReferralSource(null)}><X size={20} /></button></div><form className="form-stack" onSubmit={submitReferral}><label>Kayıtlı kişi <span className="optional">varsa</span><select value={referredContactId} onChange={(event) => setReferredContactId(event.target.value)}><option value="">Henüz kişi kaydı yok</option>{contacts.filter((item) => item.id !== referralSource.id).map((item) => <option key={item.id} value={item.id}>{item.fullName ?? item.label}</option>)}</select></label>{!referredContactId ? <label>Kısa tanım<input placeholder="Örn. Komşusu Mehmet Bey" value={referredLabel} onChange={(event) => setReferredLabel(event.target.value)} /></label> : null}<p className="privacy-hint">Bu referans doğrudan pazarlama akışına alınmaz. İlk temasta aydınlatma tamamlanmalıdır.</p>{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Kaydediliyor…" : "Referansı kaydet"}</button></form></section></div> : null}
      {privacyEditing && privacy ? <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPrivacyEditing(null); }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">AYDINLATMA VE İZİN</p><h2>{privacyEditing.fullName ?? privacyEditing.label}</h2></div><button className="icon-action" aria-label="Kapat" type="button" onClick={() => setPrivacyEditing(null)}><X size={20} /></button></div><form className="form-stack" onSubmit={submitPrivacy}><label>CRM hukuki sebebi<select value={privacy.coreCrmLegalBasis} onChange={(event) => setPrivacy({ ...privacy, coreCrmLegalBasis: event.target.value as ContactPrivacyDraft["coreCrmLegalBasis"] })}>{legalBases.map((item) => <option key={item} value={item}>{legalBasisLabels[item]}</option>)}</select></label><fieldset><legend>Aydınlatma</legend><div className="chip-row"><button type="button" className={`choice-chip ${privacy.noticeStatus === "pending" ? "selected" : ""}`} onClick={() => setPrivacy({ ...privacy, noticeStatus: "pending", noticeMethod: null, noticeVersion: null })}>Bekliyor</button><button type="button" className={`choice-chip ${privacy.noticeStatus === "completed" ? "selected" : ""}`} onClick={() => setPrivacy({ ...privacy, noticeStatus: "completed", noticeMethod: privacy.noticeMethod ?? "verbal", noticeVersion: privacy.noticeVersion ?? "v1" })}>Okudum/anladım kaydı tamam</button></div></fieldset>{privacy.noticeStatus === "completed" ? <div className="form-row"><label>Yöntem<select value={privacy.noticeMethod ?? "verbal"} onChange={(event) => setPrivacy({ ...privacy, noticeMethod: event.target.value as "verbal" | "written" | "electronic" })}><option value="verbal">Sözlü</option><option value="written">Yazılı</option><option value="electronic">Elektronik</option></select></label><label>Metin sürümü<input value={privacy.noticeVersion ?? ""} onChange={(event) => setPrivacy({ ...privacy, noticeVersion: event.target.value })} /></label></div> : null}<fieldset><legend>Pazarlama rızası · aydınlatmadan ayrı</legend><div className="chip-row">{(["unknown", "granted", "withdrawn"] as const).map((item) => <button type="button" className={`choice-chip ${privacy.marketingConsent === item ? "selected" : ""}`} key={item} onClick={() => setPrivacy({ ...privacy, marketingConsent: item, marketingChannels: item === "granted" ? privacy.marketingChannels : [] })}>{item === "unknown" ? "Bilinmiyor" : item === "granted" ? "Verildi" : "Geri alındı"}</button>)}</div></fieldset>{privacy.marketingConsent === "granted" ? <fieldset><legend>İzinli kanallar</legend><div className="chip-row">{marketingChannels.map((item) => <button type="button" className={`choice-chip ${privacy.marketingChannels.includes(item) ? "selected" : ""}`} key={item} onClick={() => setPrivacy({ ...privacy, marketingChannels: privacy.marketingChannels.includes(item) ? privacy.marketingChannels.filter((channel) => channel !== item) : [...privacy.marketingChannels, item] })}>{marketingChannelLabels[item]}</button>)}</div></fieldset> : null}<label>İYS durumu<select value={privacy.iysStatus} onChange={(event) => setPrivacy({ ...privacy, iysStatus: event.target.value as ContactPrivacyDraft["iysStatus"] })}>{iysStatuses.map((item) => <option key={item} value={item}>{iysStatusLabels[item]}</option>)}</select></label><label className="check-label"><input checked={privacy.profilingObjection} type="checkbox" onChange={(event) => setPrivacy({ ...privacy, profilingObjection: event.target.checked })} /> Otomatik analiz/eşleştirme itirazı var</label>{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Kaydediliyor…" : "Uyum kaydını güncelle"}</button></form></section></div> : null}
    </AppShell>
  );
}
