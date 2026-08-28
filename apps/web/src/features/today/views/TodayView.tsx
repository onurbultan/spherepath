"use client";

import Link from "next/link";
import { CalendarCheck, RefreshCw, Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys } from "@spherepath/shared";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { loadTodayOverview } from "../resources/today";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Bugün görünümü yüklenemedi.";
}

export function TodayView() {
  const query = useQuery({ queryKey: apiQueryKeys.todayOverview, queryFn: loadTodayOverview });
  const overview = query.data;

  const stages = overview ? [
    { label: "Tanışma", value: overview.stages.acquaintance, detail: "Son 30 gün" },
    { label: "İlişki", value: overview.stages.relationship, detail: "Anlamlı temas" },
    { label: "Lead", value: overview.stages.lead, detail: "Açık fırsat" },
    { label: "Portföy", value: overview.stages.listing, detail: "Kazanılan" },
    { label: "Kapama", value: overview.stages.closing, detail: "Tamamlanan" },
  ] : [];
  const dateLabel = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" }).format(new Date()).toLocaleUpperCase("tr-TR");

  return (
    <AppShell>
      <header className="page-header today-header"><div><p className="eyebrow">BUGÜN · {dateLabel}</p><h1>Bugünün odağı</h1><p className="context-sentence">Gerçek kişi, temas ve fırsat kayıtlarından açıklanabilir bir çalışma planı.</p></div><button className="icon-action refresh-action" aria-label="Yenile" disabled={query.isFetching} onClick={() => void query.refetch()} type="button"><RefreshCw className={query.isFetching ? "spin" : ""} size={19} /></button></header>
      {query.error ? <p className="form-error notice" role="alert">{messageFrom(query.error)}</p> : null}
      {query.isPending && !overview ? <div className="content-state"><RefreshCw className="spin" size={22} aria-hidden /> Bugün görünümü hazırlanıyor…</div> : overview ? <>
        <section aria-labelledby="health-title" className="section-stack"><div className="section-heading"><div><p className="eyebrow">SATIŞ SİSTEMİ</p><h2 id="health-title">Beş aşamalı sağlık</h2></div><span className="period-chip">SON 30 GÜN</span></div><div className="stage-grid">{stages.map((stage) => <SpCard key={stage.label} className="stage-card"><span className="stage-label">{stage.label}</span><strong>{stage.value}</strong><span>{stage.detail}</span></SpCard>)}</div></section>
        <section className="two-column-grid">
          <SpCard className="focus-card"><div className="card-icon"><Target size={18} aria-hidden /></div><p className="eyebrow">DARBOĞAZ</p><h2>{overview.focus.title}</h2><p>{overview.focus.description}</p><Link href="/capture" className="primary-action inline-link">Temas kaydet</Link></SpCard>
          <SpCard><div className="card-icon secondary"><CalendarCheck size={18} aria-hidden /></div><p className="eyebrow">GÜNLÜK PLAN</p><h2>{overview.tasks.length ? `${overview.tasks.length} öncelikli iş` : "Bugün için görev yok"}</h2><p>Plan açıklanabilir sinyallerden üretilir ve en fazla beş eylem gösterir.</p>{overview.tasks.length ? <ul className="today-task-list">{overview.tasks.map((task) => <li key={task.id}><Link href="/capture"><strong>{task.title}</strong><span>{task.reason}{task.dueAt ? ` · ${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(task.dueAt)}` : ""}</span></Link></li>)}</ul> : null}</SpCard>
        </section>
      </> : null}
    </AppShell>
  );
}
