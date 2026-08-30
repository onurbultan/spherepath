"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ContactRound, Save, UserPlus, X } from "lucide-react";
import {
  apiQueryKeys,
  askOutcomeLabels,
  askOutcomes,
  contactDraftSchema,
  contactRoleLabels,
  contactRoles,
  contactSourceLabels,
  contactSources,
  interactionChannelLabels,
  interactionChannels,
  interactionDirectionLabels,
  interactionDirections,
  interactionObjectiveLabels,
  interactionObjectives,
  manualInteractionSchema,
  nextActionTypeLabels,
  nextActionTypes,
  type ContactDraft,
  type ManualInteractionDraft,
} from "@spherepath/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth/resources/session";
import { listContacts, saveContact } from "@/features/contacts/resources/contacts";
import { AppShell } from "@/shared/ui/AppShell";
import { ContactCombobox } from "@/shared/ui/ContactCombobox";
import { QuickDateField } from "@/shared/ui/QuickDateField";
import { SpCard } from "@/shared/ui/SpCard";
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
import { saveManualInteraction } from "../resources/interactions";
import { VoiceCaptureCard } from "../components/VoiceCaptureCard";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Temas kaydedilemedi.";
}

const emptyContactDraft: ContactDraft = { fullName: "", phone: "", metAtPlace: "", source: "in_person", role: "unknown" };

