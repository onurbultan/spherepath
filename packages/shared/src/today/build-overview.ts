import type { Contact, Opportunity } from "../domain/entities.js";
import { z } from "zod";
import { nextActionTypeLabels, nextActionTypes } from "../interactions/manual-interaction.js";

export interface TodayContact {
  id: string;
  name: string;
  createdAt: number;
  meaningfulTouchCount: number;
  lastTouchAt?: number | null;
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
  createdAt?: number;
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
  resolutionStatus?: "completed" | "skipped" | "rescheduled" | null;
}

export interface TodayListing { id: string; status: "preparing" | "active" | "reserved" | "sold" | "rented" | "removed"; createdAt?: number }
export interface TodayDeal { id: string; stage: "presentation" | "viewing" | "offer" | "contract" | "closed" | "lost"; closedAt?: number | null }
export interface TodayInteraction {
  id: string;
  contactId: string;
  contactName: string;
  outcome: string;
  occurredAt: number;
}

export interface TodayOverview {
  period: ReportingPeriod;
  stages: {
    acquaintance: number;
    relationship: number;
    lead: number;
    listing: number;
    closing: number;
  };
  focus: { title: string; description: string; evidence: string; action: string; sampleSufficient: boolean; targetOpportunityId: string | null; targetContactId: string | null };
  tasks: TodayTask[];
  recentInteractions: TodayInteraction[];
  completedTaskCount: number;
}

export const reportingPeriods = ["30d", "90d", "1y"] as const;
export const reportingPeriodSchema = z.enum(reportingPeriods);
export const todayOverviewQuerySchema = z.preprocess(
  (value) => value === null || value === undefined ? {} : value,
  z.object({ period: reportingPeriodSchema.default("30d") }).strict(),
);
export type ReportingPeriod = z.infer<typeof reportingPeriodSchema>;

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

export const replaceDailyPlanItemSchema = z.object({ taskId: z.string().trim().min(3).max(240) }).strict();
export type ReplaceDailyPlanItemInput = z.infer<typeof replaceDailyPlanItemSchema>;

const periodDays: Record<ReportingPeriod, number> = { "30d": 30, "90d": 90, "1y": 365 };

export const reportingPeriodLabels: Record<ReportingPeriod, string> = { "30d": "30 gün", "90d": "90 gün", "1y": "1 yıl" };

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
  period: ReportingPeriod = "30d",
): TodayOverview {
  const windowStart = now - periodDays[period] * 24 * 60 * 60 * 1_000;
  const periodLabel = reportingPeriodLabels[period];
  const activeOpportunities = opportunities.filter((item) => item.stage !== "lost");
  const stages = {
    acquaintance: contacts.filter((contact) => contact.createdAt >= windowStart).length,
    relationship: contacts.filter((contact) => contact.meaningfulTouchCount > 0 && (contact.lastTouchAt ?? now) >= windowStart).length,
    lead: activeOpportunities.filter((item) => item.stage !== "won" && (item.createdAt ?? now) >= windowStart).length,
    listing: listings.filter((item) => (item.status === "active" || item.status === "reserved") && (item.createdAt ?? now) >= windowStart).length,
    closing: deals.filter((item) => item.stage === "closed" && (item.closedAt ?? now) >= windowStart).length,
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
    .filter((task) => !completedTaskIds.has(task.id))
    .sort((left, right) => (left.priority === "overdue" ? -1 : right.priority === "overdue" ? 1 : 0))
    .sort((left, right) => (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER));

  const opportunitiesWithoutAction = activeOpportunities.filter((item) => item.stage !== "won" && item.nextActionAt === null).length;
  const currentDayKey = istanbulDayKey(now);
  const recentInteractions = interactions
    .filter((interaction) => istanbulDayKey(interaction.occurredAt) === currentDayKey)
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .slice(0, 8);
  const sampleSufficient = contacts.length >= 5 || opportunities.length >= 5;
  const oldestOpportunityWithoutAction = activeOpportunities
    .filter((item) => item.stage !== "won" && item.nextActionAt === null)
    .sort((left, right) => (left.createdAt ?? now) - (right.createdAt ?? now))[0];
  const newestUncontacted = [...contacts]
    .filter((contact) => contact.meaningfulTouchCount === 0)
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  const focus = contacts.length === 0
    ? { title: "İlk kişini ekle", description: "Günlük planını hazırlamak için ilk kişiyi kaydet.", evidence: `Son ${periodLabel.toLocaleLowerCase("tr-TR")} içinde 0 kişi`, action: "Bugün ilk kişiyi ekle.", sampleSufficient: false, targetOpportunityId: null, targetContactId: null }
    : stages.relationship === 0
      ? { title: "İlk görüşmeleri kaydet", description: `${contacts.length} kişi kayıtlı; henüz görüşme sonucu yok.`, evidence: `${contacts.length} kişi / 0 görüşme`, action: "En yeni kişiyle görüşme sonucunu kaydet.", sampleSufficient, targetOpportunityId: null, targetContactId: newestUncontacted?.id ?? null }
      : stages.lead === 0
        ? { title: "Görüşmeden talebe geç", description: `${stages.relationship} kişiyle görüşüldü; henüz açık talep veya portföy adayı yok.`, evidence: `${stages.relationship} görüşülen kişi / 0 açık talep`, action: "Uygun kişide talep veya portföy adayı oluştur.", sampleSufficient, targetOpportunityId: null, targetContactId: null }
        : opportunitiesWithoutAction > 0
          ? { title: "Sonraki adımı eksik talepleri tamamla", description: `${stages.lead} açık talebin ${opportunitiesWithoutAction} tanesinde sonraki adım yok.`, evidence: `Son ${periodLabel.toLocaleLowerCase("tr-TR")} · ${stages.lead} açık talep`, action: "En eski kaydın sonraki adımını belirle.", sampleSufficient, targetOpportunityId: oldestOpportunityWithoutAction?.id ?? null, targetContactId: oldestOpportunityWithoutAction?.subjectContactId ?? null }
          : stages.listing === 0
            ? { title: "Talebi portföye dönüştür", description: `${stages.lead} açık talep var; aktif portföy henüz yok.`, evidence: `${stages.lead} açık talep / 0 aktif portföy`, action: "En eski kaydı değerleme veya yetki adımına ilerlet.", sampleSufficient, targetOpportunityId: activeOpportunities.filter((item) => item.stage !== "won").sort((a, b) => (a.createdAt ?? now) - (b.createdAt ?? now))[0]?.id ?? null, targetContactId: null }
            : { title: "Aktif portföyleri sonuca taşı", description: `${stages.listing} aktif portföy ve ${stages.closing} tamamlanan işlem var.`, evidence: `${stages.listing} aktif portföy / ${stages.closing} kapanan işlem`, action: "En uygun alıcı için sunum veya teklif takibini tamamla.", sampleSufficient, targetOpportunityId: null, targetContactId: null };

  return { period, stages, focus, tasks, recentInteractions, completedTaskCount: completedTaskIds.size };
}
