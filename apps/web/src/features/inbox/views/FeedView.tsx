"use client";

import { useState } from "react";
import { Archive, Check, ChevronDown, ChevronUp, MapPin, Mic, Pin, RefreshCw, RotateCcw, Send, Shuffle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys, inboxItemKinds, type DailyTaskOutcome, type InboxItemKind, type InboxItemRecord, type TodayTask } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { finishDailyTask, loadTodayOverview, replaceDailyTask } from "@/features/today/resources/today";
import { TaskResolutionSheet, taskDueLabel, taskRecordHref } from "@/features/today/components/TaskResolutionSheet";
import { changeInboxItem, createInboxNote, listInboxItems, retryInboxItem, undoInboxItem } from "../resources/inbox";
import { AppShell } from "@/shared/ui/AppShell";

const kindLabels: Record<InboxItemKind, string> = { note: "Not", person: "Kişi", property: "Mülk", requirement: "Talep", follow_up: "Takip" };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "İşlem tamamlanamadı.";

/** "İşlendi" claimed more than happened when the only applied action was a label. */
function statusLabel(item: InboxItemRecord): string {
  if (item.status === "queued") return "Kuyrukta";
  if (item.status === "needs_review") return "Kontrol gerekli";
  if (item.status === "failed") return "Başarısız";
  const created = item.appliedActions.find((action) => action.entityId !== null && action.undoneAt === null);
  return created ? created.label : "Sınıflandırıldı";
}

