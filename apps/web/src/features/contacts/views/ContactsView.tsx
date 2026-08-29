"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ContactRound, MessageSquarePlus, Pencil, Plus, RefreshCw, Search, ShieldCheck, UserRoundPlus, X } from "lucide-react";
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
  referralDraftSchema,
  type ContactDraft,
  type ContactPrivacyDraft,
} from "@spherepath/shared";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
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

export function ContactsView() {
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

  const contactsQuery = useQuery({
    queryKey: apiQueryKeys.contacts,
    queryFn: listContacts,
    enabled: Boolean(session),
  });
  const contacts = contactsQuery.data ?? [];
  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");
  const visibleContacts = contacts.filter((contact) => {
    if (roleFilter !== "all" && !contact.roles.includes(roleFilter)) return false;
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
        <div><p className="eyebrow">İLİŞKİ AĞI</p><h1>Kişiler</h1><p className="context-sentence">Tanıştığın kişileri, kaynağını ve sıradaki ilişki adımını tek yerde tut.</p></div>
        <button className="primary-action inline-action" type="button" onClick={openCreate}><Plus size={18} aria-hidden /> Yeni kişi</button>
      </header>

      {(error ?? (contactsQuery.error ? messageFrom(contactsQuery.error) : null)) && !panelOpen ? <p className="form-error notice" role="alert">{error ?? messageFrom(contactsQuery.error)}</p> : null}
      {(referralsQuery.data?.length ?? 0) > 0 ? <section className="referral-strip" aria-label="Son referanslar"><div><p className="eyebrow">REFERANSLAR</p><h2>İlk temas bekleyenler</h2></div>{referralsQuery.data?.slice(0, 4).map((referral) => <SpCard key={referral.id} className="referral-mini"><strong>{referral.referredContactName}</strong><span>{referral.sourceContactName} aracılığıyla</span><small>İlk temas ve aydınlatma bekliyor</small></SpCard>)}</section> : null}
      {contacts.length ? <div className="contact-toolbar"><label className="contact-search"><Search size={17} aria-hidden /><span className="sr-only">Kişilerde ara</span><input aria-label="Kişilerde ara" placeholder="Ad, telefon, bölge veya hatırlanacak bilgi ara" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label><span className="sr-only">Role göre filtrele</span><select aria-label="Role göre filtrele" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as ContactDraft["role"] | "all")}><option value="all">Tüm roller</option>{contactRoles.map((role) => <option key={role} value={role}>{contactRoleLabels[role]}</option>)}</select></label><span>{visibleContacts.length} kişi</span></div> : null}
      {contactsQuery.isPending ? (
        <div className="content-state"><RefreshCw className="spin" size={22} aria-hidden /> Kişiler yükleniyor…</div>
      ) : contacts.length === 0 ? (
        <SpCard className="empty-state"><div className="card-icon secondary"><ContactRound size={20} aria-hidden /></div><h2>İlk kişini ekle</h2><p>Ad veya tanımlayıcı, tanışma kaynağı ve rol başlangıç için yeterli.</p><button className="secondary-action" type="button" onClick={openCreate}>Kişi oluştur</button></SpCard>
      ) : visibleContacts.length === 0 ? (
        <SpCard className="empty-state"><Search size={20} aria-hidden /><h2>Eşleşen kişi bulunamadı</h2><p>Arama metnini veya rol filtresini değiştirin.</p></SpCard>
      ) : (
        <section className="contact-grid" aria-label="Kişiler">
          {visibleContacts.map((contact) => (
            <SpCard key={contact.id} className="contact-card">
              <div className="contact-avatar">{(contact.fullName ?? contact.label ?? "?").slice(0, 1).toLocaleUpperCase("tr-TR")}</div>
              <div className="contact-summary"><h2>{contact.fullName ?? contact.label}</h2><p>{contact.phone ?? "Telefon eklenmedi"}</p></div>
              <div className="contact-meta"><span>{contactRoleLabels[contact.roles[0] ?? "unknown"]}</span><span>{contactSourceLabels[contact.source]}</span></div>
              <p className="contact-place">{contact.metAtPlace || "Tanışma yeri belirtilmedi"}</p>
              {(contact.memory?.keyThingsToRemember?.length ?? 0) > 0 ? <div className="contact-memory"><strong>Hatırlanacaklar</strong>{contact.memory.keyThingsToRemember.slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div> : null}
              <div className="privacy-status"><span className={contact.privacy.noticeStatus === "completed" ? "compliant" : "pending"}>{contact.privacy.noticeStatus === "completed" ? "Aydınlatma tamam" : "Aydınlatma bekliyor"}</span><span>{contact.privacy.marketingConsent === "granted" ? "Pazarlama izni var" : "Pazarlama izni yok"}</span></div><div className="card-actions"><button type="button" onClick={() => router.push(`/capture?contactId=${encodeURIComponent(contact.id)}`)}><MessageSquarePlus size={16} aria-hidden /> Temas</button><button type="button" onClick={() => { setReferralSource(contact); setError(null); }}><UserRoundPlus size={16} aria-hidden /> Referans</button><button type="button" onClick={() => { setPrivacyEditing(contact); setPrivacy(privacyDraft(contact)); setError(null); }}><ShieldCheck size={16} aria-hidden /> Uyum</button><button type="button" onClick={() => openEdit(contact)}><Pencil size={16} aria-hidden /> Düzenle</button><button type="button" onClick={() => void remove(contact)}><Archive size={16} aria-hidden /> Arşivle</button></div>
            </SpCard>
          ))}
        </section>
      )}

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
