"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ContactRound, Mic, Save } from "lucide-react";
import {
  apiQueryKeys,
  askOutcomeLabels,
  askOutcomes,
  interactionChannelLabels,
  interactionChannels,
  interactionObjectiveLabels,
  interactionObjectives,
  manualInteractionSchema,
  nextActionTypeLabels,
  nextActionTypes,
  type ManualInteractionDraft,
} from "@spherepath/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth/resources/session";
import { listContacts } from "@/features/contacts/resources/contacts";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { saveManualInteraction } from "../resources/interactions";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Temas kaydedilemedi.";
}

export function CaptureView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [contactId, setContactId] = useState("");
  const [channel, setChannel] = useState<ManualInteractionDraft["channel"]>("in_person");
  const [objective, setObjective] = useState<ManualInteractionDraft["objective"]>("get_acquainted");
  const [direction, setDirection] = useState<ManualInteractionDraft["direction"]>("mutual");
  const [outcome, setOutcome] = useState("");
  const [askOutcome, setAskOutcome] = useState<ManualInteractionDraft["askOutcome"]>("not_asked");
  const [nextActionType, setNextActionType] = useState<ManualInteractionDraft["nextActionType"]>(null);
  const [nextActionAt, setNextActionAt] = useState("");
  const [noteSummary, setNoteSummary] = useState("");

  const contactsQuery = useQuery({
    queryKey: apiQueryKeys.contacts,
    queryFn: listContacts,
    enabled: Boolean(session),
  });
  const contacts = contactsQuery.data ?? [];
  const selectedContactId = contactId || contacts[0]?.id || "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const raw = {
      contactId: selectedContactId,
      channel,
      objective,
      direction,
      outcome,
      askOutcome,
      nextActionType,
      nextActionAt: nextActionAt ? new Date(nextActionAt).getTime() : null,
      noteSummary,
    };
    const parsed = manualInteractionSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Temas bilgilerini kontrol et.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await saveManualInteraction(session, parsed.data);
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

  if (contactsQuery.isPending) return <AppShell><div className="content-state">Kişiler yükleniyor…</div></AppShell>;
  if (contactsQuery.error) return <AppShell><p className="form-error notice" role="alert">{messageFrom(contactsQuery.error)}</p></AppShell>;
  if (contacts.length === 0) {
    return <AppShell><header className="page-header"><p className="eyebrow">HIZLI KAYIT</p><h1>Temas kaydet</h1></header><SpCard className="empty-state"><ContactRound size={24} aria-hidden /><h2>Önce bir kişi ekle</h2><p>Temas kaydı mevcut bir kişiyle ilişkilendirilir.</p><Link className="secondary-action inline-link" href="/contacts">Kişilere git</Link></SpCard></AppShell>;
  }

  return (
    <AppShell>
      <header className="page-header capture-header"><p className="eyebrow">HIZLI KAYIT</p><h1>Temas kaydet</h1><p className="context-sentence">Görüşme sonucunu ve kabul edilmiş sonraki adımı kısa biçimde kapat.</p></header>
      {saved ? (
        <SpCard className="success-state"><div className="success-icon"><Check size={24} aria-hidden /></div><p className="eyebrow">KAYDEDİLDİ</p><h2>Temas ve sonraki aksiyon hazır</h2><p>Bugün ekranındaki ilişki görünümü birkaç saniye içinde güncellenecek.</p><button className="primary-action" type="button" onClick={() => router.push("/")}>Bugün ekranına dön</button></SpCard>
      ) : (
        <form className="capture-form" onSubmit={submit}>
          <SpCard className="form-section"><div className="section-heading compact"><div><p className="eyebrow">1 · KİM VE NASIL</p><h2>Temas bağlamı</h2></div></div><div className="form-row"><label>Kişi<select value={selectedContactId} onChange={(event) => setContactId(event.target.value)}>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName ?? contact.label}</option>)}</select></label><label>Kanal<select value={channel} onChange={(event) => setChannel(event.target.value as ManualInteractionDraft["channel"])}>{interactionChannels.map((item) => <option key={item} value={item}>{interactionChannelLabels[item]}</option>)}</select></label></div><label>Görüşme amacı<select value={objective} onChange={(event) => setObjective(event.target.value as ManualInteractionDraft["objective"])}>{interactionObjectives.map((item) => <option key={item} value={item}>{interactionObjectiveLabels[item]}</option>)}</select></label><label>Yön<select value={direction} onChange={(event) => setDirection(event.target.value as ManualInteractionDraft["direction"])}><option value="mutual">Karşılıklı</option><option value="outbound">Giden</option><option value="inbound">Gelen</option></select></label></SpCard>
          <SpCard className="form-section"><p className="eyebrow">2 · NE OLDU</p><h2>Sonuç</h2><label>Kısa sonuç<textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="Örn. Satış planını konuşmak için salı günü buluşacağız." required /></label><label>Talep sonucu<select value={askOutcome} onChange={(event) => setAskOutcome(event.target.value as ManualInteractionDraft["askOutcome"])}>{askOutcomes.map((item) => <option key={item} value={item}>{askOutcomeLabels[item]}</option>)}</select></label><label>Ek not <span className="optional">isteğe bağlı</span><textarea value={noteSummary} onChange={(event) => setNoteSummary(event.target.value)} /></label></SpCard>
          <SpCard className="form-section"><p className="eyebrow">3 · SONRAKİ ADIM</p><h2>Takibi kapat</h2><div className="form-row"><label>Aksiyon<select value={nextActionType ?? ""} onChange={(event) => setNextActionType((event.target.value || null) as ManualInteractionDraft["nextActionType"])}><option value="">Henüz yok</option>{nextActionTypes.map((item) => <option key={item} value={item}>{nextActionTypeLabels[item]}</option>)}</select></label><label>Tarih ve saat<input type="datetime-local" disabled={!nextActionType} value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} /></label></div></SpCard>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="capture-actions"><div className="voice-later"><Mic size={17} aria-hidden /> Sesli not sonraki adımda eklenecek</div><button className="primary-action inline-action" disabled={pending} type="submit"><Save size={18} aria-hidden /> {pending ? "Kaydediliyor…" : "Teması kaydet"}</button></div>
        </form>
      )}
    </AppShell>
  );
}
