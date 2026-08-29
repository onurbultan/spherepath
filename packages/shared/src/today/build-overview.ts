import type { Contact, Opportunity } from "../domain/entities.js";
import { z } from "zod";
import { nextActionTypeLabels, nextActionTypes } from "../interactions/manual-interaction.js";

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
  priority: "overdue" | "bottleneck" | "relationship";
}

export interface TodayListing { id: string; status: "preparing" | "active" | "reserved" | "sold" | "rented" | "removed" }
export interface TodayDeal { id: string; stage: "presentation" | "viewing" | "offer" | "contract" | "closed" | "lost" }
export interface TodayInteraction {
  id: string;
  contactId: string;
  contactName: string;
  outcome: string;
  occurredAt: number;
}

export interface TodayOverview {
  stages: {
    acquaintance: number;
    relationship: number;
    lead: number;
    listing: number;
    closing: number;
  };
  focus: { title: string; description: string; evidence: string; action: string; sampleSufficient: boolean };
  tasks: TodayTask[];
  recentInteractions: TodayInteraction[];
  completedTaskCount: number;
}

export const dailyTaskOutcomeSchema = z.object({
  taskId: z.string().trim().min(3).max(240),
  status: z.enum(["completed", "skipped", "rescheduled"]),
  outcomeNote: z.string().trim().max(500).nullable(),
  skippedReason: z.string().trim().max(300).nullable(),
  rescheduledAt: z.number().int().positive().nullable(),
  rescheduledActionType: z.enum(nextActionTypes).nullable(),
}).strict().superRefine((value, context) => {
  if (value.status === "skipped" && !value.skippedReason) {
    context.addIssue({ code: "custom", message: "Atlanan görev için neden gerekli.", path: ["skippedReason"] });
  }
  if (value.status === "rescheduled" && (value.rescheduledAt === null || value.rescheduledActionType === null)) {
    context.addIssue({ code: "custom", message: "Yeni tarih ve aksiyon türü gerekli.", path: [value.rescheduledAt === null ? "rescheduledAt" : "rescheduledActionType"] });
  }
  if (value.status !== "rescheduled" && (value.rescheduledAt !== null || value.rescheduledActionType !== null)) {
    context.addIssue({ code: "custom", message: "Yeni tarih yalnız ertelenen görevde kullanılabilir.", path: ["rescheduledAt"] });
  }
});
export type DailyTaskOutcome = z.infer<typeof dailyTaskOutcomeSchema>;

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1_000;

function istanbulDayKey(timestamp: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}

