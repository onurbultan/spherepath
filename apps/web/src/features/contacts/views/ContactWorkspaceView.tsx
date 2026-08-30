"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, BriefcaseBusiness, MessageSquarePlus, ShieldCheck, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, contactRoleLabels, contactSourceLabels, nextActionTypeLabels, opportunityStageLabels, opportunityTypeLabels } from "@spherepath/shared";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { listOpportunities } from "@/features/opportunities/resources/opportunities";
import { ContactInteractionTimeline } from "../components/ContactInteractionTimeline";
import { listContacts } from "../resources/contacts";

export function ContactWorkspaceView({ contactId }: { contactId: string }) {
  const [tab, setTab] = useState<"timeline" | "memory" | "opportunities" | "privacy">("timeline");
  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts });
  const opportunitiesQuery = useQuery({ queryKey: apiQueryKeys.opportunities, queryFn: listOpportunities });
  const contact = contactsQuery.data?.find((item) => item.id === contactId);
  const opportunities = (opportunitiesQuery.data ?? []).filter((item) => item.subjectContactId === contactId);
  if (contactsQuery.isPending) return <AppShell><div className="content-state">Kişi hazırlanıyor…</div></AppShell>;
  if (!contact) return <AppShell><SpCard className="empty-state"><UserRound size={24} /><h2>Kişi bulunamadı</h2><Link className="secondary-action inline-link" href="/contacts">Kişilere dön</Link></SpCard></AppShell>;
  const name = contact.fullName ?? contact.label ?? "İsimsiz kişi";
  return <AppShell><header className="page-header contacts-header"><div><Link className="text-button inline-link" href="/contacts"><ArrowLeft size={15} /> Kişilere dön</Link><p className="eyebrow">KİŞİ ÇALIŞMA SAYFASI</p><h1>{name}</h1><p className="context-sentence">{contactRoleLabels[contact.roles[0] ?? "unknown"]} · {contactSourceLabels[contact.source]} · {contact.phone ?? "Telefon eklenmedi"}</p></div><div className="header-actions"><Link className="primary-action inline-link" href={`/capture?contactId=${encodeURIComponent(contact.id)}`}><MessageSquarePlus size={17} /> Temas kaydet</Link></div></header>
    <section className="contact-workspace-layout" aria-label="Kişi özeti ve çalışma alanı">
      <div className="contact-workspace-summary"><SpCard><span>Son görüşme</span><strong>{contact.relationship.lastTouchAt ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(contact.relationship.lastTouchAt) : "Henüz yok"}</strong></SpCard><SpCard><span>Sonraki adım</span><strong>{contact.relationship.nextActionType ? nextActionTypeLabels[contact.relationship.nextActionType] : "Belirlenmedi"}</strong></SpCard><SpCard><span>Açık fırsat</span><strong>{opportunities.filter((item) => item.stage !== "won" && item.stage !== "lost").length}</strong></SpCard></div>
      <nav className="contact-workspace-tabs" aria-label="Kişi çalışma alanı"><button className={tab === "timeline" ? "selected" : ""} onClick={() => setTab("timeline")}>Görüşmeler</button><button className={tab === "memory" ? "selected" : ""} onClick={() => setTab("memory")}>Hafıza</button><button className={tab === "opportunities" ? "selected" : ""} onClick={() => setTab("opportunities")}>Fırsatlar</button><button className={tab === "privacy" ? "selected" : ""} onClick={() => setTab("privacy")}>İzinler</button></nav>
      {tab === "timeline" ? <SpCard><ContactInteractionTimeline contactId={contact.id} /></SpCard> : null}
      {tab === "memory" ? <SpCard className="contact-workspace-panel"><h2>Hatırlanacaklar</h2>{contact.memory.keyThingsToRemember.length ? <ul>{contact.memory.keyThingsToRemember.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Henüz hatırlanacak bilgi yok.</p>}<h3>Gayrimenkul tercihleri</h3><div className="opportunity-highlights">{contact.memory.propertyPreferences.preferredLocations.map((item) => <span key={item}>{item}</span>)}{contact.memory.propertyPreferences.mustHaves.map((item) => <span key={item}>{item}</span>)}</div></SpCard> : null}
      {tab === "opportunities" ? <SpCard className="contact-workspace-panel"><h2>Fırsatlar</h2>{opportunities.length ? opportunities.map((item) => <Link className="contact-opportunity-row" key={item.id} href={`/opportunities?opportunityId=${encodeURIComponent(item.id)}`}><BriefcaseBusiness size={17} /><span><strong>{opportunityTypeLabels[item.type]}</strong><small>{opportunityStageLabels[item.stage]}</small></span></Link>) : <p>Bu kişi için fırsat yok.</p>}</SpCard> : null}
      {tab === "privacy" ? <SpCard className="contact-workspace-panel"><ShieldCheck size={22} /><h2>Aydınlatma ve iletişim izinleri</h2><p>{contact.privacy.noticeStatus === "completed" ? "Aydınlatma tamamlandı." : "Aydınlatma bekliyor."} {contact.privacy.marketingConsent === "granted" ? "Pazarlama izni var." : contact.privacy.marketingConsent === "withdrawn" ? "Kişi iletişim istemedi; pazarlama izni geri çekildi." : "Pazarlama izni bilinmiyor."}</p><Link className="secondary-action inline-link" href={`/contacts?contactId=${encodeURIComponent(contact.id)}`}>İzinleri düzenle</Link></SpCard> : null}
    </section>
  </AppShell>;
}