export function FeedView() {
  const { session } = useSession(); const client = useQueryClient(); const [text, setText] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TodayTask | null>(null); const [resolving, setResolving] = useState(false); const [taskError, setTaskError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); const [locationFor, setLocationFor] = useState<string | null>(null); const [locationText, setLocationText] = useState("");
  const today = useQuery({ queryKey: apiQueryKeys.todayOverviewPeriod("30d"), queryFn: () => loadTodayOverview("30d") });
  const inbox = useQuery({ queryKey: apiQueryKeys.inboxItems, queryFn: () => listInboxItems(session ?? undefined), enabled: Boolean(session) });
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
  async function update(inboxItemId: string, values: { kind?: InboxItemKind; pinned?: boolean; archived?: boolean }) { if (!session) return; try { await changeInboxItem(session, { inboxItemId, ...values }); await client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }); } catch (next) { setError(messageFrom(next)); } }
  async function retry(inboxItemId: string) { if (!session) return; try { await retryInboxItem(session, inboxItemId); await client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }); } catch (next) { setError(messageFrom(next)); } }
  async function addLocation(inboxItemId: string) { if (!session || locationText.trim().length < 2) return; try { await changeInboxItem(session, { inboxItemId, location: locationText.trim() }); setLocationFor(null); setLocationText(""); await client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }); } catch (next) { setError(messageFrom(next)); } }
  function toggleExpanded(id: string) { setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  async function undo(inboxItemId: string) { if (!session) return; try { await undoInboxItem(session, inboxItemId); await Promise.all([client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }), client.invalidateQueries({ queryKey: apiQueryKeys.contacts })]); } catch (next) { setError(messageFrom(next)); } }
  return <AppShell><div className="feed-view">
    <header className="feed-header"><div><p className="eyebrow">AKIŞ</p><h1>Bugün</h1><p className="context-sentence">Önce beş işini bitir; sonra duyduğun her şeyi tek cümleyle bırak.</p></div><button className="topbar-icon-button" onClick={() => void Promise.all([today.refetch(), inbox.refetch()])} aria-label="Yenile"><RefreshCw size={17} /></button></header>
    <section className="sp-card daily-five" aria-labelledby="daily-five-title"><div className="feed-section-heading"><div><p className="eyebrow">BUGÜNÜN 5&apos;İ</p><h2 id="daily-five-title">Önce bunları bitir</h2></div><span className="period-chip">{today.data?.completedTaskCount ?? 0}/{today.data?.tasks.length ?? 0}</span></div>{today.isPending ? <p className="context-sentence">Plan hazırlanıyor…</p> : today.data?.tasks.length ? <ol>{today.data.tasks.map((task) => <li key={task.id} className={task.resolutionStatus ? "resolved" : ""}><span className="daily-number">{task.resolutionStatus ? <Check size={15} /> : null}</span><Link className="daily-task-link" href={taskRecordHref(task)}><strong>{task.title}</strong><small>{task.reason} · {taskDueLabel(task.dueAt)}</small></Link>{task.resolutionStatus ? null : <span className="daily-actions"><button title="Bugünlük çıkar" aria-label={`${task.title} görevini bugünkü listeden çıkar`} onClick={() => void replace(task.id)}><Shuffle size={16} /></button><button title="Sonuçlandır" aria-label={`${task.title} görevini sonuçlandır`} onClick={() => { setTaskError(null); setActiveTask(task); }}><Check size={17} /></button></span>}</li>)}</ol> : <p className="context-sentence">Henüz planlanacak iş yok. İlk notunu veya kişini ekle.</p>}</section>
    <section className="sp-card quick-note" aria-labelledby="quick-note-title"><div className="feed-section-heading"><div><p className="eyebrow">HIZLI KAYIT</p><h2 id="quick-note-title">Aklındakini bırak</h2></div><Sparkles size={20} aria-hidden /></div><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Örn. Urla'da bahçeli bir ev duydum…" aria-label="Hızlı not" /><div className="quick-note-actions"><Link className="secondary-action" href="/capture"><Mic size={17} /> Sesli anlat</Link><button disabled={!text.trim() || saving} className="primary-action" onClick={() => void save()}><Send size={17} />{saving ? "Kaydediliyor…" : "Kaydet"}</button></div></section>
    {error ? <p className="form-error notice" role="alert">{error}</p> : null}
    <div className="feed-title"><h2>Notların</h2><p className="context-sentence">Yapay zekâ önerir, kontrol sende kalır.</p></div>
    {inbox.isPending ? <p className="context-sentence">Notlar yükleniyor…</p> : inbox.data?.length ? <section className="keep-grid" aria-label="Akış notları">{inbox.data.filter((item) => item.status !== "archived").map((item) => <article key={item.id} className={`sp-card keep-card kind-${item.kind}`}><div className="keep-meta"><select aria-label="Not türü" disabled={item.id.startsWith("queued-")} value={item.kind} onChange={(event) => void update(item.id, { kind: event.target.value as InboxItemKind })}>{inboxItemKinds.map((kind) => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}</select><small>{statusLabel(item)}</small></div><p>{expanded.has(item.id) ? item.safeText : item.summary}</p>{item.safeText !== item.summary ? <button className="text-button keep-expand" onClick={() => toggleExpanded(item.id)} type="button">{expanded.has(item.id) ? <><ChevronUp size={14} /> Kısalt</> : <><ChevronDown size={14} /> Tamamını göster</>}</button> : null}{item.needsLocation ? locationFor === item.id ? <form className="location-form" onSubmit={(event) => { event.preventDefault(); void addLocation(item.id); }}><input aria-label="Konum" autoFocus placeholder="Örn. Urla İskele" value={locationText} onChange={(event) => setLocationText(event.target.value)} /><button className="primary-action compact-action" disabled={locationText.trim().length < 2} type="submit">Ekle</button><button className="text-button" onClick={() => { setLocationFor(null); setLocationText(""); }} type="button">Vazgeç</button></form> : <button className="location-prompt" onClick={() => { setLocationFor(item.id); setLocationText(""); }} type="button"><MapPin size={16} /><span>Nerede? Konumu ekleyince eşleştirebilirim.</span></button> : null}{item.id.startsWith("queued-") ? null : <footer><button title={item.pinned ? "Sabitlemeyi kaldır" : "Sabitle"} aria-label={item.pinned ? "Sabitlemeyi kaldır" : "Sabitle"} onClick={() => void update(item.id, { pinned: !item.pinned })}><Pin size={16} fill={item.pinned ? "currentColor" : "none"} /></button>{item.status === "needs_review" || item.status === "failed" ? <button title="Tekrar dene" aria-label="Sınıflandırmayı tekrar dene" onClick={() => void retry(item.id)}><RefreshCw size={16} /></button> : null}{item.appliedActions.some((action) => action.undoneAt === null && action.entityId !== null) ? <button title="Oluşturulan kaydı geri al" aria-label="Oluşturulan kaydı geri al" onClick={() => void undo(item.id)}><RotateCcw size={16} /></button> : null}<button title="Arşivle" aria-label="Arşivle" onClick={() => void update(item.id, { archived: true })}><Archive size={16} /></button></footer>}</article>)}</section> : <div className="sp-card empty-state"><p>Henüz not yok. Bir cümle yazman yeterli.</p></div>}
    {activeTask ? <TaskResolutionSheet task={activeTask} pending={resolving} error={taskError} onClose={() => setActiveTask(null)} onResolve={(outcome) => void resolveTask(outcome)} /> : null}
  </div></AppShell>;
}
