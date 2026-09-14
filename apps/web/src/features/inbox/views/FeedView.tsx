"use client";

import { onboardingCopy, dailyTaskQueryKeys } from "@spherepath/shared";

import { useState } from "react";
import { ListChecks, Archive, ArchiveRestore, ArrowRight, Check, ChevronDown, ChevronUp, MapPin, Mic, Pencil, PhoneOff, Pin, RefreshCw, RotateCcw, Send, Shuffle, Target } from "lucide-react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys, commercialQueryKeys, dailyTaskResolutionLabels, inboxAnalysisHighlights, todayTaskBucket, inboxItemKinds, inboxItemTrace, inboxKindAfterAnalysis, isInboxItemResolved, type DailyTaskOutcome, type InboxItemKind, type InboxItemRecord, type TodayTask } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { finishDailyTask, loadTodayOverview, replaceDailyTask } from "@/features/today/resources/today";
import { TaskResolutionSheet, taskActionLabel, taskContextLine, taskDueChip, taskRecordHref } from "@/features/today/components/TaskResolutionSheet";
import { applyNotePage, changeInboxItem, createInboxNote, listInboxItems, retryInboxItem, undoInboxItem } from "../resources/inbox";
import { SpCard } from "@/shared/ui/SpCard";
import { AppShell } from "@/shared/ui/AppShell";
import { listContacts } from "@/features/contacts/resources/contacts";
import { NoteProcessingSheet } from "../components/NoteProcessingSheet";
import { NotePageReview, notePageSummary } from "../components/NotePageReview";

const kindLabels: Record<InboxItemKind, string> = { note: "Not", person: "Kişi", property: "Mülk", requirement: "Talep", follow_up: "Takip" };
const sourceLabels: Record<InboxItemRecord["source"], string> = { typed: "Hızlı not", voice: "Sesli kayıt", whatsapp: "WhatsApp" };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "İşlem tamamlanamadı.";
const interpretedItem = (item: InboxItemRecord): InboxItemRecord => {
  if (!item.analysis) return item;
  const kind = inboxKindAfterAnalysis(item.kind, item.source, item.linkedContactId, item.analysis);
  return kind === item.kind ? item : { ...item, kind };
};

/** "İşlendi" claimed more than happened when the only applied action was a label. */
function statusLabel(item: InboxItemRecord): string {
  if (item.status === "queued") return "Kuyrukta";
  if (item.status === "needs_review") return "Kontrol gerekli";
  if (item.status === "failed") return "Başarısız";
  const created = [...item.appliedActions].reverse().find((action) => action.entityId !== null && action.undoneAt === null);
  return created ? created.label : "Sınıflandırıldı";
}

interface NoteView {
  showArchived: boolean;
  expanded: Set<string>;
  locationFor: string | null;
  locationText: string;
  setLocationText(value: string): void;
  onToggleExpanded(id: string): void;
  onUpdate(id: string, values: { kind?: InboxItemKind; pinned?: boolean; archived?: boolean }): void;
  onRetry(id: string): void;
  onUndo(id: string): void;
  onProcess(item: InboxItemRecord): void;
  onReviewPage(item: InboxItemRecord): void;
  onCreateContact(item: InboxItemRecord): void;
  onLocationOpen(id: string): void;
  onLocationCancel(): void;
  onLocationSubmit(id: string): void;
}

