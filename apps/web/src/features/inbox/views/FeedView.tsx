"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronUp, MapPin, Mic, Pencil, PhoneOff, Pin, RefreshCw, RotateCcw, Send, Shuffle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys, dailyTaskResolutionLabels, inboxAnalysisHighlights, inboxItemKinds, isInboxItemResolved, joinPhone, splitPhone, type DailyTaskOutcome, type InboxItemKind, type InboxItemRecord, type TodayTask } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { finishDailyTask, loadTodayOverview, replaceDailyTask } from "@/features/today/resources/today";
import { TaskResolutionSheet, taskDueLabel, taskRecordHref } from "@/features/today/components/TaskResolutionSheet";
import { changeInboxItem, createInboxNote, listInboxItems, retryInboxItem, undoInboxItem, processInboxItem } from "../resources/inbox";
import { noteViewModes, useNoteViewMode } from "../resources/note-view";
import { AppShell } from "@/shared/ui/AppShell";
import { listContacts } from "@/features/contacts/resources/contacts";
import { NoteProcessingSheet } from "../components/NoteProcessingSheet";

const kindLabels: Record<InboxItemKind, string> = { note: "Not", person: "Kişi", property: "Mülk", requirement: "Talep", follow_up: "Takip" };
const sourceLabels: Record<InboxItemRecord["source"], string> = { typed: "Hızlı not", voice: "Sesli kayıt", whatsapp: "WhatsApp" };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "İşlem tamamlanamadı.";

/** "İşlendi" claimed more than happened when the only applied action was a label. */
function statusLabel(item: InboxItemRecord): string {
  if (item.status === "queued") return "Kuyrukta";
  if (item.status === "needs_review") return "Kontrol gerekli";
  if (item.status === "failed") return "Başarısız";
  const created = [...item.appliedActions].reverse().find((action) => action.entityId !== null && action.undoneAt === null);
  return created ? created.label : "Sınıflandırıldı";
}

/** Grouping follows the order the kind selector uses, so the two never disagree. */
const noteGroupOrder: InboxItemKind[] = ["property", "requirement", "follow_up", "person", "note"];

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
  creatingContactFor: string | null;
  onCreateContact(item: InboxItemRecord, fullName: string, phone: string | null): void;
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

function NoteActions({ item, view, compact = false }: { item: InboxItemRecord; view: NoteView; compact?: boolean }) {
  if (item.id.startsWith("queued-")) return null;
  if (view.showArchived) {
    return <button className="keep-edit-action" onClick={() => view.onUpdate(item.id, { archived: false })} type="button"><ArchiveRestore size={16} /> Geri getir</button>;
  }
  return <>
    <button className="keep-edit-action" onClick={() => view.onProcess(item)} type="button"><Pencil size={16} /> {compact ? "İşle" : "Düzenle ve işle"}</button>
    <button title={item.pinned ? "Sabitlemeyi kaldır" : "Sabitle"} aria-label={item.pinned ? "Sabitlemeyi kaldır" : "Sabitle"} onClick={() => view.onUpdate(item.id, { pinned: !item.pinned })} type="button"><Pin size={16} fill={item.pinned ? "currentColor" : "none"} /></button>
    {item.status === "needs_review" || item.status === "failed" ? <button title="Tekrar dene" aria-label="Sınıflandırmayı tekrar dene" onClick={() => view.onRetry(item.id)} type="button"><RefreshCw size={16} /></button> : null}
    {item.appliedActions.some((action) => action.type === "contact_created" && action.undoneAt === null) ? <button title="Oluşturulan kişiyi geri al" aria-label="Oluşturulan kişiyi geri al" onClick={() => view.onUndo(item.id)} type="button"><RotateCcw size={16} /></button> : null}
    <button title="Arşivle" aria-label="Arşivle" onClick={() => view.onUpdate(item.id, { archived: true })} type="button"><Archive size={16} /></button>
  </>;
}

function NoteCard({ item, view }: { item: InboxItemRecord; view: NoteView }) {
  return <article className={`sp-card keep-card kind-${item.kind}`}>
    <div className="keep-meta"><NoteKind item={item} view={view} /></div>
    <p className={view.expanded.has(item.id) ? "" : "keep-clamped"}>{view.expanded.has(item.id) ? item.safeText : item.summary}</p>
    {item.safeText !== item.summary ? <button className="text-button keep-expand" onClick={() => view.onToggleExpanded(item.id)} type="button">{view.expanded.has(item.id) ? <><ChevronUp size={14} /> Kısalt</> : <><ChevronDown size={14} /> Tamamını göster</>}</button> : null}
    <NoteUnderstanding item={item} view={view} />
    <NoteLocation item={item} view={view} />
    <p className="keep-source">{sourceLabels[item.source]} · {statusLabel(item)}</p>
    {item.id.startsWith("queued-") ? null : <footer><NoteActions item={item} view={view} /></footer>}
  </article>;
}

