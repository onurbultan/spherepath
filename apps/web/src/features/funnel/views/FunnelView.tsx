"use client";

import { useState } from "react";
import { ArrowRight, Target } from "lucide-react";
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
    { label: "Yeni insanla tanıştın", value: String(counts.newPeople), tone: "blue" },
    { label: "Talep aldın", value: String(counts.leads), tone: "green" },
    { label: `${counts.portfolioMeetings} portföy görüşmesi`, value: `${counts.appointments} randevu`, tone: "warm" },
    { label: `${counts.negotiations} pazarlıkta`, value: `${counts.authorizedListings} yetkili portföy`, tone: "red" },
    { label: "Kapanış", value: String(counts.closings), tone: "green" },
  ] : [];
  return <AppShell><div className="funnel-view"><header className="page-header"><p className="eyebrow">SATIŞ HUNİSİ</p><h1>Nerede takılıyor?</h1><p className="context-sentence">Rakamı gör, doğru cümleyi al ve bir sonraki adımı aç.</p></header><div className="funnel-periods" role="radiogroup" aria-label="Ölçüm dönemi">{reportingPeriods.map((item) => <button role="radio" aria-checked={period === item} className={period === item ? "selected" : ""} key={item} onClick={() => setPeriod(item)}>{reportingPeriodLabels[item]}</button>)}</div>{query.isPending ? <p className="context-sentence">Huni hazırlanıyor…</p> : query.error ? <p className="form-error notice">Huni yüklenemedi.</p> : <><section className="funnel-stack" aria-label="Satış hunisi">{stages.map((stage, index) => <article key={stage.label} className={`funnel-stage tone-${stage.tone}`} style={{ width: `${100 - index * 9}%` }}><strong>{stage.value}</strong><span>{stage.label}</span></article>)}</section><section className="sp-card coaching-card"><span className="coaching-icon"><Target size={21} /></span><p className="eyebrow">ŞİMDİKİ DARBOĞAZ</p><h2>{query.data?.coaching.title}</h2><p>{query.data?.coaching.explanation}</p><blockquote><small>Söyleyebileceğin cümle</small>“{query.data?.coaching.script}”</blockquote>{query.data ? <Link className="primary-action" href={routes[query.data.coaching.target]}>İlgili kayıtları aç <ArrowRight size={17} /></Link> : null}</section></>}</div></AppShell>;
}