function NoteKind({ item, view }: { item: InboxItemRecord; view: NoteView }) {
  return <span className="keep-kind">
    <span className="keep-dot" aria-hidden />
    <select aria-label="Not türü" disabled={item.id.startsWith("queued-") || view.showArchived} value={item.kind} onChange={(event) => view.onUpdate(item.id, { kind: event.target.value as InboxItemKind })}>
      {inboxItemKinds.map((kind) => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}
    </select>
  </span>;
}

function NoteLocation({ item, view }: { item: InboxItemRecord; view: NoteView }) {
  // A note that already became a record has been placed; asking again is noise.
  if (!item.needsLocation || view.showArchived || isInboxItemResolved(item)) return null;
  if (view.locationFor === item.id) {
    return <form className="location-form" onSubmit={(event) => { event.preventDefault(); view.onLocationSubmit(item.id); }}>
      <input aria-label="Konum" autoFocus placeholder="Örn. Urla İskele" value={view.locationText} onChange={(event) => view.setLocationText(event.target.value)} />
      <button className="primary-action compact-action" disabled={view.locationText.trim().length < 2} type="submit">Ekle</button>
      <button className="text-button" onClick={view.onLocationCancel} type="button">Vazgeç</button>
    </form>;
  }
  return <button className="location-prompt" onClick={() => view.onLocationOpen(item.id)} type="button"><MapPin size={16} /><span>Nerede? Konumu ekleyince eşleştirebilirim.</span></button>;
}

/** How many items on this page are still waiting for a decision. */
function pageSegmentCount(item: InboxItemRecord): number {
  return (item.segments ?? []).filter((segment) => segment.appliedAt === null).length;
}

function NoteActions({ item, view, compact = false }: { item: InboxItemRecord; view: NoteView; compact?: boolean }) {
  if (item.id.startsWith("queued-")) return null;
  if (view.showArchived) {
    return <button className="keep-edit-action" onClick={() => view.onUpdate(item.id, { archived: false })} type="button"><ArchiveRestore size={16} /> Geri getir</button>;
  }
  return <>
    {pageSegmentCount(item) > 1
      ? <button className="keep-edit-action" onClick={() => view.onReviewPage(item)} type="button"><ListChecks size={16} /> {compact ? `${pageSegmentCount(item)} satır` : `Sayfayı işle · ${pageSegmentCount(item)} satır`}</button>
      : <button className="keep-edit-action" onClick={() => view.onProcess(item)} type="button"><Pencil size={16} /> {compact ? "İşle" : "Düzenle ve işle"}</button>}
    <button title={item.pinned ? "Sabitlemeyi kaldır" : "Sabitle"} aria-label={item.pinned ? "Sabitlemeyi kaldır" : "Sabitle"} onClick={() => view.onUpdate(item.id, { pinned: !item.pinned })} type="button"><Pin size={16} fill={item.pinned ? "currentColor" : "none"} /></button>
    {item.status === "needs_review" || item.status === "failed" ? <button title="Tekrar dene" aria-label="Sınıflandırmayı tekrar dene" onClick={() => view.onRetry(item.id)} type="button"><RefreshCw size={16} /></button> : null}
    {item.appliedActions.some((action) => action.type === "contact_created" && action.undoneAt === null) ? <button title="Oluşturulan kişiyi geri al" aria-label="Oluşturulan kişiyi geri al" onClick={() => view.onUndo(item.id)} type="button"><RotateCcw size={16} /></button> : null}
    <button title="Arşivle" aria-label="Arşivle" onClick={() => view.onUpdate(item.id, { archived: true })} type="button"><Archive size={16} /></button>
  </>;
}

function traceHref(kind: string, entityId: string | null, fallbackContactId: string | null): string | null {
  if (kind === "contact_created" || kind === "contact_linked") return entityId ? `/contacts/__contact__?contactId=${encodeURIComponent(entityId)}` : null;
  if (kind === "opportunity_created") return entityId ? `/opportunities?opportunityId=${encodeURIComponent(entityId)}` : "/opportunities";
  if (kind === "listing_created" || kind === "portfolio_created") return "/listings";
  if (kind === "interaction_created") return fallbackContactId ? `/contacts/__contact__?contactId=${encodeURIComponent(fallbackContactId)}` : null;
  return null;
}

function NoteTrace({ item }: { item: InboxItemRecord }) {
  const trace = inboxItemTrace(item);
  if (!trace.length) return null;
  return <ul className="keep-trace">{trace.map((entry) => {
    const href = traceHref(entry.kind, entry.entityId, item.linkedContactId);
    return <li key={`${entry.kind}-${entry.entityId ?? entry.label}`}>{href ? <Link href={href}>{entry.label}</Link> : entry.label}</li>;
  })}</ul>;
}

function NoteUnderstanding({ item, view }: { item: InboxItemRecord; view: NoteView }) {
  // The reading arrives a few seconds after the save, so the card says it is
  // coming rather than looking finished and empty.
  if (item.analysisStatus === "pending") return <p className="keep-understanding is-pending">Not okunuyor…</p>;
  // A page of a dozen lines has no single reading to show. What it does have is
  // a count of what is on it, which is what the advisor is deciding about.
  const waitingSegments = (item.segments ?? []).filter((segment) => segment.appliedAt === null);
  if (waitingSegments.length > 1) {
    return <ul className="keep-understanding"><li>{notePageSummary(item.segments ?? [])}</li></ul>;
  }
  const highlights = inboxAnalysisHighlights(item.analysis, item.safeText);
  // The note names someone the workspace has never seen. Making the advisor
  // pick a type and retype that name is the system asking for what it just read.
  const foundName = item.linkedContactId ? null : item.analysis?.insights.contactName?.trim() || null;
  // The number is what the switch runs on: without it the contact cannot be
  // dialled and an incoming call from them matches nobody.
  const foundPhone = item.analysis?.insights.contactPhone?.trim() || null;
  if (!highlights.length && !foundName) return null;
  return <>
    {highlights.length ? <ul className="keep-understanding">{highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}
    {/* The reading found a property situation but no opportunity exists yet.
        Creating one commits to a pipeline and a date, so it is offered, not made. */}
    {!foundName && item.linkedContactId && item.analysis?.insights.propertySituations.length
      && !item.appliedActions.some((action) => action.type === "opportunity_created" && action.undoneAt === null)
      ? <p className="keep-found-contact">Bu not bir iş tarif ediyor.<Link className="text-button" href={`/opportunities?create=1&contactId=${encodeURIComponent(item.linkedContactId)}`}>Fırsat aç</Link></p>
      : null}
    {foundName ? <p className="keep-found-contact"><strong>{foundName}</strong> henüz kayıtlı değil{foundPhone ? <> · <span className="keep-found-phone">{foundPhone}</span></> : " · telefon yok"}.<button className="text-button" onClick={() => view.onCreateContact(item)} type="button">Kişi kaydını tamamla</button></p> : null}
  </>;
}

function NoteRow({ item, view }: { item: InboxItemRecord; view: NoteView }) {
  return <article className={`note-row kind-${item.kind}`}>
    <NoteKind item={item} view={view} />
    <div className="note-row-body">
      <p className={view.expanded.has(item.id) ? "" : "note-row-line"}>{view.expanded.has(item.id) ? item.safeText : item.summary}</p>
      {item.safeText !== item.summary ? <button className="text-button keep-expand" onClick={() => view.onToggleExpanded(item.id)} type="button">{view.expanded.has(item.id) ? <><ChevronUp size={14} /> Kısalt</> : <><ChevronDown size={14} /> Tamamını göster</>}</button> : null}
      <NoteUnderstanding item={item} view={view} />
      <NoteTrace item={item} />
      <NoteLocation item={item} view={view} />
    </div>
    <p className="keep-source">{sourceLabels[item.source]} · {statusLabel(item)}</p>
    <div className="note-row-actions"><NoteActions item={item} view={view} compact /></div>
  </article>;
}


const longDate = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" });

/**
 * One row of the day's plan. The action verb is a real button next to the name
 * instead of a tick a screen-width away, and the second line carries why this
 * is here -- the stage, the role, when they were last spoken to -- rather than
 * repeating the verb that is already on the button.
 */
function PlanRow({ task, tone, onResolve, onReplace }: {
  task: TodayTask;
  tone: "overdue" | "today" | "later";
  onResolve(task: TodayTask): void;
  onReplace(taskId: string): void;
}) {
  const context = taskContextLine(task);
  // On a scheduled task the reason is the verb, which the button already says.
  // On the others it is the only thing explaining why the row exists.
  const why = [task.type === "next_action" ? null : task.reason, context].filter(Boolean).join(" · ") || task.reason;
  const resolved = Boolean(task.resolutionStatus);
  return <li className={resolved ? `plan-row resolved resolution-${task.resolutionStatus}` : `plan-row tone-${tone}`}>
    <span className="plan-dot" aria-hidden />
    {/* The name opens the record; the button beside it performs the action, so
        a resolved row still leads back to the person it was about. */}
    <Link className="plan-body" href={resolved ? `/contacts/__contact__?contactId=${encodeURIComponent(task.contactId)}` : taskRecordHref(task)}>
      <strong>{task.title}</strong>
      <span>{resolved
        ? `${dailyTaskResolutionLabels[task.resolutionStatus!]}${task.resolutionNote ? ` · ${task.resolutionNote}` : ""}`
        : why}</span>
    </Link>
    <time className="plan-due">{taskDueChip(task.dueAt)}</time>
    {resolved
      ? <span className="plan-actions"><span className="plan-resolved-mark">{task.resolutionStatus === "contact_opt_out" ? <PhoneOff size={15} /> : <Check size={15} />}</span></span>
      : <span className="plan-actions">
          <Link className="primary-action compact-action plan-go" href={taskRecordHref(task)}>{taskActionLabel(task)}</Link>
          <button title="Bugünlük çıkar" aria-label={`${task.title} görevini bugünkü listeden çıkar`} onClick={() => onReplace(task.id)} type="button"><Shuffle size={15} /></button>
          <button title="Sonuçlandır" aria-label={`${task.title} görevini sonuçlandır`} onClick={() => onResolve(task)} type="button"><Check size={16} /></button>
        </span>}
  </li>;
}

export function FeedView() {
  const [referenceTime] = useState(Date.now);
  const { session } = useSession(); const client = useQueryClient(); const [text, setText] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TodayTask | null>(null); const [resolving, setResolving] = useState(false); const [taskError, setTaskError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); const [locationFor, setLocationFor] = useState<string | null>(null); const [locationText, setLocationText] = useState("");
  const [noteScope, setNoteScope] = useState<"open" | "done" | "archived">("open"); const [activeNote, setActiveNote] = useState<InboxItemRecord | null>(null); const [activeNoteKind, setActiveNoteKind] = useState<InboxItemKind | undefined>();
  const [pageNote, setPageNote] = useState<InboxItemRecord | null>(null); const [pagePending, setPagePending] = useState(false); const [pageError, setPageError] = useState<string | null>(null);
  const showArchived = noteScope === "archived";
  const today = useQuery({ queryKey: apiQueryKeys.todayOverviewPeriod("30d"), queryFn: () => loadTodayOverview("30d") });
  const inbox = useQuery({ queryKey: apiQueryKeys.inboxItems, queryFn: () => listInboxItems(session ?? undefined), enabled: Boolean(session), refetchInterval: (query) => (query.state.data as InboxItemRecord[] | undefined)?.some((item) => item.status === "queued" || item.status === "processing" || item.analysisStatus === "pending") ? 1_500 : false });
  const contacts = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts, enabled: Boolean(session) });
  const loadingError = today.error ?? inbox.error;
  // A newly deployed client can briefly talk to the previous Functions
  // version. Treat additive overview fields as empty until that rollout lands.
  const upcomingTasks = today.data?.upcomingTasks ?? [];
  const recentInteractions = today.data?.recentInteractions ?? [];
  async function save() { if (!session || !text.trim()) return; setSaving(true); setError(null); try { await client.cancelQueries({ queryKey: apiQueryKeys.inboxItems }); const item = await createInboxNote(session, text.trim()); client.setQueryData<InboxItemRecord[]>(apiQueryKeys.inboxItems, (current = []) => [item, ...current.filter((entry) => entry.id !== item.id)]); setText(""); } catch (next) { setError(messageFrom(next)); } finally { setSaving(false); } }
  async function resolveTask(outcome: DailyTaskOutcome) {
    if (!session) return;
    setResolving(true); setTaskError(null);
    try {
      await finishDailyTask(session, outcome);
      await Promise.all(dailyTaskQueryKeys.map((queryKey) => client.invalidateQueries({ queryKey })));
      setActiveTask(null);
    } catch (next) { setTaskError(messageFrom(next)); } finally { setResolving(false); }
  }
  async function replace(taskId: string) { if (!session) return; try { await replaceDailyTask(session, taskId); await client.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }); } catch (next) { setError(messageFrom(next)); } }
  async function update(inboxItemId: string, values: { kind?: InboxItemKind; pinned?: boolean; archived?: boolean }) { if (!session) return; try { await changeInboxItem(session, { inboxItemId, ...values }); await client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }); } catch (next) { setError(messageFrom(next)); } }
  async function retry(inboxItemId: string) { if (!session) return; try { await retryInboxItem(session, inboxItemId); await client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }); } catch (next) { setError(messageFrom(next)); } }
  async function addLocation(inboxItemId: string) { if (!session || locationText.trim().length < 2) return; try { await changeInboxItem(session, { inboxItemId, location: locationText.trim() }); setLocationFor(null); setLocationText(""); await client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }); } catch (next) { setError(messageFrom(next)); } }
  function toggleExpanded(id: string) { setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  async function undo(inboxItemId: string) { if (!session) return; try { await undoInboxItem(session, inboxItemId); await Promise.all([client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }), client.invalidateQueries({ queryKey: apiQueryKeys.contacts })]); } catch (next) { setError(messageFrom(next)); } }
  // "Aktif" means work still to do. A note that has already produced a record
  // belongs to "İşlendi", or the list never empties and stops being read.
  const visibleNotes = (inbox.data ?? []).filter((item) => {
    if (item.status === "archived") return noteScope === "archived";
    return noteScope === (isInboxItemResolved(item) ? "done" : "open");
  }).map(interpretedItem);
  const openCount = (inbox.data ?? []).filter((item) => item.status !== "archived" && !isInboxItemResolved(item)).length;
  const currentActiveNote = activeNote
    ? interpretedItem((inbox.data ?? []).find((entry) => entry.id === activeNote.id) ?? activeNote)
    : null;
  const noteView: NoteView = {
    showArchived, expanded, locationFor, locationText, setLocationText,
    onToggleExpanded: toggleExpanded,
    onUpdate: (id, values) => void update(id, values),
    onRetry: (id) => void retry(id),
    onUndo: (id) => void undo(id),
    onProcess: (item) => { setActiveNoteKind(undefined); setActiveNote(item); },
    onReviewPage: (item) => { setPageError(null); setPageNote(item); },
    onCreateContact: (item) => { setActiveNoteKind("person"); setActiveNote(item); },
    onLocationOpen: (id) => { setLocationFor(id); setLocationText(""); },
    onLocationCancel: () => { setLocationFor(null); setLocationText(""); },
    onLocationSubmit: (id) => void addLocation(id),
  };

  // The day's list is pinned server-side so it does not reshuffle while it is
  // being worked. Grouping reads that pinned plan rather than re-deriving one
  // from the buckets, which would drop a task the moment its date moved.
  const planTasks = today.data?.tasks ?? [];
  const overdueTasks = planTasks.filter((task) => todayTaskBucket(task, referenceTime) === "overdue");
  const todayTasks = planTasks.filter((task) => todayTaskBucket(task, referenceTime) === "today");
  const scheduledTasks = planTasks.filter((task) => todayTaskBucket(task, referenceTime) === "upcoming");
  const completedCount = today.data?.completedTaskCount ?? 0;
  const planTotal = planTasks.length;
  const plannedIds = new Set(planTasks.map((task) => task.id));
  const railTasks = upcomingTasks.filter((task) => !plannedIds.has(task.id));
  const focus = today.data?.focus;
  const focusHref = focus?.targetOpportunityId
    ? `/opportunities?opportunityId=${encodeURIComponent(focus.targetOpportunityId)}`
    : focus?.targetContactId
      ? `/capture?contactId=${encodeURIComponent(focus.targetContactId)}`
      : "/funnel";
  const refresh = () => void Promise.all([today.refetch(), inbox.refetch()]);
  const openTask = (task: TodayTask) => { setTaskError(null); setActiveTask(task); };

  return <AppShell><div className="feed-view">{contacts.data?.length === 0 ? <SpCard><h2>{onboardingCopy.startTitle}</h2><p>{onboardingCopy.startHint}</p><div className="header-actions"><Link className="secondary-action inline-link" href="/contacts?create=1">{onboardingCopy.contact}</Link><Link className="secondary-action inline-link" href="/capture">{onboardingCopy.capture}</Link><Link className="secondary-action inline-link" href="/listings?action=add-listing">{onboardingCopy.listing}</Link></div></SpCard> : null}
    <header className="day-header">
      <div><p className="eyebrow">{longDate.format(new Date()).toLocaleUpperCase("tr-TR")}</p><h1>Bugün</h1></div>
      <div className="day-summary">
        <div><strong className={overdueTasks.length ? "is-overdue" : undefined}>{overdueTasks.length}</strong><span>gecikmiş</span></div>
        <span className="day-summary-rule" aria-hidden />
        <div><strong>{todayTasks.length}</strong><span>bugün</span></div>
        <span className="day-summary-rule" aria-hidden />
        <div><strong className={completedCount ? "is-done" : undefined}>{completedCount}</strong><span>tamamlanan</span></div>
        <button className="topbar-icon-button" onClick={refresh} aria-label="Yenile" type="button"><RefreshCw size={16} /></button>
      </div>
    </header>
    {loadingError ? <div className="form-error notice" role="alert"><strong>Veriler yüklenemedi.</strong> {messageFrom(loadingError)} <button className="text-button" type="button" onClick={refresh}>Yeniden dene</button></div> : null}

    {/* One row, not a card: capture is the thing an advisor does between two
        appointments, so it costs a line of the screen rather than a third of it. */}
    <section className="capture-bar" aria-label="Hızlı kayıt">
      <Pencil size={17} aria-hidden />
      <textarea
        aria-label="Hızlı not"
        placeholder="Aklındakini bırak — “Bahçeli satılık bir ev duydum…”"
        rows={1}
        value={text}
        onChange={(event) => { setText(event.target.value); const field = event.currentTarget; field.style.height = "auto"; field.style.height = `${Math.min(140, field.scrollHeight)}px`; }}
      />
      <Link className="secondary-action compact-action" href="/capture"><Mic size={15} /> Sesli anlat</Link>
      <button disabled={!text.trim() || saving} className="primary-action compact-action" onClick={() => void save()} type="button"><Send size={15} />{saving ? "Kaydediliyor…" : "Kaydet"}</button>
    </section>

    <div className="day-grid">
      {/* The plan and the notes are one column so a short plan does not leave
          a hole beside a tall rail. */}
      <div className="day-column">
      <section className="sp-card plan-card" aria-labelledby="daily-five-title">
        <div className="feed-section-heading"><div><p className="eyebrow">GÜNÜN PLANI</p><h2 id="daily-five-title">Önce bunları bitir</h2></div><span className="plan-progress"><span>{completedCount}/{planTotal}</span><span className="plan-progress-track" aria-hidden><span style={{ width: `${planTotal ? Math.round((completedCount / planTotal) * 100) : 0}%` }} /></span></span></div>
        {today.isPending ? <p className="context-sentence plan-empty">Plan hazırlanıyor…</p>
          : today.isError ? <p className="context-sentence plan-empty">Günlük plan şu anda gösterilemiyor.</p>
          : planTasks.length ? <>
              {([
                ["overdue", "GECİKMİŞ", overdueTasks],
                ["today", "BUGÜN", todayTasks],
                ["scheduled", "PLANLANAN", scheduledTasks],
              ] as const).map(([key, label, group]) => group.length ? <div key={key}>
                <p className={key === "overdue" ? "plan-group is-overdue" : "plan-group"}><span className="eyebrow">{label}</span><span>{group.length}</span></p>
                <ol className="plan-list">{group.map((task) => <PlanRow key={task.id} task={task} tone={key === "overdue" ? "overdue" : key === "today" ? "today" : "later"} onResolve={openTask} onReplace={(id) => void replace(id)} />)}</ol>
              </div> : null)}
            </>
          : <p className="context-sentence plan-empty">{upcomingTasks.length ? "Bugün için iş yok. Yaklaşan takiplerin yanda." : "Henüz planlanacak iş yok. İlk notunu veya kişini ekle."}</p>}
        {railTasks.length ? <p className="plan-foot"><span>Önümüzdeki günlerde {railTasks.length} iş planlı</span></p> : null}
      </section>

      {error ? <p className="form-error notice" role="alert">{error}</p> : null}
      <div className="feed-title note-list-heading"><div><h2>Notların</h2><p className="context-sentence">Sistem tür önerir; gerçek kayda dönüştürmeye sen karar verirsin.</p></div><div className="note-heading-controls"><div className="note-view-toggle" role="group" aria-label="Not listesi">{([["open", openCount ? `Aktif · ${openCount}` : "Aktif"], ["done", "İşlendi"], ["archived", "Arşiv"]] as const).map(([scope, label]) => <button key={scope} className={noteScope === scope ? "selected" : ""} onClick={() => setNoteScope(scope)} type="button">{label}</button>)}</div></div></div>
      {inbox.isPending ? <p className="context-sentence">Notlar yükleniyor…</p> : inbox.isError ? <div className="sp-card empty-state"><p>Notlar şu anda gösterilemiyor.</p></div> : visibleNotes.length
        ? <section className="note-rows" aria-label="Akış notları">{visibleNotes.map((item) => <NoteRow key={item.id} item={item} view={noteView} />)}</section>
        : <div className="sp-card empty-state"><p>{noteScope === "archived" ? "Arşivlenmiş not yok." : noteScope === "done" ? "Henüz kayda dönüşmüş not yok." : "Bekleyen not yok."}</p></div>}
      </div>

      <div className="day-rail">
        {focus ? <section className="sp-card focus-card day-focus" aria-labelledby="day-focus-title">
          <div className="focus-heading"><div className="card-icon"><Target size={18} aria-hidden /></div><div><p className="eyebrow">ŞİMDİKİ DARBOĞAZ</p><h2 id="day-focus-title">{focus.title}</h2></div></div>
          <p>{focus.description}</p>
          <div className="focus-evidence"><span>Önerilen eylem</span><strong>{focus.action}</strong></div>
          <Link href={focusHref} className="primary-action inline-link">İlgili kaydı aç <ArrowRight size={15} /></Link>
        </section> : null}

        {railTasks.length ? <section className="sp-card upcoming-card" aria-labelledby="feed-upcoming-title">
          <div className="feed-section-heading"><div><p className="eyebrow">SIRADAKİ GÜNLER</p><h2 id="feed-upcoming-title">Yarın ve sonrası</h2></div><span className="period-chip">{railTasks.length} İŞ</span></div>
          <ol className="upcoming-list">{railTasks.slice(0, 6).map((task) => <li key={task.id}><time>{taskDueChip(task.dueAt)}</time><Link href={taskRecordHref(task)}><strong>{task.title}</strong><small>{taskContextLine(task) || task.reason}</small></Link></li>)}</ol>
        </section> : null}

        {recentInteractions.length ? <section className="sp-card upcoming-card" aria-labelledby="feed-memory-title">
          <div className="feed-section-heading"><div><p className="eyebrow">GÜNÜN HAFIZASI</p><h2 id="feed-memory-title">Bugün kaydedilen temaslar</h2></div><span className="period-chip">{recentInteractions.length} TEMAS</span></div>
          <ol className="upcoming-list">{recentInteractions.map((interaction) => <li key={interaction.id}><time>{new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(interaction.occurredAt)}</time><Link href={`/contacts/__contact__?contactId=${encodeURIComponent(interaction.contactId)}`}><strong>{interaction.contactName}</strong><small>{interaction.outcome}</small></Link></li>)}</ol>
        </section> : null}
      </div>
    </div>

    {activeTask ? <TaskResolutionSheet task={activeTask} pending={resolving} error={taskError} onClose={() => setActiveTask(null)} onResolve={(outcome) => void resolveTask(outcome)} /> : null}
    {pageNote ? <NotePageReview
      item={(inbox.data ?? []).find((entry) => entry.id === pageNote.id) ?? pageNote}
      contacts={contacts.data ?? []}
      pending={pagePending}
      error={pageError}
      onClose={() => setPageNote(null)}
      onApply={async (input) => {
        if (!session) return;
        setPagePending(true); setPageError(null);
        try {
          await applyNotePage(session, input);
          await Promise.all(commercialQueryKeys.map((queryKey) => client.invalidateQueries({ queryKey })));
          await inbox.refetch();
          setPageNote(null);
        } catch (next) { setPageError(messageFrom(next)); }
        finally { setPagePending(false); }
      }}
    /> : null}
    {currentActiveNote ? <NoteProcessingSheet item={currentActiveNote} contacts={contacts.data ?? []} initialKind={activeNoteKind} onClose={() => setActiveNote(null)} onChanged={async (updatedItem) => {
      if (updatedItem) client.setQueryData<InboxItemRecord[]>(apiQueryKeys.inboxItems, (current = []) => current.map((entry) => entry.id === updatedItem.id ? updatedItem : entry));
      await Promise.all([client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }), client.invalidateQueries({ queryKey: apiQueryKeys.contacts }), client.invalidateQueries({ queryKey: apiQueryKeys.opportunities }), client.invalidateQueries({ queryKey: apiQueryKeys.portfolioItems }), client.invalidateQueries({ queryKey: apiQueryKeys.listings }), client.invalidateQueries({ queryKey: apiQueryKeys.todayOverview })]);
    }} /> : null}
  </div></AppShell>;
}
