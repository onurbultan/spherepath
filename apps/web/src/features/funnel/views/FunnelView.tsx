"use client";

import { useState } from "react";
import { ArrowRight, Target, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, contactSourceLabels, opportunityStageLabels, reportingPeriodLabels, reportingPeriods, type CurrencyCode, type FunnelOverview, type ReportingPeriod } from "@spherepath/shared";
import { loadFunnelOverview } from "../resources/funnel";
import { AppShell } from "@/shared/ui/AppShell";

function coachingHref(coaching: FunnelOverview["coaching"]): string {
  const routes = { capture: "/capture", contacts: "/contacts", opportunities: "/opportunities", listings: "/listings" } as const;
  const subject = coaching.subject;
  if (!subject) return routes[coaching.target];
  if (subject.kind === "opportunity") return `/opportunities?opportunityId=${encodeURIComponent(subject.id)}`;
  if (subject.kind === "contact") return `/contacts/__contact__?contactId=${encodeURIComponent(subject.id)}`;
  return "/listings";
}

/** stageDurations carries raw stage keys; the advisor should never see "new_lead". */
const stageName = (stage: string): string => (opportunityStageLabels as Record<string, string>)[stage] ?? stage;

const money = (amount: number, currency: CurrencyCode) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

export function FunnelView() {
  // A mandate or a closing rarely lands inside thirty days, so the shorter window
  // slices the chain mid-history and misreads it as a bottleneck.
  const [period, setPeriod] = useState<ReportingPeriod>("90d"); const query = useQuery({ queryKey: apiQueryKeys.funnelOverview(period), queryFn: () => loadFunnelOverview(period) });
  const counts = query.data?.counts;
  const stages = counts ? [
    { label: "Yeni insanlar", value: counts.newPeople, detail: "Tanıştığın kişiler", tone: "blue" },
    { label: "Talepler", value: counts.leads, detail: "Gayrimenkul ihtiyacı oluşanlar", tone: "green" },
    { label: "Randevular", value: counts.appointments, detail: counts.appointments ? `${counts.portfolioMeetings} portföy görüşmesi` : "Henüz randevu yok", tone: "warm" },
    { label: "Yetkili portföy", value: counts.authorizedListings, detail: counts.authorizedListings ? `${counts.negotiations} pazarlıkta` : "Henüz yetki alınmamış", tone: "red" },
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
  const earnings = query.data?.earnings; const target = query.data?.target; const metrics = query.data?.metrics;
  const percent = (value: number) => `%${Math.round(value * 100)}`;
  return <AppShell><div className="funnel-view">
    <header className="funnel-header"><div className="page-header"><p className="eyebrow">SATIŞ HUNİSİ</p><h1>Nerede takılıyor?</h1><p className="context-sentence">Sayıları değil, bir sonraki hamleni gör.</p></div><div className="funnel-periods" role="radiogroup" aria-label="Ölçüm dönemi">{reportingPeriods.map((item) => <button role="radio" aria-checked={period === item} className={period === item ? "selected" : ""} key={item} onClick={() => setPeriod(item)}>{reportingPeriodLabels[item]}</button>)}</div></header>
    {query.isPending ? <p className="context-sentence">Huni hazırlanıyor…</p> : query.error ? <p className="form-error notice">Huni yüklenemedi.</p> : <div className="funnel-workspace">
      <section className="sp-card earnings-card" aria-label="Dönem kazancı">
        <div className="earnings-heading"><div><p className="eyebrow">{reportingPeriodLabels[period].toLocaleUpperCase("tr-TR")} İÇİNDE</p><h2>Kazancın</h2></div>{target?.periodTarget !== null && target !== undefined ? <span className="earnings-target"><small>Portföy hedefi</small><strong>{target.achieved} / {target.periodTarget}</strong></span> : null}</div>
        {earnings && earnings.totals.length ? <div className="earnings-totals">{earnings.totals.map((total) => <div className="earnings-total" key={total.currency}><strong>{money(total.commission, total.currency)}</strong><small>{total.closedCount} kapanan işlem · {money(total.volume, total.currency)} hacim{total.commissionRate !== null ? ` · %${(total.commissionRate * 100).toFixed(1)} komisyon` : ""}</small></div>)}</div>
          : earnings && earnings.pipeline.length ? <div className="earnings-totals">{earnings.pipeline.map((entry) => <div className="earnings-total is-pipeline" key={entry.currency}><strong>{money(entry.amount, entry.currency)}</strong><small>{entry.count} işlem teklif veya sözleşme aşamasında · bu dönemde kapanış yok</small></div>)}</div>
          : <p className="context-sentence">Bu dönemde kapanan işlem ve açık teklif yok. Bir işlemi kapattığında komisyonun burada toplanır.</p>}
        {target?.periodTarget ? <div className="earnings-bar"><span style={{ width: `${Math.min(100, Math.round((target.ratio ?? 0) * 100))}%` }} /></div> : null}
        {earnings && earnings.incompleteCount > 0 ? <p className="form-error notice">{earnings.incompleteCount} kapanan işlemde tutar veya para birimi eksik; toplamlara katılmadı.</p> : null}
      </section>
      <div className="funnel-analysis">
      <section className="sp-card funnel-panel" aria-label="Satış hunisi"><div className="funnel-panel-heading"><div><p className="eyebrow">{reportingPeriodLabels[period].toLocaleUpperCase("tr-TR")}</p><h2>Beş adımda durumun</h2></div></div><div className="funnel-stage-list">{stages.map((stage, index) => {
        const previous = stages[index - 1]; const isBottleneck = index === bottleneckIndex;
        return <article key={stage.label} className={`funnel-stage tone-${stage.tone}${isBottleneck ? " is-bottleneck" : ""}`}><span className="funnel-step">{index + 1}</span><span className="funnel-stage-copy"><strong>{stage.label}</strong><small>{stage.detail}</small></span>{previous ? <span className="funnel-conversion"><small>Önceki adımdan</small><strong>{conversion(stage.value, previous.value)}</strong></span> : null}<span className="funnel-value">{stage.value}</span>{isBottleneck ? <span className="bottleneck-label"><TrendingDown size={15} /> Buraya geçemiyor</span> : null}</article>;
      })}</div></section>
      <section className="sp-card coaching-card"><div className="coaching-heading"><span className="coaching-icon"><Target size={21} /></span><div><p className="eyebrow">ŞİMDİKİ DARBOĞAZ</p><h2>{query.data?.coaching.title}</h2></div></div><p>{query.data?.coaching.explanation}</p><blockquote><small>Bir sonraki görüşmede söyle</small><strong>“{query.data?.coaching.script}”</strong></blockquote>{query.data?.coaching.subject ? <p className="coaching-subject"><strong>{query.data.coaching.subject.name}</strong><small>{query.data.coaching.subject.detail}</small></p> : null}{query.data ? <Link className="primary-action" href={coachingHref(query.data.coaching)}>{query.data.coaching.subject ? "Bu kaydı aç" : "Şimdi harekete geç"} <ArrowRight size={17} /></Link> : null}</section>
      </div>
      <section className="sp-card mirror-card" aria-label="Kendi aynan">
        <div className="feed-section-heading"><div><p className="eyebrow">KENDİ AYNAN</p><h2>Rakamların sana ne diyor</h2></div></div>
        {!metrics ? null : !metrics.sampleSufficient ? <p className="context-sentence">Henüz güvenilir bir sonuç çıkaracak kadar kayıt yok. Birkaç görüşme daha kaydettiğinde buradaki oranlar anlamlı olmaya başlar.</p> : <>
          <div className="mirror-tiles">
            {metrics.keptPromiseRate ? <div className="mirror-tile"><strong>{percent(metrics.keptPromiseRate.rate)}</strong><small>Tuttuğun söz<br />{metrics.keptPromiseRate.kept}/{metrics.keptPromiseRate.promised} takip</small></div> : null}
            {metrics.timeToWonDays !== null ? <div className="mirror-tile"><strong>{metrics.timeToWonDays} gün</strong><small>Kazanmaya kadar<br />geçen süre</small></div> : null}
            {metrics.stageDurations[0] ? <div className="mirror-tile"><strong>{metrics.stageDurations[0].medianDays} gün</strong><small>En yavaş aşama<br />{stageName(metrics.stageDurations[0].stage)}</small></div> : null}
            {metrics.reworkRate !== null ? <div className="mirror-tile"><strong>{percent(metrics.reworkRate)}</strong><small>Geri dönüş /<br />düzeltme oranı</small></div> : null}
          </div>
          <div className="mirror-lists">
            {metrics.askByObjective.length ? <div><p className="eyebrow">HANGİ TALEP TUTUYOR</p><ul>{metrics.askByObjective.slice(0, 3).map((entry) => <li key={entry.key}><span>{entry.label}</span><strong>{percent(entry.rate)}</strong><small>{entry.asked} talep</small></li>)}</ul></div> : null}
            {metrics.askByChannel.length ? <div><p className="eyebrow">HANGİ KANAL</p><ul>{metrics.askByChannel.slice(0, 3).map((entry) => <li key={entry.key}><span>{entry.label}</span><strong>{percent(entry.rate)}</strong><small>{entry.asked} talep</small></li>)}</ul></div> : null}
            {metrics.sourceReturns.length ? <div><p className="eyebrow">KAZANÇ NEREDEN GELDİ</p><ul>{metrics.sourceReturns.slice(0, 3).map((entry) => <li key={`${entry.source}-${entry.currency}`}><span>{contactSourceLabels[entry.source]}</span><strong>{money(entry.commission, entry.currency)}</strong><small>{entry.closedCount} işlem</small></li>)}</ul></div> : null}
            {metrics.lossReasons.length ? <div><p className="eyebrow">NEDEN KAYBEDİLDİ</p><ul>{metrics.lossReasons.slice(0, 3).map((entry) => <li key={entry.reason}><span>{entry.reason}</span><strong>{entry.count}</strong><small>fırsat</small></li>)}</ul></div> : null}
          </div>
        </>}
      </section>
    </div>}
  </div></AppShell>;
}
