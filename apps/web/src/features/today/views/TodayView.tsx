"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarCheck, Check, MessagesSquare, RefreshCw, Target } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys } from "@spherepath/shared";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
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

export function TodayView() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: apiQueryKeys.todayOverview, queryFn: loadTodayOverview });
  const overview = query.data;
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  const stages = overview ? [
    { label: "Tanışma", value: overview.stages.acquaintance, detail: "Son 30 günde eklenen kişi", tone: "cool", progress: 100 },
    { label: "İlişki", value: overview.stages.relationship, detail: `Anlamlı teması olan kişi · %${percent(overview.stages.relationship, overview.stages.acquaintance)}`, tone: "deed", progress: percent(overview.stages.relationship, overview.stages.acquaintance) },
    { label: "Lead", value: overview.stages.lead, detail: `Açık fırsat · %${percent(overview.stages.lead, overview.stages.relationship)}`, tone: "warm", progress: percent(overview.stages.lead, overview.stages.relationship) },
    { label: "Portföy", value: overview.stages.listing, detail: `Aktif ve rezerve · %${percent(overview.stages.listing, overview.stages.lead)}`, tone: "good", progress: percent(overview.stages.listing, overview.stages.lead) },
    { label: "Kapama", value: overview.stages.closing, detail: `Kapanan işlem · %${percent(overview.stages.closing, overview.stages.listing)}`, tone: "ink", progress: percent(overview.stages.closing, overview.stages.listing) },
  ] : [];
  const dateLabel = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long" }).format(new Date());
  const totalTasks = (overview?.tasks.length ?? 0) + (overview?.completedTaskCount ?? 0);
  const taskProgress = totalTasks ? Math.min(100, Math.round(((overview?.completedTaskCount ?? 0) / totalTasks) * 100)) : 0;

  async function complete(taskId: string) {
    if (!session || completingTaskId) return;
    setCompletingTaskId(taskId);
    setTaskError(null);
    try {
      await finishDailyTask(session, { taskId, status: "completed", skippedReason: null });
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview });
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
            <div className="segmented-control" aria-label="Ölçüm dönemi"><button className="selected" type="button">30 gün</button><button disabled title="90 günlük karşılaştırma verisi henüz üretilmiyor" type="button">90 gün</button><button disabled title="Yıllık karşılaştırma verisi henüz üretilmiyor" type="button">Yıl</button></div>
            <button className="topbar-icon-button" aria-label="Yenile" disabled={query.isFetching} onClick={() => void query.refetch()} type="button"><RefreshCw className={query.isFetching ? "spin" : ""} size={16} /></button>
          </div>
        </header>

        {query.error || taskError ? <p className="form-error notice" role="alert">{taskError ?? messageFrom(query.error)}</p> : null}
        {query.isPending && !overview ? <div className="content-state"><RefreshCw className="spin" size={22} aria-hidden /> Bugün görünümü hazırlanıyor…</div> : overview ? <>
          <section aria-labelledby="health-title" className="today-health">
            <div className="inline-section-heading"><div><h2 id="health-title">Beş aşamalı sistem sağlığı</h2><span>tanışmadan kapamaya kadar hunideki gerçek hacim</span></div><Link href="/opportunities">Detaylı rapor</Link></div>
            <div className="stage-grid">{stages.map((stage) => <SpCard key={stage.label} className={`stage-card stage-tone-${stage.tone}`}><span className="stage-label">{stage.label}</span><strong>{stage.value}</strong><span>{stage.detail}</span><div className="stage-progress" aria-hidden><span style={{ width: `${stage.progress}%` }} /></div></SpCard>)}</div>
          </section>

          <section className="today-primary-grid">
            <SpCard className="focus-card compact-focus-card">
              <div className="focus-heading"><div className="card-icon"><Target size={18} aria-hidden /></div><div><p className="eyebrow">DARBOĞAZ TEŞHİSİ</p><h2>{overview.focus.title}</h2></div><span className="sample-chip">{overview.focus.sampleSufficient ? "Örneklem yeterli" : "Örneklem küçük"}</span></div>
              <p>{overview.focus.description}</p>
              <div className="focus-metrics"><div><span>Dayanak</span><strong>{overview.focus.evidence}</strong></div><div><span>Ölçüm penceresi</span><strong>Son 30 gün</strong></div><div><span>Veri güveni</span><strong>{overview.focus.sampleSufficient ? "Yeterli" : "Gelişiyor"}</strong></div></div>
              <div className="recommended-action"><div><span>Önerilen eylem</span><strong>{overview.focus.action}</strong></div><Link href="/opportunities" className="primary-action inline-link">Fırsatı aç <ArrowRight size={15} /></Link></div>
            </SpCard>

            <SpCard className="daily-plan-card">
              <div className="daily-plan-heading"><div className="card-icon secondary"><CalendarCheck size={18} aria-hidden /></div><div><p className="eyebrow">GÜNLÜK PLAN</p><h2>{overview.tasks.length ? `${overview.tasks.length} öncelikli iş` : "Bugün için görev yok"}</h2></div><div className="daily-plan-progress"><span>{overview.completedTaskCount} / {totalTasks || 0} tamam</span><div><span style={{ width: `${taskProgress}%` }} /></div></div></div>
              {overview.tasks.length ? <ul className="today-task-list">{overview.tasks.map((task) => <li className={`task-priority-${task.priority}`} key={task.id}><span className="task-priority-dot" aria-hidden /><Link href={task.opportunityId ? `/opportunities?opportunityId=${encodeURIComponent(task.opportunityId)}` : `/capture?contactId=${encodeURIComponent(task.contactId)}`}><strong>{task.title}</strong><span>{task.reason}</span></Link><time>{dueLabel(task.dueAt)}</time><button aria-label={`${task.title} görevini tamamla`} disabled={completingTaskId !== null} onClick={() => void complete(task.id)} title="Tamamla" type="button"><Check size={15} /> <span className="task-button-label">{completingTaskId === task.id ? "…" : "Tamamla"}</span></button></li>)}</ul> : <div className="today-plan-empty"><Check size={20} /><span>Bugünün planı tamamlandı.</span></div>}
              <div className="daily-plan-footer"><span>Plan açıklanabilir sinyallerden üretilir, en fazla beş eylem gösterir.</span></div>
            </SpCard>
          </section>

          <section className="section-stack today-interactions" aria-labelledby="today-interactions-title">
            <div className="section-heading"><div><p className="eyebrow">GÜNÜN HAFIZASI</p><h2 id="today-interactions-title">Bugün kaydedilen temaslar</h2></div><span className="period-chip">{overview.recentInteractions.length} TEMAS</span></div>
            <SpCard>{overview.recentInteractions.length ? <ul className="today-interaction-list">{overview.recentInteractions.map((interaction) => <li key={interaction.id}><Link href={`/capture?contactId=${encodeURIComponent(interaction.contactId)}`}><span className="today-interaction-icon"><MessagesSquare size={17} aria-hidden /></span><span><strong>{interaction.contactName}</strong><small>{interaction.outcome}</small></span><time>{new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(interaction.occurredAt)}</time></Link></li>)}</ul> : <div className="today-interactions-empty"><MessagesSquare size={22} aria-hidden /><p>Bugün henüz bir temas kaydedilmedi.</p><Link href="/capture" className="secondary-action inline-link">İlk teması kaydet</Link></div>}</SpCard>
          </section>
        </> : null}
      </div>
    </AppShell>
  );
}