function NoteUnderstanding({ item, view }: { item: InboxItemRecord; view: NoteView }) {
  // The reading arrives a few seconds after the save, so the card says it is
  // coming rather than looking finished and empty.
  if (item.analysisStatus === "pending") return <p className="keep-understanding is-pending">Not okunuyor…</p>;
  const highlights = inboxAnalysisHighlights(item.analysis);
  // The note names someone the workspace has never seen. Making the advisor
  // pick a type and retype that name is the system asking for what it just read.
  const foundName = item.linkedContactId ? null : item.analysis?.insights.contactName?.trim() || null;
  // The number is what the switch runs on: without it the contact cannot be
  // dialled and an incoming call from them matches nobody.
  const foundPhone = item.analysis?.insights.contactPhone?.trim() || null;
  if (!highlights.length && !foundName) return null;
  return <>
    {highlights.length ? <ul className="keep-understanding">{highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}
    {foundName ? <p className="keep-found-contact"><strong>{foundName}</strong> henüz kayıtlı değil{foundPhone ? <> · <span className="keep-found-phone">{foundPhone}</span></> : " · telefon yok"}.<button className="text-button" disabled={view.creatingContactFor === item.id} onClick={() => view.onCreateContact(item, foundName, foundPhone)} type="button">{view.creatingContactFor === item.id ? "Oluşturuluyor…" : "Kişi olarak ekle"}</button></p> : null}
  </>;
}

function NoteRow({ item, view }: { item: InboxItemRecord; view: NoteView }) {
  return <article className={`note-row kind-${item.kind}`}>
    <NoteKind item={item} view={view} />
    <div className="note-row-body">
      <p className={view.expanded.has(item.id) ? "" : "note-row-line"}>{view.expanded.has(item.id) ? item.safeText : item.summary}</p>
      {item.safeText !== item.summary ? <button className="text-button keep-expand" onClick={() => view.onToggleExpanded(item.id)} type="button">{view.expanded.has(item.id) ? <><ChevronUp size={14} /> Kısalt</> : <><ChevronDown size={14} /> Tamamını göster</>}</button> : null}
      <NoteUnderstanding item={item} view={view} />
      <NoteLocation item={item} view={view} />
    </div>
    <p className="keep-source">{sourceLabels[item.source]} · {statusLabel(item)}</p>
    <div className="note-row-actions"><NoteActions item={item} view={view} compact /></div>
  </article>;
}

export function FeedView() {
  const { session } = useSession(); const client = useQueryClient(); const [text, setText] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TodayTask | null>(null); const [resolving, setResolving] = useState(false); const [taskError, setTaskError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); const [locationFor, setLocationFor] = useState<string | null>(null); const [locationText, setLocationText] = useState("");
  const [noteScope, setNoteScope] = useState<"open" | "done" | "archived">("open"); const [activeNote, setActiveNote] = useState<InboxItemRecord | null>(null);
  const showArchived = noteScope === "archived";
  const [viewMode, changeViewMode] = useNoteViewMode();
  const [showAllWork, setShowAllWork] = useState(false);
  const today = useQuery({ queryKey: apiQueryKeys.todayOverviewPeriod("30d"), queryFn: () => loadTodayOverview("30d") });
  const inbox = useQuery({ queryKey: apiQueryKeys.inboxItems, queryFn: () => listInboxItems(session ?? undefined), enabled: Boolean(session), refetchInterval: (query) => (query.state.data as InboxItemRecord[] | undefined)?.some((item) => item.status === "queued" || item.status === "processing" || item.analysisStatus === "pending") ? 1_500 : false });
  const contacts = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts, enabled: Boolean(session) });
  const loadingError = today.error ?? inbox.error;
  async function save() { if (!session || !text.trim()) return; setSaving(true); setError(null); try { await client.cancelQueries({ queryKey: apiQueryKeys.inboxItems }); const item = await createInboxNote(session, text.trim()); client.setQueryData<InboxItemRecord[]>(apiQueryKeys.inboxItems, (current = []) => [item, ...current.filter((entry) => entry.id !== item.id)]); setText(""); } catch (next) { setError(messageFrom(next)); } finally { setSaving(false); } }
  async function resolveTask(outcome: DailyTaskOutcome) {
    if (!session) return;
    setResolving(true); setTaskError(null);
    try {
      await finishDailyTask(session, outcome);
      await client.invalidateQueries({ queryKey: apiQueryKeys.todayOverview });
      setActiveTask(null);
    } catch (next) { setTaskError(messageFrom(next)); } finally { setResolving(false); }
  }
  async function replace(taskId: string) { if (!session) return; try { await replaceDailyTask(session, taskId); await client.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }); } catch (next) { setError(messageFrom(next)); } }
  const [creatingContactFor, setCreatingContactFor] = useState<string | null>(null);
  async function createContactFromNote(item: InboxItemRecord, fullName: string, phone: string | null) {
    if (!session) return;
    setCreatingContactFor(item.id); setError(null);
    try {
      await processInboxItem(session, {
        inboxItemId: item.id, action: "person",
        // Stored in the app's own format so the lookup key matches a caller.
        contact: { fullName, phone: phone ? joinPhone(splitPhone(phone).dialCode, splitPhone(phone).national) : "", metAtPlace: "Akış notu", source: "other", role: "unknown" },
      });
      await client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems });
      await client.invalidateQueries({ queryKey: apiQueryKeys.contacts });
    } catch (next) {
      setError(messageFrom(next));
    } finally {
      setCreatingContactFor(null);
    }
  }

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
  });
  const openCount = (inbox.data ?? []).filter((item) => item.status !== "archived" && !isInboxItemResolved(item)).length;
  const groupedNotes = noteGroupOrder
    .map((kind) => ({ kind, items: visibleNotes.filter((item) => item.kind === kind) }))
    .filter((group) => group.items.length > 0);
  const noteView: NoteView = {
    showArchived, expanded, locationFor, locationText, setLocationText,
    onToggleExpanded: toggleExpanded,
    onUpdate: (id, values) => void update(id, values),
    onRetry: (id) => void retry(id),
    onUndo: (id) => void undo(id),
    onProcess: (item) => setActiveNote(item),
    creatingContactFor,
    onCreateContact: (item, fullName, phone) => void createContactFromNote(item, fullName, phone),
    onLocationOpen: (id) => { setLocationFor(id); setLocationText(""); },
    onLocationCancel: () => { setLocationFor(null); setLocationText(""); },
    onLocationSubmit: (id) => void addLocation(id),
  };

  return <AppShell><div className="feed-view">
    <header className="feed-header"><div><p className="eyebrow">AKIŞ</p><h1>Bugün</h1><p className="context-sentence">Önce beş işini bitir; sonra duyduğun her şeyi tek cümleyle bırak.</p></div><button className="topbar-icon-button" onClick={() => void Promise.all([today.refetch(), inbox.refetch()])} aria-label="Yenile"><RefreshCw size={17} /></button></header>
    {loadingError ? <div className="form-error notice" role="alert"><strong>Veriler yüklenemedi.</strong> {messageFrom(loadingError)} <button className="text-button" type="button" onClick={() => void Promise.all([today.refetch(), inbox.refetch()])}>Yeniden dene</button></div> : null}
    <section className="sp-card daily-five" aria-labelledby="daily-five-title"><div className="feed-section-heading"><div><p className="eyebrow">BUGÜNÜN 5&apos;İ</p><h2 id="daily-five-title">Önce bunları bitir</h2></div><span className="period-chip">{today.data?.completedTaskCount ?? 0}/{today.data?.tasks.length ?? 0}</span></div>{today.isPending ? <p className="context-sentence">Plan hazırlanıyor…</p> : today.isError ? <p className="context-sentence">Günlük plan şu anda gösterilemiyor.</p> : today.data?.tasks.length ? <ol>{today.data.tasks.map((task) => <li key={task.id} className={task.resolutionStatus ? `resolved resolution-${task.resolutionStatus}` : ""}><span className="daily-number">{task.resolutionStatus === "contact_opt_out" ? <PhoneOff size={15} /> : task.resolutionStatus ? <Check size={15} /> : null}</span><Link className="daily-task-link" href={task.resolutionStatus ? `/contacts/__contact__?contactId=${encodeURIComponent(task.contactId)}` : taskRecordHref(task)}><strong>{task.title}</strong><small>{task.resolutionStatus ? `${dailyTaskResolutionLabels[task.resolutionStatus]}${task.resolutionNote ? ` · ${task.resolutionNote}` : ""}` : `${task.reason} · ${taskDueLabel(task.dueAt)}`}</small></Link>{task.resolutionStatus ? null : <span className="daily-actions"><button title="Bugünlük çıkar" aria-label={`${task.title} görevini bugünkü listeden çıkar`} onClick={() => void replace(task.id)}><Shuffle size={16} /></button><button title="Sonuçlandır" aria-label={`${task.title} görevini sonuçlandır`} onClick={() => { setTaskError(null); setActiveTask(task); }}><Check size={17} /></button></span>}</li>)}</ol> : <p className="context-sentence">Henüz planlanacak iş yok. İlk notunu veya kişini ekle.</p>}</section>
    {today.data && today.data.allTasks.length > today.data.tasks.length ? <section className="all-work-section"><button className="secondary-action all-work-toggle" type="button" onClick={() => setShowAllWork((value) => !value)}>{showAllWork ? "Kalan işleri gizle" : `Tüm işleri gör (${today.data.allTasks.length})`}</button>{showAllWork ? <div className="sp-card all-work-list"><h2>Bugünkü tüm işler</h2><p className="context-sentence">İlk beş odak listen; aşağıda kalan işleri de görebilirsin.</p><ol>{today.data.allTasks.filter((task) => !today.data.tasks.some((planned) => planned.id === task.id)).map((task) => <li key={task.id}><Link className="daily-task-link" href={taskRecordHref(task)}><strong>{task.title}</strong><small>{task.reason} · {taskDueLabel(task.dueAt)}</small></Link></li>)}</ol></div> : null}</section> : null}
    <section className="sp-card quick-note" aria-labelledby="quick-note-title"><div className="feed-section-heading"><div><p className="eyebrow">HIZLI KAYIT</p><h2 id="quick-note-title">Aklındakini bırak</h2></div><Sparkles size={20} aria-hidden /></div><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Örn. Urla'da bahçeli bir ev duydum…" aria-label="Hızlı not" /><div className="quick-note-actions"><Link className="secondary-action" href="/capture"><Mic size={17} /> Sesli anlat</Link><button disabled={!text.trim() || saving} className="primary-action" onClick={() => void save()}><Send size={17} />{saving ? "Kaydediliyor…" : "Kaydet"}</button></div></section>
    {error ? <p className="form-error notice" role="alert">{error}</p> : null}
    <div className="feed-title note-list-heading"><div><h2>Notların</h2><p className="context-sentence">Sistem tür önerir; gerçek kayda dönüştürmeye sen karar verirsin.</p></div><div className="note-heading-controls"><div className="note-view-toggle" role="group" aria-label="Not görünümü">{noteViewModes.map((mode) => <button key={mode.id} className={viewMode === mode.id ? "selected" : ""} onClick={() => changeViewMode(mode.id)} type="button">{mode.label}</button>)}</div><div className="note-view-toggle" role="group" aria-label="Not listesi">{([["open", openCount ? `Aktif · ${openCount}` : "Aktif"], ["done", "İşlendi"], ["archived", "Arşiv"]] as const).map(([scope, label]) => <button key={scope} className={noteScope === scope ? "selected" : ""} onClick={() => setNoteScope(scope)} type="button">{label}</button>)}</div></div></div>
    {inbox.isPending ? <p className="context-sentence">Notlar yükleniyor…</p> : inbox.isError ? <div className="sp-card empty-state"><p>Notlar şu anda gösterilemiyor.</p></div> : visibleNotes.length ? (
      viewMode === "list"
        ? <section className="note-rows" aria-label="Akış notları">{visibleNotes.map((item) => <NoteRow key={item.id} item={item} view={noteView} />)}</section>
        : viewMode === "group"
          ? <div className="note-groups">{groupedNotes.map((group) => <section key={group.kind} aria-label={kindLabels[group.kind]}><div className={`note-group-head kind-${group.kind}`}><span className="note-group-label">{kindLabels[group.kind]}</span><span className="note-group-count">{group.items.length}</span><span className="note-group-rule" /></div><div className="keep-grid">{group.items.map((item) => <NoteCard key={item.id} item={item} view={noteView} />)}</div></section>)}</div>
          : <section className="keep-grid" aria-label="Akış notları">{visibleNotes.map((item) => <NoteCard key={item.id} item={item} view={noteView} />)}</section>
    ) : <div className="sp-card empty-state"><p>{noteScope === "archived" ? "Arşivlenmiş not yok." : noteScope === "done" ? "Henüz kayda dönüşmüş not yok." : "Bekleyen not yok."}</p></div>}
    {activeTask ? <TaskResolutionSheet task={activeTask} pending={resolving} error={taskError} onClose={() => setActiveTask(null)} onResolve={(outcome) => void resolveTask(outcome)} /> : null}
    {activeNote ? <NoteProcessingSheet item={activeNote} contacts={contacts.data ?? []} onClose={() => setActiveNote(null)} onChanged={async () => { await Promise.all([client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }), client.invalidateQueries({ queryKey: apiQueryKeys.contacts }), client.invalidateQueries({ queryKey: apiQueryKeys.opportunities }), client.invalidateQueries({ queryKey: apiQueryKeys.portfolioItems }), client.invalidateQueries({ queryKey: apiQueryKeys.listings }), client.invalidateQueries({ queryKey: apiQueryKeys.todayOverview })]); }} /> : null}
  </div></AppShell>;
}
