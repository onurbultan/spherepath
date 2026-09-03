"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, BriefcaseBusiness, Building2, MessageSquarePlus, Pencil, ShieldCheck, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, contactRoleLabels, contactSourceLabels, nextActionTypeLabels, opportunityStageLabel, opportunityTypeLabels } from "@spherepath/shared";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { listOpportunities } from "@/features/opportunities/resources/opportunities";
import { ContactCallButton } from "../components/ContactCallButton";
import { ContactCallHistory } from "../components/ContactCallHistory";
import { ContactInteractionTimeline } from "../components/ContactInteractionTimeline";
import { ContactMemoryHighlights } from "../components/ContactMemoryHighlights";
import { listContacts } from "../resources/contacts";

export function ContactWorkspaceView({ contactId }: { contactId: string }) {
  const [tab, setTab] = useState<"timeline" | "memory" | "opportunities" | "privacy">("timeline");
  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts });
  const opportunitiesQuery = useQuery({ queryKey: apiQueryKeys.opportunities, queryFn: listOpportunities });
  const contact = contactsQuery.data?.find((item) => item.id === contactId);
  const opportunities = (opportunitiesQuery.data ?? []).filter((item) => item.subjectContactId === contactId);
  // The card used to say "Belirlenmedi" while two opportunities underneath it
  // carried dated steps, so a contact with work waiting read as a contact with none.
  const nextStep = (() => {
    const own = contact?.relationship.nextActionType
      ? { type: contact.relationship.nextActionType, at: contact.relationship.nextActionAt, fromOpportunity: false }
      : null;
    const fromOpportunities = opportunities
      .filter((item) => item.stage !== "won" && item.stage !== "lost" && item.nextActionType !== null)
      .map((item) => ({ type: item.nextActionType!, at: item.nextActionAt, fromOpportunity: true }))
      .sort((left, right) => (left.at ?? Infinity) - (right.at ?? Infinity))[0] ?? null;
    if (!own) return fromOpportunities;
    if (!fromOpportunities) return own;
    return (own.at ?? Infinity) <= (fromOpportunities.at ?? Infinity) ? own : fromOpportunities;
  })();
  if (contactsQuery.isPending) return <AppShell><div className="content-state">Kişi hazırlanıyor…</div></AppShell>;
  if (!contact) return <AppShell><SpCard className="empty-state"><UserRound size={24} /><h2>Kişi bulunamadı</h2><Link className="secondary-action inline-link" href="/contacts">Kişilere dön</Link></SpCard></AppShell>;
  const name = contact.fullName ?? contact.label ?? "İsimsiz kişi";
  return <AppShell><header className="page-header contacts-header"><div><Link className="text-button inline-link" href="/contacts"><ArrowLeft size={15} /> Kişilere dön</Link><p className="eyebrow">KİŞİ ÇALIŞMA SAYFASI</p><h1>{name}</h1><p className="context-sentence">{(contact.roles.length ? contact.roles : ["unknown" as const]).map((role) => contactRoleLabels[role]).join(" · ")} · {contactSourceLabels[contact.source]} · {contact.phone ?? "Telefon eklenmedi"}</p></div><div className="header-actions"><ContactCallButton contactId={contact.id} hasPhone={Boolean(contact.phone)} /><Link className="secondary-action inline-link" href={`/listings?action=add-listing&ownerContactId=${encodeURIComponent(contact.id)}`}><Building2 size={17} /> Yetkili portföy ekle</Link><Link className="secondary-action inline-link" href={`/contacts?contactId=${encodeURIComponent(contact.id)}&action=edit`}><Pencil size={17} /> Düzenle</Link><Link className="primary-action inline-link" href={`/capture?contactId=${encodeURIComponent(contact.id)}`}><MessageSquarePlus size={17} /> Temas kaydet</Link></div></header>
    <section className="contact-workspace-layout" aria-label="Kişi özeti ve çalışma alanı">
      <div className="contact-workspace-summary"><SpCard><span>Son görüşme</span><strong>{contact.relationship.lastTouchAt ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(contact.relationship.lastTouchAt) : "Henüz yok"}</strong></SpCard><SpCard><span>Sonraki adım</span><strong>{nextStep ? nextActionTypeLabels[nextStep.type] : "Belirlenmedi"}</strong>{nextStep?.at ? <small>{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(nextStep.at)}{nextStep.fromOpportunity ? " · fırsattan" : ""}</small> : null}</SpCard><SpCard><span>Açık fırsat</span><strong>{opportunities.filter((item) => item.stage !== "won" && item.stage !== "lost").length}</strong></SpCard></div>
      <nav className="contact-workspace-tabs" aria-label="Kişi çalışma alanı"><button className={tab === "timeline" ? "selected" : ""} onClick={() => setTab("timeline")}>Görüşmeler</button><button className={tab === "memory" ? "selected" : ""} onClick={() => setTab("memory")}>Hafıza</button><button className={tab === "opportunities" ? "selected" : ""} onClick={() => setTab("opportunities")}>Fırsatlar</button><button className={tab === "privacy" ? "selected" : ""} onClick={() => setTab("privacy")}>İzinler</button></nav>
      {tab === "timeline" ? <><ContactCallHistory contactId={contact.id} /><SpCard><ContactInteractionTimeline contactId={contact.id} /></SpCard></> : null}
      {tab === "memory" ? <SpCard className="contact-workspace-panel"><h2>Hatırlanacaklar</h2>{contact.memory.keyThingsToRemember.length ? <ul>{contact.memory.keyThingsToRemember.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Henüz hatırlanacak bilgi yok.</p>}<h3>Gayrimenkul tercihleri</h3><ContactMemoryHighlights memory={contact.memory} /></SpCard> : null}
      {tab === "opportunities" ? <SpCard className="contact-workspace-panel"><h2>Fırsatlar</h2>{opportunities.length ? opportunities.map((item) => <Link className="contact-opportunity-row" key={item.id} href={`/opportunities?opportunityId=${encodeURIComponent(item.id)}`}><BriefcaseBusiness size={17} /><span><strong>{opportunityTypeLabels[item.type]}</strong><small>{opportunityStageLabel(item.stage, item.type)}</small></span></Link>) : <p>Bu kişi için fırsat yok.</p>}</SpCard> : null}
      {tab === "privacy" ? <SpCard className="contact-workspace-panel"><ShieldCheck size={22} /><h2>Aydınlatma ve iletişim izinleri</h2><p>{contact.privacy.noticeStatus === "completed" ? "Aydınlatma tamamlandı." : "Aydınlatma bekliyor."} {contact.privacy.marketingConsent === "granted" ? "Pazarlama izni var." : contact.privacy.marketingConsent === "withdrawn" ? "Kişi iletişim istemedi; pazarlama izni geri çekildi." : "Pazarlama izni bilinmiyor."}</p><Link className="secondary-action inline-link" href={`/contacts?contactId=${encodeURIComponent(contact.id)}`}>İzinleri düzenle</Link></SpCard> : null}
    </section>
  </AppShell>;
}
