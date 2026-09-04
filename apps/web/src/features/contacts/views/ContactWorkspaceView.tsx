"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, BriefcaseBusiness, Building2, MessageSquarePlus, Pencil, ShieldCheck, UserRound } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys, contactRoleLabels, contactSourceLabels, nextActionTypeLabels, opportunityStageLabel, opportunityTypeLabels, type DailyTaskOutcome, type TodayTask } from "@spherepath/shared";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { listOpportunities } from "@/features/opportunities/resources/opportunities";
import { finishDailyTask } from "@/features/today/resources/today";
import { TaskResolutionSheet } from "@/features/today/components/TaskResolutionSheet";
import { useSession } from "@/features/auth/resources/session";
import { ContactCallButton } from "../components/ContactCallButton";
import { ContactCallHistory } from "../components/ContactCallHistory";
import { ContactInteractionTimeline } from "../components/ContactInteractionTimeline";
import { ContactMemoryHighlights } from "../components/ContactMemoryHighlights";
import { listContacts } from "../resources/contacts";

export function ContactWorkspaceView({ contactId }: { contactId: string }) {
  const [referenceTime] = useState(Date.now);
  const [tab, setTab] = useState<"timeline" | "memory" | "opportunities" | "privacy">("timeline");
  const [resolvingTask, setResolvingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const { session } = useSession();
  const queryClient = useQueryClient();
  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts });
  const opportunitiesQuery = useQuery({ queryKey: apiQueryKeys.opportunities, queryFn: listOpportunities });
  const contact = contactsQuery.data?.find((item) => item.id === contactId);
  const opportunities = (opportunitiesQuery.data ?? []).filter((item) => item.subjectContactId === contactId);
  // The card used to say "Belirlenmedi" while two opportunities underneath it
  // carried dated steps, so a contact with work waiting read as a contact with none.
  const nextStep = (() => {
    const own = contact?.relationship.nextActionType
      ? { id: `next-action-${contact.id}`, opportunityId: undefined, type: contact.relationship.nextActionType, at: contact.relationship.nextActionAt, fromOpportunity: false }
      : null;
    const fromOpportunities = opportunities
      .filter((item) => item.stage !== "won" && item.stage !== "lost" && item.nextActionType !== null)
      .map((item) => ({ id: `opportunity-action-${item.id}`, opportunityId: item.id, type: item.nextActionType!, at: item.nextActionAt, fromOpportunity: true }))
      .sort((left, right) => (left.at ?? Infinity) - (right.at ?? Infinity))[0] ?? null;
    if (!own) return fromOpportunities;
    if (!fromOpportunities) return own;
    return (own.at ?? Infinity) <= (fromOpportunities.at ?? Infinity) ? own : fromOpportunities;
  })();
  if (contactsQuery.isPending) return <AppShell><div className="content-state">Kişi hazırlanıyor…</div></AppShell>;
  if (!contact) return <AppShell><SpCard className="empty-state"><UserRound size={24} /><h2>Kişi bulunamadı</h2><Link className="secondary-action inline-link" href="/contacts">Kişilere dön</Link></SpCard></AppShell>;
  const name = contact.fullName ?? contact.label ?? "İsimsiz kişi";
  const ownerRole = contact.roles.some((role) => role === "seller" || role === "landlord");
  const demandRole = contact.roles.some((role) => role === "buyer" || role === "tenant" || role === "investor");
  const task: TodayTask | null = nextStep ? {
    id: nextStep.id,
    contactId: contact.id,
    opportunityId: nextStep.opportunityId,
    title: name,
    reason: nextActionTypeLabels[nextStep.type],
    dueAt: nextStep.at,
    type: "next_action",
    priority: nextStep.at !== null && nextStep.at < referenceTime ? "overdue" : nextStep.fromOpportunity ? "bottleneck" : "relationship",
    contactRoles: contact.roles,
    lastTouchAt: contact.relationship.lastTouchAt,
    opportunityType: nextStep.opportunityId ? opportunities.find((item) => item.id === nextStep.opportunityId)?.type : undefined,
    opportunityStage: nextStep.opportunityId ? opportunities.find((item) => item.id === nextStep.opportunityId)?.stage : undefined,
  } : null;
  async function resolveTask(outcome: DailyTaskOutcome) {
    if (!session) return;
    setResolvingTask(true); setTaskError(null);
    try {
      await finishDailyTask(session, outcome);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunities }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ]);
      setTaskOpen(false);
    } catch (error) { setTaskError(error instanceof Error ? error.message : "Görev güncellenemedi."); }
    finally { setResolvingTask(false); }
  }
  return <AppShell><header className="page-header contacts-header"><div><Link className="text-button inline-link" href="/contacts"><ArrowLeft size={15} /> Kişilere dön</Link><p className="eyebrow">KİŞİ ÇALIŞMA SAYFASI</p><h1>{name}</h1><p className="context-sentence">{(contact.roles.length ? contact.roles : ["unknown" as const]).map((role) => contactRoleLabels[role]).join(" · ")} · {contactSourceLabels[contact.source]} · {contact.phone ?? "Telefon eklenmedi"}</p>{contact.internalLabel ?? (contact.fullName ? contact.label : null) ? <p className="privacy-copy">İç etiket: {contact.internalLabel ?? contact.label}</p> : null}</div><div className="header-actions"><ContactCallButton contactId={contact.id} hasPhone={Boolean(contact.phone)} />{ownerRole ? <Link className="secondary-action inline-link" href={`/listings?action=add-listing&ownerContactId=${encodeURIComponent(contact.id)}`}><Building2 size={17} /> Yetkili portföy ekle</Link> : demandRole ? <Link className="secondary-action inline-link" href={`/opportunities?create=1&contactId=${encodeURIComponent(contact.id)}`}><BriefcaseBusiness size={17} /> Talep fırsatı aç</Link> : null}<Link className="secondary-action inline-link" href={`/contacts?contactId=${encodeURIComponent(contact.id)}&action=edit`}><Pencil size={17} /> Düzenle</Link><Link className="primary-action inline-link" href={`/capture?contactId=${encodeURIComponent(contact.id)}`}><MessageSquarePlus size={17} /> Temas kaydet</Link></div></header>
    <section className="contact-workspace-layout" aria-label="Kişi özeti ve çalışma alanı">
      <div className="contact-workspace-summary"><SpCard><span>Son görüşme</span><strong>{contact.relationship.lastTouchAt ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(contact.relationship.lastTouchAt) : "Henüz yok"}</strong></SpCard><SpCard><span>Sonraki adım</span><strong>{nextStep ? nextActionTypeLabels[nextStep.type] : "Belirlenmedi"}</strong>{nextStep?.at ? <small>{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(nextStep.at)}{nextStep.fromOpportunity ? " · fırsattan" : ""}</small> : null}{task ? <button className="text-button" onClick={() => { setTaskError(null); setTaskOpen(true); }} type="button">Tamamla veya ertele</button> : null}</SpCard><SpCard><span>Açık fırsat</span><strong>{opportunities.filter((item) => item.stage !== "won" && item.stage !== "lost").length}</strong></SpCard></div>
      <nav className="contact-workspace-tabs" aria-label="Kişi çalışma alanı"><button className={tab === "timeline" ? "selected" : ""} onClick={() => setTab("timeline")}>Görüşmeler</button><button className={tab === "memory" ? "selected" : ""} onClick={() => setTab("memory")}>Hafıza</button><button className={tab === "opportunities" ? "selected" : ""} onClick={() => setTab("opportunities")}>Fırsatlar</button><button className={tab === "privacy" ? "selected" : ""} onClick={() => setTab("privacy")}>İzinler</button></nav>
      {tab === "timeline" ? <><ContactCallHistory contactId={contact.id} /><SpCard><ContactInteractionTimeline contactId={contact.id} /></SpCard></> : null}
      {tab === "memory" ? <SpCard className="contact-workspace-panel"><h2>Hatırlanacaklar</h2>{contact.memory.keyThingsToRemember.length ? <ul>{contact.memory.keyThingsToRemember.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Henüz hatırlanacak bilgi yok.</p>}<h3>Gayrimenkul tercihleri</h3><ContactMemoryHighlights memory={contact.memory} /></SpCard> : null}
      {tab === "opportunities" ? <SpCard className="contact-workspace-panel"><h2>Fırsatlar</h2>{opportunities.length ? opportunities.map((item) => <Link className="contact-opportunity-row" key={item.id} href={`/opportunities?opportunityId=${encodeURIComponent(item.id)}`}><BriefcaseBusiness size={17} /><span><strong>{opportunityTypeLabels[item.type]}</strong><small>{opportunityStageLabel(item.stage, item.type)}</small></span></Link>) : <p>Bu kişi için fırsat yok.</p>}</SpCard> : null}
      {tab === "privacy" ? <SpCard className="contact-workspace-panel"><ShieldCheck size={22} /><h2>Aydınlatma ve iletişim izinleri</h2><p>{contact.privacy.noticeStatus === "completed" ? "Aydınlatma tamamlandı." : "Aydınlatma bekliyor."} {contact.privacy.marketingConsent === "granted" ? "Pazarlama izni var." : contact.privacy.marketingConsent === "withdrawn" ? "Kişi iletişim istemedi; pazarlama izni geri çekildi." : "Pazarlama izni bilinmiyor."}</p><Link className="secondary-action inline-link" href={`/contacts?contactId=${encodeURIComponent(contact.id)}&action=privacy`}>İzinleri düzenle</Link></SpCard> : null}
    </section>{taskOpen && task ? <TaskResolutionSheet task={task} pending={resolvingTask} error={taskError} onClose={() => setTaskOpen(false)} onResolve={(outcome) => void resolveTask(outcome)} /> : null}
  </AppShell>;
}