export function CaptureView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [contactId, setContactId] = useState("");
  const [channel, setChannel] = useState<ManualInteractionDraft["channel"]>("in_person");
  const [objective, setObjective] = useState<ManualInteractionDraft["objective"]>("get_acquainted");
  const [direction, setDirection] = useState<ManualInteractionDraft["direction"]>("mutual");
  const [outcome, setOutcome] = useState("");
  const [askOutcome, setAskOutcome] = useState<ManualInteractionDraft["askOutcome"]>("not_asked");
  const [nextActionType, setNextActionType] = useState<ManualInteractionDraft["nextActionType"]>(null);
  const [nextActionAt, setNextActionAt] = useState("");
  const [noteSummary, setNoteSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [quickContactOpen, setQuickContactOpen] = useState(false);
  const [quickContactDraft, setQuickContactDraft] = useState<ContactDraft>(emptyContactDraft);
  const [contactPending, setContactPending] = useState(false);
  const [captureMode, setCaptureMode] = useState<"voice" | "manual">("voice");

  const contactsQuery = useQuery({
    queryKey: apiQueryKeys.contacts,
    queryFn: listContacts,
    enabled: Boolean(session),
  });
  const contacts = contactsQuery.data ?? [];
  const requestedContactId = searchParams.get("contactId") ?? "";
  const selectedContactId = contactId || (contacts.some((contact) => contact.id === requestedContactId) ? requestedContactId : "");

  useSheetDismiss(quickContactOpen, () => { if (!contactPending) setQuickContactOpen(false); });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const submitted = new FormData(event.currentTarget);
    const submittedNextActionAt = String(submitted.get("nextActionAt") ?? "");
    const raw = {
      contactId: selectedContactId,
      channel,
      objective,
      direction,
      outcome,
      askOutcome,
      nextActionType,
      nextActionAt: submittedNextActionAt ? new Date(submittedNextActionAt).getTime() : null,
      noteSummary,
      occurredAt: occurredAt ? new Date(occurredAt).getTime() : null,
    };
    const parsed = manualInteractionSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Temas bilgilerini kontrol et.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const interactionId = await saveManualInteraction(session, parsed.data);
      setQueuedOffline(interactionId.startsWith("queued-"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ]);
      setSaved(true);
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(false);
    }
  }

  async function createQuickContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const parsed = contactDraftSchema.safeParse(quickContactDraft);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Kişi bilgilerini kontrol et.");
    setContactPending(true); setError(null);
    try {
      const created = await saveContact(session, parsed.data);
      setContactId(created.id);
      setQuickContactDraft(emptyContactDraft);
      setQuickContactOpen(false);
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts });
      router.replace(`/capture?contactId=${encodeURIComponent(created.id)}`);
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setContactPending(false); }
  }

  function resetManualInteraction() {
    setChannel("in_person");
    setObjective("get_acquainted");
    setDirection("mutual");
    setOutcome("");
    setAskOutcome("not_asked");
    setNextActionType(null);
    setNextActionAt("");
    setNoteSummary("");
    setError(null);
    setSaved(false);
    setQueuedOffline(false);
  }

  const quickContactSheet = quickContactOpen ? <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !contactPending) setQuickContactOpen(false); }}><section className="form-sheet" role="dialog" aria-modal="true" aria-labelledby="quick-contact-title"><div className="sheet-heading"><div><p className="eyebrow">AYNI AKIŞTA</p><h2 id="quick-contact-title">Yeni kişi ekle</h2><p className="privacy-copy">Kişiyi kaydettiğinizde bu görüşme ekranında otomatik seçilir.</p></div><button className="icon-action" aria-label="Kapat" disabled={contactPending} onClick={() => setQuickContactOpen(false)} type="button"><X size={20} /></button></div><form className="form-stack" onSubmit={createQuickContact}><label>Ad, soyad veya tanımlayıcı<input autoFocus required value={quickContactDraft.fullName} onChange={(event) => setQuickContactDraft({ ...quickContactDraft, fullName: event.target.value })} /></label><label>Telefon <span className="optional">isteğe bağlı</span><input inputMode="tel" value={quickContactDraft.phone} onChange={(event) => setQuickContactDraft({ ...quickContactDraft, phone: event.target.value })} /></label><label>Tanışma yeri <span className="optional">isteğe bağlı</span><input placeholder="Örn. Urla açık ev etkinliği" value={quickContactDraft.metAtPlace} onChange={(event) => setQuickContactDraft({ ...quickContactDraft, metAtPlace: event.target.value })} /></label><div className="form-row"><label>Kaynak<select value={quickContactDraft.source} onChange={(event) => setQuickContactDraft({ ...quickContactDraft, source: event.target.value as ContactDraft["source"] })}>{contactSources.map((item) => <option key={item} value={item}>{contactSourceLabels[item]}</option>)}</select></label><label>Rol<select value={quickContactDraft.role} onChange={(event) => setQuickContactDraft({ ...quickContactDraft, role: event.target.value as ContactDraft["role"] })}>{contactRoles.map((item) => <option key={item} value={item}>{contactRoleLabels[item]}</option>)}</select></label></div><details className="form-details"><summary>İlk takibi planla · isteğe bağlı</summary><div className="form-row"><label>Aksiyon<select value={quickContactDraft.nextActionType ?? ""} onChange={(event) => setQuickContactDraft({ ...quickContactDraft, nextActionType: (event.target.value || null) as ContactDraft["nextActionType"], nextActionAt: event.target.value ? quickContactDraft.nextActionAt ?? null : null })}><option value="">Henüz yok</option>{nextActionTypes.map((type) => <option key={type} value={type}>{nextActionTypeLabels[type]}</option>)}</select></label><QuickDateField disabled={!quickContactDraft.nextActionType} required={Boolean(quickContactDraft.nextActionType)} value={quickContactDraft.nextActionAt ? new Date(new Date(quickContactDraft.nextActionAt).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ""} onChange={(value) => setQuickContactDraft({ ...quickContactDraft, nextActionAt: value ? new Date(value).getTime() : null })} /></div></details>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="primary-action auth-submit" disabled={contactPending} type="submit">{contactPending ? "Kişi hazırlanıyor…" : "Kişiyi ekle ve görüşmeye dön"}</button></form></section></div> : null;

  if (contactsQuery.isPending) return <AppShell><div className="content-state">Kişiler yükleniyor…</div></AppShell>;
  if (contactsQuery.error) return <AppShell><p className="form-error notice" role="alert">{messageFrom(contactsQuery.error)}</p></AppShell>;
  if (contacts.length === 0) {
    return <AppShell><header className="page-header"><p className="eyebrow">HIZLI KAYIT</p><h1>Temas kaydet</h1></header><SpCard className="empty-state"><div className="card-icon secondary"><ContactRound size={20} aria-hidden /></div><h2>İlk kişiyi burada ekle</h2><p>Kişiler ekranına gitmeden, kişiyi oluşturup görüşme kaydına devam edebilirsiniz.</p><button className="primary-action inline-action" onClick={() => setQuickContactOpen(true)} type="button"><UserPlus size={17} /> Yeni kişi ekle</button></SpCard>{quickContactSheet}</AppShell>;
  }

  return (
    <AppShell>
      <header className="page-header contacts-header capture-header"><div><p className="eyebrow">HIZLI KAYIT</p><h1>Temas kaydet</h1><p className="context-sentence">Görüşme sonucunu ve kabul edilmiş sonraki adımı kısa biçimde kapat.</p></div><button className="secondary-action inline-action" onClick={() => { setError(null); setQuickContactOpen(true); }} type="button"><UserPlus size={17} /> Yeni kişi</button></header>
      <div className="capture-mode-tabs" role="tablist" aria-label="Kayıt yöntemi"><button className={captureMode === "voice" ? "selected" : ""} role="tab" aria-selected={captureMode === "voice"} onClick={() => setCaptureMode("voice")} type="button">Sesli anlat</button><button className={captureMode === "manual" ? "selected" : ""} role="tab" aria-selected={captureMode === "manual"} onClick={() => setCaptureMode("manual")} type="button">Manuel yaz</button></div>
      {captureMode === "voice" ? <VoiceCaptureCard key={selectedContactId} session={session!} contacts={contacts} initialContactId={selectedContactId} onSaved={async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
          queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
        ]);
      }} /> : saved ? (
        <SpCard className="success-state"><div className="success-icon"><Check size={24} aria-hidden /></div><p className="eyebrow">{queuedOffline ? "CİHAZDA GÜVENDE" : "KAYDEDİLDİ"}</p><h2>{queuedOffline ? "Temas bağlantı gelince gönderilecek" : "Temas ve sonraki aksiyon hazır"}</h2><p>{queuedOffline ? "Bu sayfada beklemeniz gerekmez; aynı hesapla çevrimiçi olduğunuzda kayıt otomatik eşitlenir." : "Bugün ekranındaki ilişki görünümü birkaç saniye içinde güncellenecek."}</p><div className="capture-actions"><button className="secondary-action" type="button" onClick={() => router.push("/")}>Bugün ekranına dön</button>{!queuedOffline ? <Link className="secondary-action inline-link" href={`/listings?action=add-listing&ownerContactId=${encodeURIComponent(selectedContactId)}`}>Yetkili portföy ekle</Link> : null}<button className="primary-action" type="button" onClick={resetManualInteraction}>Başka temas kaydet</button></div></SpCard>
      ) : (
        <form className="capture-form" onSubmit={submit}>
          <SpCard className="form-section"><div className="section-heading compact"><div><p className="eyebrow">1 · KİM</p><h2>Görüşülen kişi</h2></div></div><div className="form-row"><ContactCombobox contacts={contacts} value={selectedContactId} onChange={setContactId} /><label>Kanal<select value={channel} onChange={(event) => setChannel(event.target.value as ManualInteractionDraft["channel"])}>{interactionChannels.map((item) => <option key={item} value={item}>{interactionChannelLabels[item]}</option>)}</select></label></div></SpCard>
          <SpCard className="form-section"><p className="eyebrow">2 · NE OLDU</p><h2>Görüşme sonucu</h2><label>Kısa sonuç<textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="Örn. Salı günü satış planını konuşacağız." required /></label><details className="form-details"><summary>İsteğe bağlı ayrıntılar</summary><div className="form-stack"><label>Görüşme amacı<select value={objective} onChange={(event) => setObjective(event.target.value as ManualInteractionDraft["objective"])}>{interactionObjectives.map((item) => <option key={item} value={item}>{interactionObjectiveLabels[item]}</option>)}</select></label><label>Yön<select value={direction} onChange={(event) => setDirection(event.target.value as ManualInteractionDraft["direction"])}>{interactionDirections.map((item) => <option key={item} value={item}>{interactionDirectionLabels[item]}</option>)}</select></label><QuickDateField past required={false} label="Görüşme ne zaman oldu" value={occurredAt} onChange={setOccurredAt} /><label>Talep sonucu<select value={askOutcome} onChange={(event) => setAskOutcome(event.target.value as ManualInteractionDraft["askOutcome"])}>{askOutcomes.map((item) => <option key={item} value={item}>{askOutcomeLabels[item]}</option>)}</select></label><label>Ek not<textarea value={noteSummary} onChange={(event) => setNoteSummary(event.target.value)} /></label></div></details></SpCard>
          <SpCard className="form-section"><p className="eyebrow">3 · SONRAKİ ADIM</p><h2>Takibi planla</h2><div className="form-row"><label>Aksiyon<select value={nextActionType ?? ""} onChange={(event) => { const value = (event.target.value || null) as ManualInteractionDraft["nextActionType"]; setNextActionType(value); if (!value) setNextActionAt(""); }}><option value="">Henüz yok</option>{nextActionTypes.map((item) => <option key={item} value={item}>{nextActionTypeLabels[item]}</option>)}</select></label><QuickDateField disabled={!nextActionType} label="Tarih · saat isteğe göre değiştirilebilir" required={Boolean(nextActionType)} value={nextActionAt} onChange={setNextActionAt} /></div><input name="nextActionAt" type="hidden" value={nextActionAt} /></SpCard>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="capture-actions"><span className="privacy-copy">Yalnız gerekli iş sonucunu kaydedin.</span><button className="primary-action inline-action" disabled={pending || !selectedContactId} type="submit"><Save size={18} aria-hidden /> {pending ? "Kaydediliyor…" : "Teması kaydet"}</button></div>
        </form>
      )}
      {quickContactSheet}
    </AppShell>
  );
}
