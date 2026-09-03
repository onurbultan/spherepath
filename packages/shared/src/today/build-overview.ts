import type { Contact, Opportunity } from "../domain/entities.js";
import { z } from "zod";
import { nextActionTypeLabels, nextActionTypes } from "../interactions/manual-interaction.js";
import { scoreDailyTaskCandidate } from "../daily-plan/rank-tasks.js";

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
  estimatedValue?: { amount: number; currency: string } | null;
}

export type DailyTaskResolutionStatus = "completed" | "skipped" | "rescheduled" | "contact_opt_out";
export const dailyTaskResolutionLabels: Record<DailyTaskResolutionStatus, string> = {
  completed: "Tamamlandı",
  skipped: "Atlandı",
  rescheduled: "Ertelendi",
  contact_opt_out: "İletişim istemiyor",
};

export interface TodayTask {
  id: string;
  contactId: string;
  title: string;
  reason: string;
  dueAt: number | null;
  type: "record_interaction" | "next_action" | "complete_listing" | "return_call";
  opportunityId?: string;
  priority: "overdue" | "bottleneck" | "relationship";
  resolutionStatus?: DailyTaskResolutionStatus | null;
  resolutionNote?: string | null;
  /** Weighted urgency from rankDailyTaskCandidates; higher comes first. */
  priorityScore?: number;
}

export interface TodayCall {
  id: string;
  contactId: string | null;
  answered: boolean;
  direction: "inbound" | "outbound";
  startedAt: number | null;
}

export interface TodayListing {
  id: string;
  status: "preparing" | "active" | "reserved" | "sold" | "rented" | "removed";
  createdAt?: number;
  /** Null until the valuation. A listing cannot be published without it. */
  askingPrice?: number | null;
  ownerContactId?: string | null;
  ownerContactName?: string | null;
}
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
  /** Ranked work beyond the stable daily five, for advisors who want the full queue. */
  allTasks: TodayTask[];
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
  status: z.enum(["completed", "skipped", "rescheduled", "contact_opt_out"]),
  outcomeNote: z.string().trim().max(500).nullable(),
  skippedReason: z.string().trim().max(300).nullable(),
  rescheduledAt: z.number().int().positive().nullable(),
  rescheduledActionType: z.enum(nextActionTypes).nullable(),
}).strict().superRefine((value, context) => {
  if ((value.status === "skipped" || value.status === "contact_opt_out") && !value.skippedReason) {
    context.addIssue({ code: "custom", message: value.status === "contact_opt_out" ? "İletişim tercihi için açıklama gerekli." : "Atlanan görev için neden gerekli.", path: ["skippedReason"] });
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

export const reportingPeriodDays: Record<ReportingPeriod, number> = { "30d": 30, "90d": 90, "1y": 365 };

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
  calls: readonly TodayCall[] = [],
): TodayOverview {
  const windowStart = now - reportingPeriodDays[period] * 24 * 60 * 60 * 1_000;
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
  // A customer who called and got no answer is the most valuable event of an
  // advisor's day and was the quietest thing in the product: the call record
  // said "geri dönülmeyi bekliyor" with nothing behind the words.
  const missedWindow = now - 3 * 86_400_000;
  const returnedTo = new Set(
    interactions.filter((interaction) => interaction.occurredAt >= missedWindow).map((interaction) => interaction.contactId),
  );
  const missedCalls = calls
    .filter((call) => !call.answered && call.direction === "inbound" && call.contactId
      && (call.startedAt ?? 0) >= missedWindow && !returnedTo.has(call.contactId))
    .map<TodayTask>((call) => ({
      id: `missed-call-${call.id}`,
      contactId: call.contactId!,
      title: contacts.find((contact) => contact.id === call.contactId)?.name ?? "Cevapsız arama",
      reason: "Aradı, ulaşamadı — geri dön",
      dueAt: call.startedAt,
      type: "return_call",
      priority: "overdue",
    }));

  // A mandate is won before the property is priced, so a listing legitimately
  // starts without one -- but nothing then asks for it, and the portfolio sits
  // in "Hazırlanıyor" out of sight. This is the work that finishes it.
  const unpricedListings = listings
    .filter((listing) => listing.status === "preparing" && (listing.askingPrice ?? null) === null && listing.ownerContactId)
    .map<TodayTask>((listing) => ({
      id: `listing-price-${listing.id}`,
      contactId: listing.ownerContactId!,
      title: listing.ownerContactName ?? contacts.find((contact) => contact.id === listing.ownerContactId)?.name ?? "Portföy",
      reason: "Değerleme sonrası fiyatı gir",
      dueAt: null,
      type: "complete_listing",
      priority: "bottleneck",
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
  const dayMs = 86_400_000;
  // Deal size only compares within a currency; the largest open opportunity in each
  // currency is the yardstick, so "large for its kind" scores the same in TRY and GBP.
  const largestValueByCurrency = new Map<string, number>();
  for (const opportunity of activeOpportunities) {
    const value = opportunity.estimatedValue;
    if (!value || value.amount <= 0) continue;
    largestValueByCurrency.set(value.currency, Math.max(largestValueByCurrency.get(value.currency) ?? 0, value.amount));
  }
  const opportunityById = new Map(activeOpportunities.map((item) => [item.id, item]));
  const contactById = new Map(contacts.map((item) => [item.id, item]));
  const taskPriorityScore = (task: TodayTask): number => {
    const opportunity = task.opportunityId ? opportunityById.get(task.opportunityId) : undefined;
    const createdAt = opportunity?.createdAt ?? contactById.get(task.contactId)?.createdAt ?? now;
    const value = opportunity?.estimatedValue ?? null;
    const largest = value ? largestValueByCurrency.get(value.currency) ?? 0 : 0;
    return scoreDailyTaskCandidate({
      id: task.id,
      overdueDays: task.dueAt !== null && task.dueAt < now ? (now - task.dueAt) / dayMs : 0,
      bottleneckImpact: task.priority === "bottleneck" ? 1 : 0,
      estimatedValueImpact: value && largest > 0 ? (value.amount / largest) * 10 : 0,
      // Staleness is capped at a month so a long-forgotten record nudges the order
      // without outranking work the advisor actually promised.
      ageDays: Math.min(30, Math.max(0, (now - createdAt) / dayMs)),
      complianceBlocked: false,
    });
  };
  const tasks = [...missedCalls, ...opportunityTasks, ...unpricedListings, ...scheduled, ...uncontacted]
    .filter((task) => !completedTaskIds.has(task.id))
    .map((task) => ({ ...task, priorityScore: taskPriorityScore(task) }))
    .sort((left, right) => right.priorityScore - left.priorityScore
      || (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id));

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

  return { period, stages, focus, tasks, allTasks: tasks, recentInteractions, completedTaskCount: completedTaskIds.size };
}
