"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, LayoutGrid, List, Plus, RefreshCw, Search, X } from "lucide-react";
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
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
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

const activeStages: OpportunityStage[] = ["new_lead", "first_contact", "appointment", "valuation", "mandate_offer"];

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
  const [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<OpportunityType | "all">("all");

  const selectedContactId = contactId || contacts[0]?.id || "";
  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");
  const visibleOpportunities = opportunities.filter((opportunity) => {
    if (typeFilter !== "all" && opportunity.type !== typeFilter) return false;
    if (!normalizedSearch) return true;
    return [opportunity.subjectContactName, opportunityTypeLabels[opportunity.type], ...opportunityHighlights(opportunity)].some((value) => value.toLocaleLowerCase("tr-TR").includes(normalizedSearch));
  });
  const openOpportunities = visibleOpportunities.filter((item) => activeStages.includes(item.stage));
  const nextOpportunity = [...openOpportunities].sort((left, right) => {
    if (left.nextActionAt === null && right.nextActionAt !== null) return -1;
    if (left.nextActionAt !== null && right.nextActionAt === null) return 1;
    if (left.nextActionAt !== right.nextActionAt) return (left.nextActionAt ?? 0) - (right.nextActionAt ?? 0);
    return left.stageEnteredAt - right.stageEnteredAt;
  })[0];
  const missingActionCount = opportunities.filter((item) => activeStages.includes(item.stage) && item.nextActionAt === null).length;
  const overdueCount = opportunities.filter((item) => activeStages.includes(item.stage) && item.nextActionAt !== null && item.nextActionAt < referenceTime).length;
  const averageStageDays = openOpportunities.length ? openOpportunities.reduce((sum, item) => sum + Math.max(0, Math.floor((referenceTime - item.stageEnteredAt) / 86_400_000)), 0) / openOpportunities.length : 0;

  function closeDetail() {
    setSelected(null);
    if (requestedOpportunityId) setDismissedDeepLink(requestedOpportunityId);
  }
  useSheetDismiss(Boolean(activeSelected), closeDetail);
  useSheetDismiss(createOpen, () => setCreateOpen(false));
  useSheetDismiss(Boolean(moving), () => setMoving(null));

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
    <header className="page-header contacts-header"><div><p className="eyebrow">PORTFÖY ÜRETİMİ</p><h1>Fırsatlar</h1><p className="context-sentence">Her lead’i net bir aşama ve kabul edilmiş sonraki aksiyonla ilerlet. Aşama geçişleri sunucuda doğrulanır.</p></div><div className="header-actions"><div className="segmented-control"><button className={view === "board" ? "selected" : ""} onClick={() => setView("board")} type="button"><LayoutGrid size={13} /> Pano</button><button className={view === "list" ? "selected" : ""} onClick={() => setView("list")} type="button"><List size={13} /> Liste</button></div><button className="secondary-action inline-action" disabled={!nextOpportunity} onClick={() => nextOpportunity && openMove(nextOpportunity)} type="button">Sıradakini ilerlet <ArrowRight size={15} /></button><button className="primary-action inline-action" disabled={!contacts.length} onClick={() => { setCreateOpen(true); setError(null); }} type="button"><Plus size={18} /> Yeni fırsat</button></div></header>
    {error && !createOpen && !moving ? <p className="form-error notice">{error}</p> : null}
    {opportunities.length ? <><div className="opportunity-insights"><span className={missingActionCount ? "warning" : ""}>{missingActionCount} fırsatta sonraki aksiyon yok</span><span className={overdueCount ? "danger" : ""}>{overdueCount} aksiyon gecikti</span><span>Aşamada ortalama <strong>{averageStageDays.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} gün</strong></span><span className="opportunity-outcomes">Kazanıldı · {opportunities.filter((item) => item.stage === "won").length}</span><span>Kaybedildi · {opportunities.filter((item) => item.stage === "lost").length}</span></div><div className="opportunity-filterbar"><label className="contact-search"><Search size={16} aria-hidden /><input aria-label="Fırsatlarda ara" placeholder="Kişi, bölge veya talep ara" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label><span className="sr-only">Fırsat türü</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as OpportunityType | "all")}><option value="all">Tüm fırsat türleri</option>{opportunityTypes.map((item) => <option key={item} value={item}>{opportunityTypeLabels[item]}</option>)}</select></label><strong>{openOpportunities.length} açık fırsat</strong></div></> : null}
    {opportunitiesQuery.isPending ? <div className="content-state"><RefreshCw className="spin" size={22} /> Fırsatlar yükleniyor…</div> : opportunitiesQuery.error ? <p className="form-error notice">{messageFrom(opportunitiesQuery.error)}</p> : opportunities.length === 0 ? <SpCard className="empty-state"><div className="card-icon secondary"><BriefcaseBusiness size={20} /></div><h2>İlk fırsatını oluştur</h2><p>Kayıtlı bir kişiyi lead’e dönüştür ve sıradaki gerçek aksiyonu belirle.</p>{contacts.length ? <button className="secondary-action" onClick={() => setCreateOpen(true)} type="button">Fırsat oluştur</button> : <p>Önce bir kişi eklemelisin.</p>}</SpCard> : openOpportunities.length === 0 ? <SpCard className="empty-state"><Search size={20} /><h2>Eşleşen açık fırsat yok</h2><p>Arama veya tür filtresini değiştirin.</p></SpCard> : view === "board" ? <section className="opportunity-board" aria-label="Fırsat panosu">{activeStages.map((stage) => {
      const items = openOpportunities.filter((item) => item.stage === stage);
      return <div className="opportunity-column" key={stage}><div className="opportunity-column-heading"><span>{opportunityStageLabels[stage]}</span><strong>{items.length}</strong></div><div className="opportunity-column-list">{items.map((opportunity) => <button className="kanban-card" key={opportunity.id} onClick={() => setSelected(opportunity)} type="button"><span>{opportunityTypeLabels[opportunity.type]}</span><strong>{opportunity.subjectContactName}</strong><small className={!opportunity.nextActionAt ? "missing" : opportunity.nextActionAt < referenceTime ? "overdue" : ""}>{opportunity.nextActionAt ? `${opportunity.nextActionType ? nextActionTypeLabels[opportunity.nextActionType] : "Sonraki aksiyon"} · ${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(opportunity.nextActionAt)}` : "Sonraki aksiyon yok"}</small><em>{Math.max(0, Math.floor((referenceTime - opportunity.stageEnteredAt) / 86_400_000))} gündür bu aşamada</em></button>)}{items.length === 0 ? <div className="kanban-empty">Bu aşamada fırsat yok</div> : null}</div></div>;
    })}</section> : <section className="opportunity-list-table"><div className="opportunity-list-head"><span>Kişi</span><span>Tür</span><span>Aşama</span><span>Sonraki aksiyon</span><span>Aşama süresi</span></div>{openOpportunities.map((opportunity) => <button key={opportunity.id} onClick={() => setSelected(opportunity)} type="button"><strong>{opportunity.subjectContactName}</strong><span>{opportunityTypeLabels[opportunity.type]}</span><span className={`stage-badge stage-${opportunity.stage}`}>{opportunityStageLabels[opportunity.stage]}</span><span>{opportunity.nextActionAt ? `${opportunity.nextActionType ? nextActionTypeLabels[opportunity.nextActionType] : "Aksiyon"} · ${dateTime(opportunity.nextActionAt)}` : "Sonraki aksiyon yok"}</span><span>{Math.max(0, Math.floor((referenceTime - opportunity.stageEnteredAt) / 86_400_000))} gün</span></button>)}</section>}

    {activeSelected ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDetail(); }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">FIRSAT DETAYI</p><h2>{activeSelected.subjectContactName}</h2></div><button className="icon-action" aria-label="Kapat" onClick={closeDetail} type="button"><X size={20} /></button></div>{detailQuery.isPending ? <div className="content-state"><RefreshCw className="spin" size={20} /> Detay yükleniyor…</div> : detailQuery.error ? <p className="form-error">{messageFrom(detailQuery.error)}</p> : <><div className="detail-summary"><span className={`stage-badge stage-${activeSelected.stage}`}>{opportunityStageLabels[activeSelected.stage]}</span><p>Bu aşamada {Math.max(0, Math.floor((referenceTime - activeSelected.stageEnteredAt) / 86_400_000))} gündür.</p>{opportunityHighlights(detailQuery.data?.opportunity ?? activeSelected).length ? <div className="opportunity-highlights">{opportunityHighlights(detailQuery.data?.opportunity ?? activeSelected).map((highlight) => <span key={highlight}>{highlight}</span>)}</div> : null}</div><ol className="stage-timeline">{detailQuery.data?.stageEvents.map((stageEvent) => <li key={stageEvent.id}><div className="timeline-dot" /><div><strong>{opportunityStageLabels[stageEvent.toStage as OpportunityStage] ?? stageEvent.toStage}</strong><time>{dateTime(stageEvent.occurredAt)}</time>{stageEvent.reason ? <p>{stageEvent.reason}</p> : null}</div></li>)}</ol><div className="opportunity-detail-actions"><Link className="secondary-action inline-link" href={`/capture?contactId=${encodeURIComponent(activeSelected.subjectContactId)}`}>Teması kaydet</Link>{nextOpportunityStages(activeSelected.stage).length ? <button className="primary-action inline-action" onClick={() => { openMove(activeSelected); closeDetail(); }} type="button">Aşamayı ilerlet <ArrowRight size={15} /></button> : null}</div></>}</section></div> : null}

    {createOpen ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setCreateOpen(false); }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">YENİ LEAD</p><h2>Fırsat oluştur</h2></div><button className="icon-action" aria-label="Kapat" onClick={() => setCreateOpen(false)} type="button"><X size={20} /></button></div><form className="form-stack" onSubmit={create}><label>Kişi<select value={selectedContactId} onChange={(event) => setContactId(event.target.value)}>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName ?? contact.label}</option>)}</select></label><label>Fırsat türü<select value={type} onChange={(event) => setType(event.target.value as OpportunityType)}>{opportunityTypes.map((item) => <option key={item} value={item}>{opportunityTypeLabels[item]}</option>)}</select></label><div className="form-row"><label>Sonraki aksiyon<select value={actionType} onChange={(event) => setActionType(event.target.value as NextActionType)}>{nextActionTypes.map((item) => <option key={item} value={item}>{nextActionTypeLabels[item]}</option>)}</select></label><label>Tarih ve saat<input name="nextActionAt" required type="datetime-local" value={actionAt} onChange={(event) => setActionAt(event.target.value)} /></label></div>{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Oluşturuluyor…" : "Fırsatı oluştur"}</button></form></section></div> : null}

    {moving ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setMoving(null); }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">AŞAMA GEÇİŞİ</p><h2>{moving.subjectContactName}</h2></div><button className="icon-action" aria-label="Kapat" onClick={() => setMoving(null)} type="button"><X size={20} /></button></div><form className="form-stack" onSubmit={move}><label>Yeni aşama<select value={targetStage} onChange={(event) => setTargetStage(event.target.value as OpportunityStage)}>{nextOpportunityStages(moving.stage).map((stage) => <option key={stage} value={stage}>{opportunityStageLabels[stage]}</option>)}</select></label><label>Geçiş notu <span className="optional">isteğe bağlı</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>{targetStage === "lost" ? <label>Kayıp nedeni<textarea required value={lostReason} onChange={(event) => setLostReason(event.target.value)} /></label> : targetStage !== "won" ? <div className="form-row"><label>Sonraki aksiyon<select value={actionType} onChange={(event) => setActionType(event.target.value as NextActionType)}>{nextActionTypes.map((item) => <option key={item} value={item}>{nextActionTypeLabels[item]}</option>)}</select></label><label>Tarih ve saat<input name="nextActionAt" required type="datetime-local" value={actionAt} onChange={(event) => setActionAt(event.target.value)} /></label></div> : null}{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "İlerletiliyor…" : "Aşamayı kaydet"}</button></form></section></div> : null}
  </AppShell>;
}
