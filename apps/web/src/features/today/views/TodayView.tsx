"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarCheck, Check, MessagesSquare, PhoneOff, RefreshCw, Target } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys, dailyTaskResolutionLabels, reportingPeriodLabels, reportingPeriods, type DailyTaskOutcome, type ReportingPeriod, type TodayTask } from "@spherepath/shared";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { TaskResolutionSheet, taskDueLabel as dueLabel } from "../components/TaskResolutionSheet";
import { finishDailyTask, loadTodayOverview } from "../resources/today";
import { useSession } from "@/features/auth/resources/session";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Bugün görünümü yüklenemedi.";
}

function percent(value: number, previous: number): number {
  return previous > 0 ? Math.min(100, Math.round((value / previous) * 100)) : value > 0 ? 100 : 0;
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

  const stages = overview ? [
    { label: "Tanışma", value: overview.stages.acquaintance, detail: `Son ${reportingPeriodLabels[period].toLocaleLowerCase("tr-TR")} içinde eklenen kişi`, tone: "cool", progress: 100 },
    { label: "İlişki", value: overview.stages.relationship, detail: `Anlamlı teması olan kişi · %${percent(overview.stages.relationship, overview.stages.acquaintance)}`, tone: "deed", progress: percent(overview.stages.relationship, overview.stages.acquaintance) },
    { label: "Talep", value: overview.stages.lead, detail: `Açık talep · %${percent(overview.stages.lead, overview.stages.relationship)}`, tone: "warm", progress: percent(overview.stages.lead, overview.stages.relationship) },
    { label: "Portföy", value: overview.stages.listing, detail: `Aktif ve rezerve · %${percent(overview.stages.listing, overview.stages.lead)}`, tone: "good", progress: percent(overview.stages.listing, overview.stages.lead) },
    { label: "Kapama", value: overview.stages.closing, detail: `Kapanan işlem · %${percent(overview.stages.closing, overview.stages.listing)}`, tone: "ink", progress: percent(overview.stages.closing, overview.stages.listing) },
  ] : [];
  const dateLabel = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long" }).format(new Date());
  const totalTasks = fullOverview?.tasks.length ?? 0;
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
    setTaskError(null);
    setTaskSuccess(null);
  }

  async function resolveTask(outcome: DailyTaskOutcome) {
    if (!session || !activeTask || completingTaskId) return;
    setCompletingTaskId(activeTask.id);
    setTaskError(null);
    try {
      await finishDailyTask(session, outcome);
      await queryClient.refetchQueries({ queryKey: apiQueryKeys.todayOverview, type: "active" });
      setTaskSuccess(outcome.status === "rescheduled" ? "Görev yeni tarihe ertelendi." : outcome.status === "contact_opt_out" ? "İletişim tercihi kaydedildi; gelecek iletişimler kapatıldı." : outcome.status === "skipped" ? "Görev atlandı ve nedeni kaydedildi." : "Görev tamamlandı.");
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
              {overview.tasks.length ? <ul className="today-task-list">{overview.tasks.map((task) => <li className={`task-priority-${task.priority}${task.resolutionStatus ? ` resolved resolution-${task.resolutionStatus}` : ""}`} key={task.id}><span className="task-priority-dot" aria-hidden /><Link href={task.opportunityId && !task.resolutionStatus ? `/opportunities?opportunityId=${encodeURIComponent(task.opportunityId)}` : `/contacts/__contact__?contactId=${encodeURIComponent(task.contactId)}`}><strong>{task.title}</strong><span>{task.resolutionStatus ? `${dailyTaskResolutionLabels[task.resolutionStatus]}${task.resolutionNote ? ` · ${task.resolutionNote}` : ""}` : task.reason}</span></Link><time>{task.resolutionStatus ? dailyTaskResolutionLabels[task.resolutionStatus] : dueLabel(task.dueAt)}</time>{task.resolutionStatus ? <span className="task-resolution-mark">{task.resolutionStatus === "contact_opt_out" ? <PhoneOff size={15} /> : <Check size={15} />}</span> : <button aria-label={`${task.title} görevini sonuçlandır`} disabled={completingTaskId !== null} onClick={() => openTaskResolution(task)} title="Sonuçlandır" type="button"><Check size={15} /> <span className="task-button-label">{completingTaskId === task.id ? "…" : "Sonuçlandır"}</span></button>}</li>)}</ul> : <div className="today-plan-empty"><Check size={20} /><span>Bugünün planı sonuçlandı.</span></div>}
              <div className="daily-plan-footer"><span>Plan kayıtlı sonraki adımlardan üretilir.</span>{(fullOverview?.tasks.length ?? 0) > 5 ? <button className="text-button" type="button" onClick={() => setShowAllTasks((value) => !value)}>{showAllTasks ? "İlk 5 işi göster" : `Tüm ${fullOverview!.tasks.length} işi göster`}</button> : null}</div>
            </SpCard>
          </section>

          <section className="section-stack today-interactions" aria-labelledby="today-interactions-title">
            <div className="section-heading"><div><p className="eyebrow">GÜNÜN HAFIZASI</p><h2 id="today-interactions-title">Bugün kaydedilen temaslar</h2></div><span className="period-chip">{overview.recentInteractions.length} TEMAS</span></div>
            <SpCard>{overview.recentInteractions.length ? <ul className="today-interaction-list">{overview.recentInteractions.map((interaction) => <li key={interaction.id}><Link href={`/capture?contactId=${encodeURIComponent(interaction.contactId)}`}><span className="today-interaction-icon"><MessagesSquare size={17} aria-hidden /></span><span><strong>{interaction.contactName}</strong><small>{interaction.outcome}</small></span><time>{new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(interaction.occurredAt)}</time></Link></li>)}</ul> : <div className="today-interactions-empty"><MessagesSquare size={22} aria-hidden /><p>Bugün henüz bir temas kaydedilmedi.</p><Link href="/capture" className="secondary-action inline-link">İlk teması kaydet</Link></div>}</SpCard>
          </section>
        </> : null}
      </div>
      {activeTask ? <TaskResolutionSheet task={activeTask} pending={Boolean(completingTaskId)} error={taskError} onClose={() => setActiveTask(null)} onResolve={(outcome) => void resolveTask(outcome)} /> : null}
    </AppShell>
  );
}
