import type { Contact, Opportunity } from "../domain/entities.js";

export interface TodayContact {
  id: string;
  name: string;
  createdAt: number;
  meaningfulTouchCount: number;
  nextActionAt: number | null;
  nextActionType: Contact["relationship"]["nextActionType"];
}

export interface TodayOpportunity {
  id: string;
  subjectContactId: string;
  subjectContactName: string;
  stage: Opportunity["stage"];
  nextActionAt: number | null;
  nextActionType: Opportunity["nextActionType"];
}

export interface TodayTask {
  id: string;
  contactId: string;
  title: string;
  reason: string;
  dueAt: number | null;
  type: "record_interaction" | "next_action";
  opportunityId?: string;
}

export interface TodayOverview {
  stages: {
    acquaintance: number;
    relationship: number;
    lead: number;
    listing: number;
    closing: number;
  };
  focus: { title: string; description: string };
  tasks: TodayTask[];
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1_000;

export function buildTodayOverview(
  contacts: readonly TodayContact[],
  opportunities: readonly TodayOpportunity[],
  now: number,
): TodayOverview {
  const activeOpportunities = opportunities.filter((item) => item.stage !== "lost");
  const stages = {
    acquaintance: contacts.filter((contact) => contact.createdAt >= now - THIRTY_DAYS).length,
    relationship: contacts.filter((contact) => contact.meaningfulTouchCount > 0).length,
    lead: activeOpportunities.filter((item) => item.stage !== "won").length,
    listing: activeOpportunities.filter((item) => item.stage === "won").length,
    closing: 0,
  };

  const scheduled = contacts
    .filter((contact) => contact.nextActionAt !== null && contact.nextActionType !== null)
    .map<TodayTask>((contact) => ({
      id: `next-action-${contact.id}`,
      contactId: contact.id,
      title: contact.name,
      reason: "Kabul edilmiş sonraki aksiyon",
      dueAt: contact.nextActionAt,
      type: "next_action",
    }))
    .sort((left, right) => (left.dueAt ?? now) - (right.dueAt ?? now));
  const uncontacted = contacts
    .filter((contact) => contact.meaningfulTouchCount === 0)
    .map<TodayTask>((contact) => ({
      id: `first-interaction-${contact.id}`,
      contactId: contact.id,
      title: contact.name,
      reason: "İlk anlamlı teması kaydet",
      dueAt: null,
      type: "record_interaction",
    }));
  const opportunityTasks = activeOpportunities
    .filter((opportunity) => opportunity.nextActionAt !== null && opportunity.nextActionType !== null && opportunity.stage !== "won")
    .map<TodayTask>((opportunity) => ({
      id: `opportunity-action-${opportunity.id}`,
      contactId: opportunity.subjectContactId,
      opportunityId: opportunity.id,
      title: opportunity.subjectContactName,
      reason: "Fırsatın kabul edilmiş sonraki aksiyonu",
      dueAt: opportunity.nextActionAt,
      type: "next_action",
    }));
  const tasks = [...opportunityTasks, ...scheduled, ...uncontacted]
    .filter((task, index, all) => all.findIndex((candidate) => candidate.contactId === task.contactId) === index)
    .sort((left, right) => (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 5);

  const focus = contacts.length === 0
    ? { title: "Başlamak için kişi ekle", description: "İlişki sistemini ölçmek için ilk kişini çalışma alanına ekle." }
    : stages.relationship === 0
      ? { title: "İlk temasları görünür kıl", description: `${contacts.length} kişi kayıtlı; henüz hiçbirinde anlamlı temas sonucu yok.` }
      : stages.lead === 0
        ? { title: "İlişkiden fırsata geçişi ölç", description: `${stages.relationship} kişide anlamlı temas var; henüz açık bir fırsat bulunmuyor.` }
        : { title: "Açık fırsatları ilerlet", description: `${stages.lead} açık fırsatta net bir sonraki adım olduğundan emin ol.` };

  return { stages, focus, tasks };
}
