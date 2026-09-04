"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
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
  opportunityTypeLabels,
  suggestOpportunityTypeForRoles,
  type ContactDraft,
  type ManualInteractionDraft,
} from "@spherepath/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth/resources/session";
import { listContacts, saveContact } from "@/features/contacts/resources/contacts";
import { listOpportunities, saveOpportunity } from "@/features/opportunities/resources/opportunities";
import { AppShell } from "@/shared/ui/AppShell";
import { ContactCombobox } from "@/shared/ui/ContactCombobox";
import { QuickDateField } from "@/shared/ui/QuickDateField";
import { SpCard } from "@/shared/ui/SpCard";
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
import { saveManualInteraction } from "../resources/interactions";
import { VoiceCaptureCard } from "../components/VoiceCaptureCard";
import { PhoneField } from "@/shared/ui/MaskedFields";
import { SpInput, SpSelect, SpTextarea } from "@/shared/ui/SpField";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Temas kaydedilemedi.";
}
function localDateTimeFrom(value: number): string { const date = new Date(value); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }

const emptyContactDraft: ContactDraft = { fullName: "", internalLabel: "", phone: "", metAtPlace: "", source: "in_person", role: "unknown" };

export function CaptureView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedContactId = searchParams.get("contactId") ?? "";
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [contactId, setContactId] = useState(requestedContactId);
  const [channel, setChannel] = useState<ManualInteractionDraft["channel"]>("in_person");
  const [objective, setObjective] = useState<ManualInteractionDraft["objective"]>("get_acquainted");
  const [direction, setDirection] = useState<ManualInteractionDraft["direction"]>("mutual");
  const [outcome, setOutcome] = useState("");
  const [askOutcome, setAskOutcome] = useState<ManualInteractionDraft["askOutcome"]>("not_asked");
  const [nextActionType, setNextActionType] = useState<ManualInteractionDraft["nextActionType"]>(null);
  const [nextActionAt, setNextActionAt] = useState("");
  const [nextActionTouched, setNextActionTouched] = useState(false);
  const [noteSummary, setNoteSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [quickContactOpen, setQuickContactOpen] = useState(false);
  const [quickContactDraft, setQuickContactDraft] = useState<ContactDraft>(emptyContactDraft);
  const [contactPending, setContactPending] = useState(false);
  const [opportunityPending, setOpportunityPending] = useState(false);
  const [createdOpportunityId, setCreatedOpportunityId] = useState<string | null>(null);
  const [opportunityError, setOpportunityError] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<"voice" | "manual">("voice");

  useEffect(() => {
    const stored = window.localStorage.getItem("spherepath.captureMode");
    // Client storage is the external source of truth for this remembered preference.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "voice" || stored === "manual") setCaptureMode(stored);
  }, []);

  function changeCaptureMode(mode: "voice" | "manual") {
    setCaptureMode(mode);
    window.localStorage.setItem("spherepath.captureMode", mode);
  }

  const contactsQuery = useQuery({
    queryKey: apiQueryKeys.contacts,
    queryFn: listContacts,
    enabled: Boolean(session),
  });
  const contacts = contactsQuery.data ?? [];
  const selectedContactId = contacts.some((contact) => contact.id === contactId) ? contactId : "";
  const selectedContact = contacts.find((contact) => contact.id === selectedContactId) ?? null;
  useEffect(() => {
    if (nextActionTouched || !selectedContact?.relationship.nextActionType || selectedContact.relationship.nextActionAt === null) return;
    // The selected record arrives asynchronously; this is a one-time form prefill, not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNextActionType(selectedContact.relationship.nextActionType);
    setNextActionAt(localDateTimeFrom(selectedContact.relationship.nextActionAt));
  }, [nextActionTouched, selectedContact]);
  const selectedContactName = selectedContact?.fullName ?? selectedContact?.label ?? "Seçilen kişi";
  const suggestedOpportunityType = suggestOpportunityTypeForRoles(selectedContact?.roles ?? []);
  const opportunitiesQuery = useQuery({
    queryKey: apiQueryKeys.opportunities,
    queryFn: listOpportunities,
    enabled: Boolean(session && saved && suggestedOpportunityType && !queuedOffline),
  });
  const existingOpportunity = opportunitiesQuery.data?.find((opportunity) => (
    opportunity.subjectContactId === selectedContactId
    && opportunity.type === suggestedOpportunityType
    && opportunity.stage !== "won"
    && opportunity.stage !== "lost"
  )) ?? null;
  const availableOpportunityId = createdOpportunityId ?? existingOpportunity?.id ?? null;

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

  async function createOpportunityFromInteraction() {
    if (!session || !suggestedOpportunityType || !nextActionType || !nextActionAt || availableOpportunityId) return;
    setOpportunityPending(true);
    setOpportunityError(null);
    try {
      const created = await saveOpportunity(session, {
        subjectContactId: selectedContactId,
        type: suggestedOpportunityType,
        nextActionType,
        nextActionAt: new Date(nextActionAt).getTime(),
      });
      setCreatedOpportunityId(created.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunities }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ]);
    } catch (nextError) {
      setOpportunityError(nextError instanceof Error ? nextError.message : "Fırsat oluşturulamadı.");
    } finally {
      setOpportunityPending(false);
    }
  }

  function resetManualInteraction() {
    setContactId("");
    setChannel("in_person");
    setObjective("get_acquainted");
    setDirection("mutual");
    setOutcome("");
    setAskOutcome("not_asked");
    setNextActionType(null);
    setNextActionAt("");
    setNextActionTouched(false);
    setNoteSummary("");
    setError(null);
    setSaved(false);
    setQueuedOffline(false);
    setCreatedOpportunityId(null);
    setOpportunityError(null);
    router.replace("/capture");
  }

  const quickContactSheet = quickContactOpen ? <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !contactPending) setQuickContactOpen(false); }}><section className="form-sheet" role="dialog" aria-modal="true" aria-labelledby="quick-contact-title"><div className="sheet-heading"><div><p className="eyebrow">AYNI AKIŞTA</p><h2 id="quick-contact-title">Yeni kişi ekle</h2><p className="privacy-copy">Kişiyi kaydettiğinizde bu görüşme ekranında otomatik seçilir.</p></div><button className="icon-action" aria-label="Kapat" disabled={contactPending} onClick={() => setQuickContactOpen(false)} type="button"><X size={20} /></button></div><form className="form-stack" onSubmit={createQuickContact}><label>Ad soyad<SpInput autoFocus required value={quickContactDraft.fullName} onChange={(event) => setQuickContactDraft({ ...quickContactDraft, fullName: event.target.value })} /></label><label>İç etiket <span className="optional">isteğe bağlı · müşteriye gösterilmez</span><SpInput value={quickContactDraft.internalLabel ?? ""} onChange={(event) => setQuickContactDraft({ ...quickContactDraft, internalLabel: event.target.value })} placeholder="Örn. Urla açık ev" /></label><label>Telefon <span className="optional">isteğe bağlı</span><PhoneField value={quickContactDraft.phone} onChange={(phone) => setQuickContactDraft({ ...quickContactDraft, phone })} /></label><label>Tanışma yeri <span className="optional">isteğe bağlı</span><SpInput placeholder="Örn. Urla açık ev etkinliği" value={quickContactDraft.metAtPlace} onChange={(event) => setQuickContactDraft({ ...quickContactDraft, metAtPlace: event.target.value })} /></label><div className="form-row"><label>Kaynak<SpSelect value={quickContactDraft.source} onChange={(event) => setQuickContactDraft({ ...quickContactDraft, source: event.target.value as ContactDraft["source"] })}>{contactSources.map((item) => <option key={item} value={item}>{contactSourceLabels[item]}</option>)}</SpSelect></label><label>Rol<SpSelect value={quickContactDraft.role} onChange={(event) => setQuickContactDraft({ ...quickContactDraft, role: event.target.value as ContactDraft["role"] })}>{contactRoles.map((item) => <option key={item} value={item}>{contactRoleLabels[item]}</option>)}</SpSelect></label></div><details className="form-details"><summary>İlk takibi planla · isteğe bağlı</summary><div className="form-row"><label>Aksiyon<SpSelect value={quickContactDraft.nextActionType ?? ""} onChange={(event) => setQuickContactDraft({ ...quickContactDraft, nextActionType: (event.target.value || null) as ContactDraft["nextActionType"], nextActionAt: event.target.value ? quickContactDraft.nextActionAt ?? null : null })}><option value="">Henüz yok</option>{nextActionTypes.map((type) => <option key={type} value={type}>{nextActionTypeLabels[type]}</option>)}</SpSelect></label><QuickDateField disabled={!quickContactDraft.nextActionType} required={Boolean(quickContactDraft.nextActionType)} value={quickContactDraft.nextActionAt ? new Date(new Date(quickContactDraft.nextActionAt).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ""} onChange={(value) => setQuickContactDraft({ ...quickContactDraft, nextActionAt: value ? new Date(value).getTime() : null })} /></div></details>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="primary-action auth-submit" disabled={contactPending} type="submit">{contactPending ? "Kişi hazırlanıyor…" : "Kişiyi ekle ve görüşmeye dön"}</button></form></section></div> : null;

  if (contactsQuery.isPending) return <AppShell><div className="content-state">Kişiler yükleniyor…</div></AppShell>;
  if (contactsQuery.error) return <AppShell><p className="form-error notice" role="alert">{messageFrom(contactsQuery.error)}</p></AppShell>;
  if (contacts.length === 0) {
    return <AppShell><header className="page-header"><p className="eyebrow">HIZLI KAYIT</p><h1>Temas kaydet</h1></header><SpCard className="empty-state"><div className="card-icon secondary"><ContactRound size={20} aria-hidden /></div><h2>İlk kişiyi burada ekle</h2><p>Kişiler ekranına gitmeden, kişiyi oluşturup görüşme kaydına devam edebilirsiniz.</p><button className="primary-action inline-action" onClick={() => setQuickContactOpen(true)} type="button"><UserPlus size={17} /> Yeni kişi ekle</button></SpCard>{quickContactSheet}</AppShell>;
  }

  return (
    <AppShell>
      <header className="page-header contacts-header capture-header"><div><p className="eyebrow">HIZLI KAYIT</p><h1>Temas kaydet</h1><p className="context-sentence">Görüşme sonucunu ve kabul edilmiş sonraki adımı kısa biçimde kapat.</p></div><button className="secondary-action inline-action" onClick={() => { setError(null); setQuickContactOpen(true); }} type="button"><UserPlus size={17} /> Yeni kişi</button></header>
      <div className="capture-mode-tabs" role="tablist" aria-label="Kayıt yöntemi"><button className={captureMode === "voice" ? "selected" : ""} role="tab" aria-selected={captureMode === "voice"} onClick={() => changeCaptureMode("voice")} type="button">Sesli anlat</button><button className={captureMode === "manual" ? "selected" : ""} role="tab" aria-selected={captureMode === "manual"} onClick={() => changeCaptureMode("manual")} type="button">Manuel yaz</button></div>
      {captureMode === "voice" ? <VoiceCaptureCard key={selectedContactId} session={session!} contacts={contacts} initialContactId={selectedContactId} onSaved={async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
          queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
        ]);
      }} /> : saved ? (
        <SpCard className="success-state"><div className="success-icon"><Check size={24} aria-hidden /></div><p className="eyebrow">{queuedOffline ? "CİHAZDA GÜVENDE" : "KAYDEDİLDİ"}</p><h2>{queuedOffline ? `${selectedContactName} için temas gönderilmeyi bekliyor` : `${selectedContactName} için temas kaydedildi`}</h2><p><strong>Sonuç:</strong> {outcome}</p>{nextActionType ? <p><strong>Sonraki adım:</strong> {nextActionTypeLabels[nextActionType]}{nextActionAt ? ` · ${new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(nextActionAt))}` : ""}</p> : <p>Sonraki adım planlanmadı.</p>}<p>{queuedOffline ? "Bağlantı geldiğinde aynı kişi ve sonuçla otomatik gönderilecek." : "Kişi ve takip bilgisini kontrol ettin; günlük plan güncellendi."}</p>{!queuedOffline && suggestedOpportunityType ? <div className="capture-opportunity-prompt"><div><strong>{opportunityTypeLabels[suggestedOpportunityType]}</strong><span>{availableOpportunityId ? existingOpportunity && !createdOpportunityId ? "Bu kişi için açık fırsat zaten var." : "Görüşmedeki takip bilgileriyle fırsat oluşturuldu." : nextActionType && nextActionAt ? "Rol, aksiyon ve tarih hazır; tekrar doldurmadan fırsata dönüştür." : "Fırsat için sonraki aksiyon ve tarihi tamamla."}</span></div>{availableOpportunityId ? <Link className="primary-action inline-link" href={`/opportunities?opportunityId=${encodeURIComponent(availableOpportunityId)}`}>Fırsatı görüntüle</Link> : nextActionType && nextActionAt ? <button className="primary-action inline-action" disabled={opportunityPending || opportunitiesQuery.isPending} type="button" onClick={() => void createOpportunityFromInteraction()}>{opportunityPending ? "Fırsat açılıyor…" : opportunitiesQuery.isPending ? "Açık fırsat kontrol ediliyor…" : `Fırsat aç: ${opportunityTypeLabels[suggestedOpportunityType]}`}</button> : <Link className="primary-action inline-link" href={`/opportunities?create=1&contactId=${encodeURIComponent(selectedContactId)}`}>Fırsat ayrıntılarını tamamla</Link>}</div> : null}{opportunityError ? <p className="form-error" role="alert">{opportunityError}</p> : null}<div className="capture-actions"><button className="secondary-action" type="button" onClick={() => router.push("/")}>Bugün ekranına dön</button>{!queuedOffline ? <Link className="secondary-action inline-link" href={`/listings?action=add-listing&ownerContactId=${encodeURIComponent(selectedContactId)}`}>Yetkili portföy ekle</Link> : null}<button className="secondary-action" disabled={opportunityPending} type="button" onClick={resetManualInteraction}>Yeni kişi için temas kaydet</button></div></SpCard>
      ) : (
        <form className="capture-form" onSubmit={submit}>
          <SpCard className="form-section"><div className="section-heading compact"><div><p className="eyebrow">1 · KİM</p><h2>Görüşülen kişi</h2></div></div><div className="form-row"><ContactCombobox contacts={contacts} value={selectedContactId} onChange={(value) => { setContactId(value); setNextActionTouched(false); setNextActionType(null); setNextActionAt(""); }} /><label>Kanal<SpSelect value={channel} onChange={(event) => setChannel(event.target.value as ManualInteractionDraft["channel"])}>{interactionChannels.map((item) => <option key={item} value={item}>{interactionChannelLabels[item]}</option>)}</SpSelect></label></div></SpCard>
          <SpCard className="form-section"><p className="eyebrow">2 · NE OLDU</p><h2>Görüşme sonucu</h2><label>Kısa sonuç<SpTextarea value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="Örn. Salı günü satış planını konuşacağız." required /></label><details className="form-details"><summary>İsteğe bağlı ayrıntılar</summary><div className="form-stack"><label>Görüşme amacı<SpSelect value={objective} onChange={(event) => setObjective(event.target.value as ManualInteractionDraft["objective"])}>{interactionObjectives.map((item) => <option key={item} value={item}>{interactionObjectiveLabels[item]}</option>)}</SpSelect></label><label>Yön<SpSelect value={direction} onChange={(event) => setDirection(event.target.value as ManualInteractionDraft["direction"])}>{interactionDirections.map((item) => <option key={item} value={item}>{interactionDirectionLabels[item]}</option>)}</SpSelect></label><QuickDateField past required={false} label="Görüşme ne zaman oldu" value={occurredAt} onChange={setOccurredAt} /><label>Talep sonucu<SpSelect value={askOutcome} onChange={(event) => setAskOutcome(event.target.value as ManualInteractionDraft["askOutcome"])}>{askOutcomes.map((item) => <option key={item} value={item}>{askOutcomeLabels[item]}</option>)}</SpSelect></label><label>Ek not<SpTextarea value={noteSummary} onChange={(event) => setNoteSummary(event.target.value)} /></label></div></details></SpCard>
          <SpCard className="form-section"><p className="eyebrow">3 · SONRAKİ ADIM</p><h2>Takibi planla</h2>{selectedContact?.relationship.nextActionAt && !nextActionTouched ? <p className="privacy-hint">Kişideki mevcut takip getirildi; değiştirirsen yeni görüşme sonucu bunun yerini alır.</p> : null}<div className="form-row"><label>Aksiyon<SpSelect value={nextActionType ?? ""} onChange={(event) => { const value = (event.target.value || null) as ManualInteractionDraft["nextActionType"]; setNextActionTouched(true); setNextActionType(value); if (!value) setNextActionAt(""); }}><option value="">Henüz yok</option>{nextActionTypes.map((item) => <option key={item} value={item}>{nextActionTypeLabels[item]}</option>)}</SpSelect></label><QuickDateField disabled={!nextActionType} label="Tarih · saat isteğe göre değiştirilebilir" required={Boolean(nextActionType)} value={nextActionAt} onChange={(value) => { setNextActionTouched(true); setNextActionAt(value); }} /></div><SpInput name="nextActionAt" type="hidden" value={nextActionAt} /></SpCard>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="capture-actions"><span className="privacy-copy">Yalnız gerekli iş sonucunu kaydedin.</span><button className="primary-action inline-action" disabled={pending || !selectedContactId} type="submit"><Save size={18} aria-hidden /> {pending ? "Kaydediliyor…" : selectedContact ? `${selectedContactName} için kaydet` : "Teması kaydet"}</button></div>
        </form>
      )}
      {quickContactSheet}
    </AppShell>
  );
}
