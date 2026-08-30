"use client";

import { useState } from "react";
import { ArrowRight, Target, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, reportingPeriodLabels, reportingPeriods, type ReportingPeriod } from "@spherepath/shared";
import { loadFunnelOverview } from "../resources/funnel";
import { AppShell } from "@/shared/ui/AppShell";

export function FunnelView() {
  const [period, setPeriod] = useState<ReportingPeriod>("30d"); const query = useQuery({ queryKey: apiQueryKeys.funnelOverview(period), queryFn: () => loadFunnelOverview(period) });
  const routes = { capture: "/capture", contacts: "/contacts", opportunities: "/opportunities", listings: "/listings" } as const;
  const counts = query.data?.counts;
  const stages = counts ? [
    { label: "Yeni insanlar", value: counts.newPeople, detail: "Tanıştığın kişiler", tone: "blue" },
    { label: "Talepler", value: counts.leads, detail: "Gayrimenkul ihtiyacı oluşanlar", tone: "green" },
    { label: "Randevular", value: counts.appointments, detail: `${counts.portfolioMeetings} portföy görüşmesi`, tone: "warm" },
    { label: "Yetkili portföy", value: counts.authorizedListings, detail: `${counts.negotiations} pazarlıkta`, tone: "red" },
    { label: "Kapanışlar", value: counts.closings, detail: "Tamamlanan işlemler", tone: "green" },
  ] : [];
  const bottleneckIndex = counts
    ? counts.newPeople < 5 && counts.leads === 0 ? 0
      : counts.newPeople > 0 && counts.leads === 0 ? 1
        : counts.leads > 0 && counts.appointments === 0 ? 2
          : counts.appointments > 0 && counts.authorizedListings === 0 ? 3
            : counts.authorizedListings > 0 && counts.closings === 0 ? 4
              : null
    : null;
  const conversion = (current: number, previous: number) => previous > 0 ? `%${Math.round((current / previous) * 100)}` : "—";
  return <AppShell><div className="funnel-view">
    <header className="funnel-header"><div className="page-header"><p className="eyebrow">SATIŞ HUNİSİ</p><h1>Nerede takılıyor?</h1><p className="context-sentence">Sayıları değil, bir sonraki hamleni gör.</p></div><div className="funnel-periods" role="radiogroup" aria-label="Ölçüm dönemi">{reportingPeriods.map((item) => <button role="radio" aria-checked={period === item} className={period === item ? "selected" : ""} key={item} onClick={() => setPeriod(item)}>{reportingPeriodLabels[item]}</button>)}</div></header>
    {query.isPending ? <p className="context-sentence">Huni hazırlanıyor…</p> : query.error ? <p className="form-error notice">Huni yüklenemedi.</p> : <div className="funnel-workspace">
      <section className="sp-card funnel-panel" aria-label="Satış hunisi"><div className="funnel-panel-heading"><div><p className="eyebrow">{reportingPeriodLabels[period].toLocaleUpperCase("tr-TR")}</p><h2>Beş adımda durumun</h2></div><span>{stages.reduce((total, stage) => total + stage.value, 0)} hareket</span></div><div className="funnel-stage-list">{stages.map((stage, index) => {
        const previous = stages[index - 1]; const isBottleneck = index === bottleneckIndex;
        return <article key={stage.label} className={`funnel-stage tone-${stage.tone}${isBottleneck ? " is-bottleneck" : ""}`}><span className="funnel-step">{index + 1}</span><span className="funnel-stage-copy"><strong>{stage.label}</strong><small>{stage.detail}</small></span>{previous ? <span className="funnel-conversion"><small>Önceki adımdan</small><strong>{conversion(stage.value, previous.value)}</strong></span> : null}<span className="funnel-value">{stage.value}</span>{isBottleneck ? <span className="bottleneck-label"><TrendingDown size={15} /> Burada duruyor</span> : null}</article>;
      })}</div></section>
      <section className="sp-card coaching-card"><div className="coaching-heading"><span className="coaching-icon"><Target size={21} /></span><div><p className="eyebrow">ŞİMDİKİ DARBOĞAZ</p><h2>{query.data?.coaching.title}</h2></div></div><p>{query.data?.coaching.explanation}</p><blockquote><small>Bir sonraki görüşmede söyle</small><strong>“{query.data?.coaching.script}”</strong></blockquote>{query.data ? <Link className="primary-action" href={routes[query.data.coaching.target]}>Şimdi harekete geç <ArrowRight size={17} /></Link> : null}</section>
    </div>}
  </div></AppShell>;
}