export function buildTodayOverview(
  contacts: readonly TodayContact[],
  opportunities: readonly TodayOpportunity[],
  now: number,
  listings: readonly TodayListing[] = [],
  deals: readonly TodayDeal[] = [],
  completedTaskIds: ReadonlySet<string> = new Set(),
  interactions: readonly TodayInteraction[] = [],
): TodayOverview {
  const activeOpportunities = opportunities.filter((item) => item.stage !== "lost");
  const stages = {
    acquaintance: contacts.filter((contact) => contact.createdAt >= now - THIRTY_DAYS).length,
    relationship: contacts.filter((contact) => contact.meaningfulTouchCount > 0).length,
    lead: activeOpportunities.filter((item) => item.stage !== "won").length,
    listing: listings.filter((item) => item.status === "active" || item.status === "reserved").length,
    closing: deals.filter((item) => item.stage === "closed").length,
  };

  const scheduled = contacts
    .filter((contact) => contact.nextActionAt !== null && contact.nextActionType !== null)
    .map<TodayTask>((contact) => ({
      id: `next-action-${contact.id}`,
      contactId: contact.id,
      title: contact.name,
      reason: contact.nextActionType ? nextActionTypeLabels[contact.nextActionType] : "Sonraki aksiyon",
      dueAt: contact.nextActionAt,
      type: "next_action",
      priority: (contact.nextActionAt ?? now) < now ? "overdue" : "relationship",
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
      priority: "relationship",
    }));
  const opportunityTasks = activeOpportunities
    .filter((opportunity) => opportunity.nextActionAt !== null && opportunity.nextActionType !== null && opportunity.stage !== "won")
    .map<TodayTask>((opportunity) => ({
      id: `opportunity-action-${opportunity.id}`,
      contactId: opportunity.subjectContactId,
      opportunityId: opportunity.id,
      title: opportunity.subjectContactName,
      reason: opportunity.nextActionType ? nextActionTypeLabels[opportunity.nextActionType] : "Fırsat aksiyonu",
      dueAt: opportunity.nextActionAt,
      type: "next_action",
      priority: (opportunity.nextActionAt ?? now) < now ? "overdue" : "bottleneck",
    }));
  const tasks = [...opportunityTasks, ...scheduled, ...uncontacted]
    .filter((task, index, all) => all.findIndex((candidate) => candidate.contactId === task.contactId) === index)
    .filter((task) => !completedTaskIds.has(task.id))
    .sort((left, right) => (left.priority === "overdue" ? -1 : right.priority === "overdue" ? 1 : 0))
    .sort((left, right) => (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 5);

  const opportunitiesWithoutAction = activeOpportunities.filter((item) => item.stage !== "won" && item.nextActionAt === null).length;
  const currentDayKey = istanbulDayKey(now);
  const recentInteractions = interactions
    .filter((interaction) => istanbulDayKey(interaction.occurredAt) === currentDayKey)
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .slice(0, 8);
  const sampleSufficient = contacts.length >= 5 || opportunities.length >= 5;
  const focus = contacts.length === 0
    ? { title: "Başlamak için kişi ekle", description: "İlişki sistemini ölçmek için ilk kişini çalışma alanına ekle.", evidence: "Son 30 günde 0 kişi", action: "Bugün ilk nitelikli kişiyi ekle.", sampleSufficient: false }
    : stages.relationship === 0
      ? { title: "İlk temasları görünür kıl", description: `${contacts.length} kişi kayıtlı; henüz hiçbirinde anlamlı temas sonucu yok.`, evidence: `${contacts.length} uygun kişi / 0 anlamlı temas`, action: "En yeni üç kişiyle anlamlı temas sonucunu kaydet.", sampleSufficient }
      : stages.lead === 0
        ? { title: "İlişkiden fırsata geçişi ölç", description: `${stages.relationship} kişide anlamlı temas var; henüz açık bir fırsat bulunmuyor.`, evidence: `${stages.relationship} ilişkili kişi / 0 açık lead`, action: "Uygun bir kişide açık talep veya portföy sinyalini fırsata dönüştür.", sampleSufficient }
        : opportunitiesWithoutAction > 0
          ? { title: "Sonraki aksiyonsuz lead’leri kapat", description: `${stages.lead} açık fırsatın ${opportunitiesWithoutAction} tanesinde sonraki aksiyon yok.`, evidence: `Son 30 gün · ${stages.lead} açık fırsat`, action: "En eski aksiyonsuz lead için randevu veya kapanış sonucu al.", sampleSufficient }
          : stages.listing === 0
            ? { title: "Lead’den portföye geçişi hızlandır", description: `${stages.lead} açık fırsat var; aktif portföy henüz yok.`, evidence: `${stages.lead} açık lead / 0 aktif portföy`, action: "En yaşlı fırsatı değerleme veya yetki adımına ilerlet.", sampleSufficient }
            : { title: "Aktif portföyleri kapamaya taşı", description: `${stages.listing} aktif portföy ve ${stages.closing} tamamlanan işlem var.`, evidence: `${stages.listing} aktif portföy / ${stages.closing} kapanan işlem`, action: "En uygun alıcı için sunum veya teklif takibini tamamla.", sampleSufficient };

  return { stages, focus, tasks, recentInteractions, completedTaskCount: completedTaskIds.size };
}
