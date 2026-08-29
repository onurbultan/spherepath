"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarCheck, CalendarClock, Check, CircleSlash, MessagesSquare, RefreshCw, Target, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys, dailyTaskOutcomeSchema, nextActionTypeLabels, nextActionTypes, reportingPeriodLabels, reportingPeriods, type DailyTaskOutcome, type ReportingPeriod, type TodayTask } from "@spherepath/shared";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
import { QuickDateField } from "@/shared/ui/QuickDateField";
import { finishDailyTask, loadTodayOverview } from "../resources/today";
import { useSession } from "@/features/auth/resources/session";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Bugün görünümü yüklenemedi.";
}

function percent(value: number, previous: number): number {
  return previous > 0 ? Math.min(100, Math.round((value / previous) * 100)) : value > 0 ? 100 : 0;
}

function dueLabel(value: number | null): string {
  if (value === null) return "Tarihsiz";
  const due = new Date(value);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (due.toDateString() === yesterday.toDateString()) return `Gecikti · dün ${new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(due)}`;
  if (due.toDateString() === now.toDateString()) return `Bugün ${new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(due)}`;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(due);
}

function tomorrowAtTen(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function TodayView() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<ReportingPeriod>("30d");
  const [showAllTasks, setShowAllTasks] = useState(false);
  const query = useQuery({ queryKey: apiQueryKeys.todayOverviewPeriod(period), queryFn: () => loadTodayOverview(period) });
  const fullOverview = query.data;
  const overview = fullOverview ? { ...fullOverview, tasks: showAllTasks ? fullOverview.tasks : fullOverview.tasks.slice(0, 5) } : undefined;
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskSuccess, setTaskSuccess] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TodayTask | null>(null);
  const [taskResolution, setTaskResolution] = useState<DailyTaskOutcome["status"]>("completed");
  const [resolutionNote, setResolutionNote] = useState("");
  const [rescheduledAt, setRescheduledAt] = useState(tomorrowAtTen);
  const [rescheduledActionType, setRescheduledActionType] = useState<NonNullable<DailyTaskOutcome["rescheduledActionType"]>>("call");

  useSheetDismiss(Boolean(activeTask), () => { if (!completingTaskId) setActiveTask(null); });

  const stages = overview ? [
    { label: "Tanışma", value: overview.stages.acquaintance, detail: `Son ${reportingPeriodLabels[period].toLocaleLowerCase("tr-TR")} içinde eklenen kişi`, tone: "cool", progress: 100 },
    { label: "İlişki", value: overview.stages.relationship, detail: `Anlamlı teması olan kişi · %${percent(overview.stages.relationship, overview.stages.acquaintance)}`, tone: "deed", progress: percent(overview.stages.relationship, overview.stages.acquaintance) },
    { label: "Talep", value: overview.stages.lead, detail: `Açık talep · %${percent(overview.stages.lead, overview.stages.relationship)}`, tone: "warm", progress: percent(overview.stages.lead, overview.stages.relationship) },
    { label: "Portföy", value: overview.stages.listing, detail: `Aktif ve rezerve · %${percent(overview.stages.listing, overview.stages.lead)}`, tone: "good", progress: percent(overview.stages.listing, overview.stages.lead) },
    { label: "Kapama", value: overview.stages.closing, detail: `Kapanan işlem · %${percent(overview.stages.closing, overview.stages.listing)}`, tone: "ink", progress: percent(overview.stages.closing, overview.stages.listing) },
  ] : [];
  const dateLabel = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long" }).format(new Date());
  const totalTasks = (fullOverview?.tasks.length ?? 0) + (overview?.completedTaskCount ?? 0);
  const taskProgress = totalTasks ? Math.min(100, Math.round(((overview?.completedTaskCount ?? 0) / totalTasks) * 100)) : 0;
  const focusHref = overview?.focus.targetOpportunityId
    ? `/opportunities?opportunityId=${encodeURIComponent(overview.focus.targetOpportunityId)}`
    : overview?.focus.targetContactId
      ? `/capture?contactId=${encodeURIComponent(overview.focus.targetContactId)}`
      : overview?.stages.acquaintance === 0
        ? "/contacts"
        : "/opportunities";

  function openTaskResolution(task: TodayTask) {
    setActiveTask(task);
    setTaskResolution("completed");
    setResolutionNote("");
    setRescheduledAt(tomorrowAtTen());
    setRescheduledActionType("call");
    setTaskError(null);
    setTaskSuccess(null);
  }

  async function resolveTask() {
    if (!session || !activeTask || completingTaskId) return;
    const parsed = dailyTaskOutcomeSchema.safeParse({
      taskId: activeTask.id,
      status: taskResolution,
      outcomeNote: taskResolution === "completed" ? resolutionNote.trim() || null : null,
      skippedReason: taskResolution === "skipped" ? resolutionNote.trim() || null : null,
      rescheduledAt: taskResolution === "rescheduled" && rescheduledAt ? new Date(rescheduledAt).getTime() : null,
      rescheduledActionType: taskResolution === "rescheduled" ? rescheduledActionType : null,
    });
    if (!parsed.success) {
      setTaskError(parsed.error.issues[0]?.message ?? "Görev sonucunu kontrol edin.");
      return;
    }
    setCompletingTaskId(activeTask.id);
    setTaskError(null);
    try {
      await finishDailyTask(session, parsed.data);
      await queryClient.refetchQueries({ queryKey: apiQueryKeys.todayOverview, type: "active" });
      setTaskSuccess(taskResolution === "rescheduled" ? "Görev yeni tarihe ertelendi." : taskResolution === "skipped" ? "Görev atlandı ve nedeni kaydedildi." : "Görev tamamlandı.");
      setActiveTask(null);
    } catch (error) {
      setTaskError(messageFrom(error));
    } finally {
      setCompletingTaskId(null);
    }
  }

  return (
    <AppShell>
      <div className="today-layout">
        <header className="page-header today-header">
          <div><p className="eyebrow">BUGÜN · {dateLabel}</p><h1>Bugünün odağı</h1><p className="context-sentence">Gerçek kişi, temas ve fırsat kayıtlarından üretilen açıklanabilir bir çalışma planı.</p></div>
          <div className="today-header-actions">
            <div className="segmented-control" aria-label="Ölçüm dönemi">{reportingPeriods.map((item) => <button aria-pressed={period === item} className={period === item ? "selected" : ""} key={item} onClick={() => setPeriod(item)} type="button">{item === "1y" ? "Yıl" : reportingPeriodLabels[item]}</button>)}</div>
            <button className="topbar-icon-button" aria-label="Yenile" disabled={query.isFetching} onClick={() => void query.refetch()} type="button"><RefreshCw className={query.isFetching ? "spin" : ""} size={16} /></button>
          </div>
        </header>

        {query.error || taskError ? <p className="form-error notice" role="alert">{taskError ?? messageFrom(query.error)}</p> : null}
        {taskSuccess ? <p className="form-success notice" role="status">{taskSuccess}</p> : null}
        {query.isPending && !overview ? <div className="content-state"><RefreshCw className="spin" size={22} aria-hidden /> Bugün görünümü hazırlanıyor…</div> : overview ? <>
          <section aria-labelledby="health-title" className="today-health">
            <div className="inline-section-heading"><div><h2 id="health-title">İş akışının özeti</h2><span>seçilen dönemde tanışmadan kapamaya kadar ilerleme</span></div><Link href="/opportunities">Fırsatları aç</Link></div>
            <div className="stage-grid">{stages.map((stage) => <SpCard key={stage.label} className={`stage-card stage-tone-${stage.tone}`}><span className="stage-label">{stage.label}</span><strong>{stage.value}</strong><span>{stage.detail}</span><div className="stage-progress" aria-hidden><span style={{ width: `${stage.progress}%` }} /></div></SpCard>)}</div>
          </section>

          {fullOverview?.stages.acquaintance === 0 ? <SpCard className="onboarding-card"><div><p className="eyebrow">İLK GÜN KURULUMU</p><h2>Üç adımda günlük planını hazırla</h2></div><ol><li><Link href="/settings#advisor-profile"><strong>1. Bölgeni yaz</strong><span>Çalıştığın mahalleleri belirle</span></Link></li><li><Link href="/settings#advisor-profile"><strong>2. Aylık hedefini seç</strong><span>Portföy hedefini görünür kıl</span></Link></li><li><Link href="/contacts"><strong>3. İlk kişilerini ekle</strong><span>Plan gerçek ilişkilerinden oluşsun</span></Link></li></ol></SpCard> : null}

          <section className="today-primary-grid">
            <SpCard className="focus-card compact-focus-card">
              <div className="focus-heading"><div className="card-icon"><Target size={18} aria-hidden /></div><div><p className="eyebrow">BUGÜNÜN ODAĞI</p><h2>{overview.focus.title}</h2></div></div>
              <p>{overview.focus.description}</p>
              <details className="form-details"><summary>Bu öneri neden gösteriliyor?</summary><div className="focus-metrics"><div><span>Dayanak</span><strong>{overview.focus.evidence}</strong></div><div><span>Dönem</span><strong>Son {reportingPeriodLabels[period].toLocaleLowerCase("tr-TR")}</strong></div><div><span>Veri durumu</span><strong>{overview.focus.sampleSufficient ? "Yeterli" : "Daha fazla kayıtla gelişecek"}</strong></div></div></details>
              <div className="recommended-action"><div><span>Önerilen eylem</span><strong>{overview.focus.action}</strong></div><Link href={focusHref} className="primary-action inline-link">İlgili kaydı aç <ArrowRight size={15} /></Link></div>
            </SpCard>

            <SpCard className="daily-plan-card">
              <div className="daily-plan-heading"><div className="card-icon secondary"><CalendarCheck size={18} aria-hidden /></div><div><p className="eyebrow">GÜNLÜK PLAN</p><h2>{overview.tasks.length ? `${overview.tasks.length} öncelikli iş` : "Bugün için görev yok"}</h2></div><div className="daily-plan-progress"><span>{overview.completedTaskCount} / {totalTasks || 0} sonuçlandı</span><div><span style={{ width: `${taskProgress}%` }} /></div></div></div>
              {overview.tasks.length ? <ul className="today-task-list">{overview.tasks.map((task) => <li className={`task-priority-${task.priority}`} key={task.id}><span className="task-priority-dot" aria-hidden /><Link href={task.opportunityId ? `/opportunities?opportunityId=${encodeURIComponent(task.opportunityId)}` : `/capture?contactId=${encodeURIComponent(task.contactId)}`}><strong>{task.title}</strong><span>{task.reason}</span></Link><time>{dueLabel(task.dueAt)}</time><button aria-label={`${task.title} görevini sonuçlandır`} disabled={completingTaskId !== null} onClick={() => openTaskResolution(task)} title="Sonuçlandır" type="button"><Check size={15} /> <span className="task-button-label">{completingTaskId === task.id ? "…" : "Sonuçlandır"}</span></button></li>)}</ul> : <div className="today-plan-empty"><Check size={20} /><span>Bugünün planı sonuçlandı.</span></div>}
              <div className="daily-plan-footer"><span>Plan kayıtlı sonraki adımlardan üretilir.</span>{(fullOverview?.tasks.length ?? 0) > 5 ? <button className="text-button" type="button" onClick={() => setShowAllTasks((value) => !value)}>{showAllTasks ? "İlk 5 işi göster" : `Tüm ${fullOverview!.tasks.length} işi göster`}</button> : null}</div>
            </SpCard>
          </section>

          <section className="section-stack today-interactions" aria-labelledby="today-interactions-title">
            <div className="section-heading"><div><p className="eyebrow">GÜNÜN HAFIZASI</p><h2 id="today-interactions-title">Bugün kaydedilen temaslar</h2></div><span className="period-chip">{overview.recentInteractions.length} TEMAS</span></div>
            <SpCard>{overview.recentInteractions.length ? <ul className="today-interaction-list">{overview.recentInteractions.map((interaction) => <li key={interaction.id}><Link href={`/capture?contactId=${encodeURIComponent(interaction.contactId)}`}><span className="today-interaction-icon"><MessagesSquare size={17} aria-hidden /></span><span><strong>{interaction.contactName}</strong><small>{interaction.outcome}</small></span><time>{new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(interaction.occurredAt)}</time></Link></li>)}</ul> : <div className="today-interactions-empty"><MessagesSquare size={22} aria-hidden /><p>Bugün henüz bir temas kaydedilmedi.</p><Link href="/capture" className="secondary-action inline-link">İlk teması kaydet</Link></div>}</SpCard>
          </section>
        </> : null}
      </div>
      {activeTask ? (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !completingTaskId) setActiveTask(null); }}>
          <form className="form-sheet task-resolution-sheet" role="dialog" aria-modal="true" aria-labelledby="task-resolution-title" onSubmit={(event) => { event.preventDefault(); void resolveTask(); }}>
            <div className="sheet-heading">
              <div><p className="eyebrow">GÖREV SONUCU</p><h2 id="task-resolution-title">{activeTask.title}</h2><span className="sheet-subtitle">{activeTask.reason} · {dueLabel(activeTask.dueAt)}</span></div>
              <button className="icon-action" aria-label="Kapat" disabled={Boolean(completingTaskId)} onClick={() => setActiveTask(null)} type="button"><X size={20} /></button>
            </div>
            <div className="task-resolution-choices" role="group" aria-label="Görev sonucu">
              <button className={taskResolution === "completed" ? "selected" : ""} onClick={() => { setTaskResolution("completed"); setResolutionNote(""); }} type="button"><Check size={17} /><span><strong>Tamamlandı</strong><small>Bu aksiyonu kapat</small></span></button>
              <button className={taskResolution === "rescheduled" ? "selected" : ""} onClick={() => { setTaskResolution("rescheduled"); setResolutionNote(""); }} type="button"><CalendarClock size={17} /><span><strong>Ertele</strong><small>Yeni tarih ve aksiyon belirle</small></span></button>
              <button className={taskResolution === "skipped" ? "selected" : ""} onClick={() => { setTaskResolution("skipped"); setResolutionNote(""); }} type="button"><CircleSlash size={17} /><span><strong>Atla</strong><small>Nedenini kaydet</small></span></button>
            </div>
            {taskResolution === "rescheduled" ? (
              <div className="form-stack"><label>Yeni aksiyon<select value={rescheduledActionType} onChange={(event) => setRescheduledActionType(event.target.value as NonNullable<DailyTaskOutcome["rescheduledActionType"]>)}>{nextActionTypes.map((item) => <option key={item} value={item}>{nextActionTypeLabels[item]}</option>)}</select></label><QuickDateField label="Yeni tarih" value={rescheduledAt} onChange={setRescheduledAt} /></div>
            ) : (
              <label>{taskResolution === "skipped" ? "Neden atlanıyor?" : "Kısa sonuç"} <span className="optional">{taskResolution === "completed" ? "isteğe bağlı" : ""}</span><textarea required={taskResolution === "skipped"} value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder={taskResolution === "skipped" ? "Örn. Kişi artık aranmamasını istedi." : "Örn. Görüşüldü, teklif cuma günü paylaşılacak."} /></label>
            )}
            {taskError ? <p className="form-error" role="alert">{taskError}</p> : null}
            <div className="task-resolution-actions">
              <Link className="secondary-action inline-link" href={`/capture?contactId=${encodeURIComponent(activeTask.contactId)}`}>Teması ayrıntılı kaydet</Link>
              <button className="primary-action inline-action" disabled={Boolean(completingTaskId)} type="submit">{completingTaskId ? "Kaydediliyor…" : taskResolution === "rescheduled" ? "Yeni tarihe ertele" : "Sonucu kaydet"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}
