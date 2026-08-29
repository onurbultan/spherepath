"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, Clock3, Plus, RefreshCw, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiQueryKeys,
  nextActionTypeLabels,
  nextActionTypes,
  nextOpportunityStages,
  opportunityDraftSchema,
  opportunityStageLabels,
  opportunityTransitionSchema,
  opportunityTypeLabels,
  opportunityTypes,
  propertyTypeLabels,
  type NextActionType,
  type OpportunityStage,
  type OpportunityType,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listContacts } from "@/features/contacts/resources/contacts";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { getOpportunityDetail, listOpportunities, moveOpportunity, saveOpportunity, type OpportunityRecord } from "../resources/opportunities";

function localDateTime(days = 1): string {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setMinutes(0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Fırsat işlemi tamamlanamadı.";
}

const dateTime = (value: number) => new Intl.DateTimeFormat("tr-TR", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(value);

function budgetLabel(memory: OpportunityRecord["subjectContactMemory"]): string | null {
  const budget = memory.propertyPreferences.budgetRange;
  if (!budget) return null;
  const formatter = new Intl.NumberFormat("tr-TR", { style: "currency", currency: budget.currency, maximumFractionDigits: 0 });
  if (budget.min !== null && budget.max !== null) return `${formatter.format(budget.min)} – ${formatter.format(budget.max)}`;
  if (budget.min !== null) return `${formatter.format(budget.min)} ve üzeri`;
  return budget.max !== null ? `${formatter.format(budget.max)} ve altı` : null;
}

function opportunityHighlights(opportunity: OpportunityRecord): string[] {
  const memory = opportunity.subjectContactMemory;
  const preferences = memory.propertyPreferences;
  const highlights = [
    preferences.propertyTypes.length ? preferences.propertyTypes.map((item) => propertyTypeLabels[item]).join(", ") : null,
    preferences.preferredLocations.length ? preferences.preferredLocations.join(", ") : null,
    budgetLabel(memory),
    preferences.areaMinM2 !== null ? `En az ${preferences.areaMinM2} m²` : null,
    preferences.mustHaves[0] ? `Olmazsa olmaz: ${preferences.mustHaves[0]}` : null,
    preferences.timeline,
  ].filter((item): item is string => Boolean(item));
  return highlights.length ? highlights.slice(0, 4) : memory.keyThingsToRemember.slice(0, 2);
}

export function OpportunitiesView() {
  const searchParams = useSearchParams();
  const [referenceTime] = useState(Date.now);
  const { session } = useSession();
  const queryClient = useQueryClient();
  const opportunitiesQuery = useQuery({ queryKey: apiQueryKeys.opportunities, queryFn: listOpportunities });
  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts });
  const opportunities = opportunitiesQuery.data ?? [];
  const contacts = contactsQuery.data ?? [];
  const [createOpen, setCreateOpen] = useState(false);
  const [moving, setMoving] = useState<OpportunityRecord | null>(null);
  const [selected, setSelected] = useState<OpportunityRecord | null>(null);
  const [dismissedDeepLink, setDismissedDeepLink] = useState<string | null>(null);
  const requestedOpportunityId = searchParams.get("opportunityId");
  const linkedOpportunity = requestedOpportunityId && dismissedDeepLink !== requestedOpportunityId
    ? opportunities.find((opportunity) => opportunity.id === requestedOpportunityId) ?? null
    : null;
  const activeSelected = selected ?? linkedOpportunity;
  const detailQuery = useQuery({
    queryKey: apiQueryKeys.opportunityDetail(activeSelected?.id ?? "none"),
    queryFn: () => getOpportunityDetail(activeSelected!.id),
    enabled: Boolean(activeSelected),
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactId, setContactId] = useState("");
  const [type, setType] = useState<OpportunityType>("seller_listing");
  const [actionType, setActionType] = useState<NextActionType>("call");
  const [actionAt, setActionAt] = useState(localDateTime());
  const [targetStage, setTargetStage] = useState<OpportunityStage>("first_contact");
  const [reason, setReason] = useState("");
  const [lostReason, setLostReason] = useState("");

  const selectedContactId = contactId || contacts[0]?.id || "";

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunities }),
      queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ...(moving ? [queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunityDetail(moving.id) })] : []),
    ]);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const submitted = new FormData(event.currentTarget);
    const submittedActionAt = String(submitted.get("nextActionAt") ?? actionAt);
    const parsed = opportunityDraftSchema.safeParse({ subjectContactId: selectedContactId, type, nextActionType: actionType, nextActionAt: new Date(submittedActionAt).getTime() });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Fırsat bilgilerini kontrol et.");
    setPending(true); setError(null);
    try { await saveOpportunity(session, parsed.data); setCreateOpen(false); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  function openMove(opportunity: OpportunityRecord) {
    const next = nextOpportunityStages(opportunity.stage)[0];
    if (!next) return;
    setMoving(opportunity); setTargetStage(next); setActionType("call"); setActionAt(localDateTime()); setReason(""); setLostReason(""); setError(null);
  }

  async function move(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !moving) return;
    const terminal = targetStage === "won" || targetStage === "lost";
    const submitted = new FormData(event.currentTarget);
    const submittedActionAt = String(submitted.get("nextActionAt") ?? actionAt);
    const parsed = opportunityTransitionSchema.safeParse({
      opportunityId: moving.id,
      toStage: targetStage,
      reason: reason.trim() || null,
      lostReason: targetStage === "lost" ? lostReason.trim() || null : null,
      nextActionType: terminal ? null : actionType,
      nextActionAt: terminal ? null : new Date(submittedActionAt).getTime(),
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Aşama bilgilerini kontrol et.");
    setPending(true); setError(null);
    try { await moveOpportunity(session, parsed.data); setMoving(null); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  return <AppShell>
    <header className="page-header contacts-header"><div><p className="eyebrow">PORTFÖY ÜRETİMİ</p><h1>Fırsatlar</h1><p className="context-sentence">Her lead’i net bir aşama ve kabul edilmiş sonraki aksiyonla ilerlet.</p></div><button className="primary-action inline-action" disabled={!contacts.length} onClick={() => { setCreateOpen(true); setError(null); }} type="button"><Plus size={18} /> Yeni fırsat</button></header>
    {error && !createOpen && !moving ? <p className="form-error notice">{error}</p> : null}
    {opportunitiesQuery.isPending ? <div className="content-state"><RefreshCw className="spin" size={22} /> Fırsatlar yükleniyor…</div> : opportunitiesQuery.error ? <p className="form-error notice">{messageFrom(opportunitiesQuery.error)}</p> : opportunities.length === 0 ? <SpCard className="empty-state"><div className="card-icon secondary"><BriefcaseBusiness size={20} /></div><h2>İlk fırsatını oluştur</h2><p>Kayıtlı bir kişiyi lead’e dönüştür ve sıradaki gerçek aksiyonu belirle.</p>{contacts.length ? <button className="secondary-action" onClick={() => setCreateOpen(true)} type="button">Fırsat oluştur</button> : <p>Önce bir kişi eklemelisin.</p>}</SpCard> : <section className="opportunity-grid" aria-label="Fırsatlar">{opportunities.map((opportunity) => {
      const highlights = opportunityHighlights(opportunity);
      return <SpCard key={opportunity.id} className="opportunity-card"><div className="opportunity-top"><span className={`stage-badge stage-${opportunity.stage}`}>{opportunityStageLabels[opportunity.stage]}</span><span>{opportunityTypeLabels[opportunity.type]}</span></div><h2>{opportunity.subjectContactName}</h2>{highlights.length ? <div className="opportunity-highlights">{highlights.map((highlight) => <span key={highlight}>{highlight}</span>)}</div> : <p className="opportunity-context-missing">Talep ayrıntısı henüz eklenmedi.</p>}<p>{opportunity.nextActionAt ? `${opportunity.nextActionType ? nextActionTypeLabels[opportunity.nextActionType] : "Sonraki aksiyon"} · ${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(opportunity.nextActionAt)}` : "Fırsat kapandı"}</p><div className="opportunity-actions"><button className="secondary-action inline-action" onClick={() => setSelected(opportunity)} type="button"><Clock3 size={16} /> Detay ve geçmiş</button>{nextOpportunityStages(opportunity.stage).length ? <button className="secondary-action inline-action" onClick={() => openMove(opportunity)} type="button">Aşamayı ilerlet <ArrowRight size={16} /></button> : null}</div></SpCard>;
    })}</section>}

    {activeSelected ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) { setSelected(null); if (requestedOpportunityId) setDismissedDeepLink(requestedOpportunityId); } }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">FIRSAT DETAYI</p><h2>{activeSelected.subjectContactName}</h2></div><button className="icon-action" aria-label="Kapat" onClick={() => { setSelected(null); if (requestedOpportunityId) setDismissedDeepLink(requestedOpportunityId); }} type="button"><X size={20} /></button></div>{detailQuery.isPending ? <div className="content-state"><RefreshCw className="spin" size={20} /> Detay yükleniyor…</div> : detailQuery.error ? <p className="form-error">{messageFrom(detailQuery.error)}</p> : <><div className="detail-summary"><span className={`stage-badge stage-${activeSelected.stage}`}>{opportunityStageLabels[activeSelected.stage]}</span><p>Bu aşamada {Math.max(0, Math.floor((referenceTime - activeSelected.stageEnteredAt) / 86_400_000))} gündür.</p>{opportunityHighlights(detailQuery.data?.opportunity ?? activeSelected).length ? <div className="opportunity-highlights">{opportunityHighlights(detailQuery.data?.opportunity ?? activeSelected).map((highlight) => <span key={highlight}>{highlight}</span>)}</div> : null}</div><ol className="stage-timeline">{detailQuery.data?.stageEvents.map((stageEvent) => <li key={stageEvent.id}><div className="timeline-dot" /><div><strong>{opportunityStageLabels[stageEvent.toStage as OpportunityStage] ?? stageEvent.toStage}</strong><time>{dateTime(stageEvent.occurredAt)}</time>{stageEvent.reason ? <p>{stageEvent.reason}</p> : null}</div></li>)}</ol></>}</section></div> : null}

    {createOpen ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setCreateOpen(false); }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">YENİ LEAD</p><h2>Fırsat oluştur</h2></div><button className="icon-action" aria-label="Kapat" onClick={() => setCreateOpen(false)} type="button"><X size={20} /></button></div><form className="form-stack" onSubmit={create}><label>Kişi<select value={selectedContactId} onChange={(event) => setContactId(event.target.value)}>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName ?? contact.label}</option>)}</select></label><label>Fırsat türü<select value={type} onChange={(event) => setType(event.target.value as OpportunityType)}>{opportunityTypes.map((item) => <option key={item} value={item}>{opportunityTypeLabels[item]}</option>)}</select></label><div className="form-row"><label>Sonraki aksiyon<select value={actionType} onChange={(event) => setActionType(event.target.value as NextActionType)}>{nextActionTypes.map((item) => <option key={item} value={item}>{nextActionTypeLabels[item]}</option>)}</select></label><label>Tarih ve saat<input name="nextActionAt" required type="datetime-local" value={actionAt} onChange={(event) => setActionAt(event.target.value)} /></label></div>{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Oluşturuluyor…" : "Fırsatı oluştur"}</button></form></section></div> : null}

    {moving ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setMoving(null); }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">AŞAMA GEÇİŞİ</p><h2>{moving.subjectContactName}</h2></div><button className="icon-action" aria-label="Kapat" onClick={() => setMoving(null)} type="button"><X size={20} /></button></div><form className="form-stack" onSubmit={move}><label>Yeni aşama<select value={targetStage} onChange={(event) => setTargetStage(event.target.value as OpportunityStage)}>{nextOpportunityStages(moving.stage).map((stage) => <option key={stage} value={stage}>{opportunityStageLabels[stage]}</option>)}</select></label><label>Geçiş notu <span className="optional">isteğe bağlı</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>{targetStage === "lost" ? <label>Kayıp nedeni<textarea required value={lostReason} onChange={(event) => setLostReason(event.target.value)} /></label> : targetStage !== "won" ? <div className="form-row"><label>Sonraki aksiyon<select value={actionType} onChange={(event) => setActionType(event.target.value as NextActionType)}>{nextActionTypes.map((item) => <option key={item} value={item}>{nextActionTypeLabels[item]}</option>)}</select></label><label>Tarih ve saat<input name="nextActionAt" required type="datetime-local" value={actionAt} onChange={(event) => setActionAt(event.target.value)} /></label></div> : null}{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "İlerletiliyor…" : "Aşamayı kaydet"}</button></form></section></div> : null}
  </AppShell>;
}
