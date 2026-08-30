import type { AskOutcome, ContactSource, CurrencyCode, InteractionChannel, InteractionObjective } from "../domain/entities.js";
import { interactionChannelLabels, interactionObjectiveLabels } from "../interactions/manual-interaction.js";
import { reportingPeriodDays, type ReportingPeriod } from "../today/build-overview.js";

export interface FunnelStageEvent {
  entityType: string;
  entityId: string;
  fromStage: string | null;
  toStage: string;
  occurredAt: number;
  correction?: boolean;
}

export interface FunnelInteraction {
  contactId: string;
  channel: InteractionChannel;
  objective: InteractionObjective;
  askOutcome: AskOutcome;
  occurredAt: number;
  nextActionAt: number | null;
}

export interface FunnelClosedDeal {
  buyerSource: ContactSource | null;
  commissionAmount: number | null;
  currency: CurrencyCode | null;
  closedAt: number | null;
}

export interface StageDuration { stage: string; medianDays: number; sampleSize: number }
export interface AskConversion { key: string; label: string; asked: number; positive: number; rate: number }
export interface LossReasonGroup { reason: string; count: number }
export interface SourceReturn { source: ContactSource; closedCount: number; commission: number; currency: CurrencyCode }
export interface KeptPromiseRate { promised: number; kept: number; rate: number }

export interface FunnelMetrics {
  /** Median days an opportunity sits in each stage before moving on. */
  stageDurations: StageDuration[];
  timeToWonDays: number | null;
  timeToLostDays: number | null;
  /** Share of opportunities that were corrected or reopened after being lost. */
  reworkRate: number | null;
  askByObjective: AskConversion[];
  askByChannel: AskConversion[];
  lossReasons: LossReasonGroup[];
  keptPromiseRate: KeptPromiseRate | null;
  sourceReturns: SourceReturn[];
  /** Below this, the numbers are noise and should not be presented as a finding. */
  sampleSufficient: boolean;
}

const dayMs = 86_400_000;
const minimumSample = 5;
/** A follow-up counts as kept if it happens on the promised day or within the week after. */
const promiseGraceMs = 7 * dayMs;

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

function conversions<T extends string>(
  interactions: readonly FunnelInteraction[],
  pick: (interaction: FunnelInteraction) => T,
  labels: Record<T, string>,
): AskConversion[] {
  const buckets = new Map<T, { asked: number; positive: number }>();
  for (const interaction of interactions) {
    // "not_asked" and "not_applicable" mean no ask was made, so they are not denominators.
    if (interaction.askOutcome !== "positive" && interaction.askOutcome !== "unclear" && interaction.askOutcome !== "negative") continue;
    const key = pick(interaction);
    const bucket = buckets.get(key) ?? { asked: 0, positive: 0 };
    bucket.asked += 1;
    if (interaction.askOutcome === "positive") bucket.positive += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([key, bucket]) => ({ key, label: labels[key], asked: bucket.asked, positive: bucket.positive, rate: bucket.positive / bucket.asked }))
    .sort((left, right) => right.rate - left.rate || right.asked - left.asked);
}

/**
 * Everything here is derived from records the product already writes. stageEvents in
 * particular are written on every transition and, until now, were only ever read back
 * one opportunity at a time.
 */
export function buildFunnelMetrics(
  events: readonly FunnelStageEvent[],
  interactions: readonly FunnelInteraction[],
  lostReasons: readonly (string | null)[],
  closedDeals: readonly FunnelClosedDeal[],
  period: ReportingPeriod,
  now: number,
): FunnelMetrics {
  const windowStart = now - reportingPeriodDays[period] * dayMs;
  const opportunityEvents = events
    .filter((event) => event.entityType === "opportunity")
    .sort((left, right) => left.occurredAt - right.occurredAt);

  const byOpportunity = new Map<string, FunnelStageEvent[]>();
  for (const event of opportunityEvents) {
    const list = byOpportunity.get(event.entityId) ?? [];
    list.push(event);
    byOpportunity.set(event.entityId, list);
  }

  const durationsByStage = new Map<string, number[]>();
  const wonDurations: number[] = [];
  const lostDurations: number[] = [];
  let reworked = 0;

  for (const timeline of byOpportunity.values()) {
    for (let index = 1; index < timeline.length; index += 1) {
      const previous = timeline[index - 1]!;
      const current = timeline[index]!;
      const days = (current.occurredAt - previous.occurredAt) / dayMs;
      if (days < 0) continue;
      const bucket = durationsByStage.get(previous.toStage) ?? [];
      bucket.push(days);
      durationsByStage.set(previous.toStage, bucket);
    }
    const first = timeline[0];
    const last = timeline[timeline.length - 1];
    if (first && last && last.occurredAt >= windowStart) {
      const span = (last.occurredAt - first.occurredAt) / dayMs;
      if (last.toStage === "won") wonDurations.push(span);
      if (last.toStage === "lost") lostDurations.push(span);
    }
    if (timeline.some((event) => event.correction === true || (event.fromStage === "lost" && event.toStage !== "lost"))) reworked += 1;
  }

  const windowedInteractions = interactions.filter((interaction) => interaction.occurredAt >= windowStart);
  const interactionsByContact = new Map<string, number[]>();
  for (const interaction of interactions) {
    const list = interactionsByContact.get(interaction.contactId) ?? [];
    list.push(interaction.occurredAt);
    interactionsByContact.set(interaction.contactId, list);
  }
  let promised = 0;
  let kept = 0;
  for (const interaction of windowedInteractions) {
    const due = interaction.nextActionAt;
    // A promise whose date has not arrived yet cannot be judged either way.
    if (due === null || due > now) continue;
    promised += 1;
    const followUps = interactionsByContact.get(interaction.contactId) ?? [];
    if (followUps.some((occurredAt) => occurredAt > interaction.occurredAt && occurredAt <= due + promiseGraceMs)) kept += 1;
  }

  const lossBuckets = new Map<string, number>();
  for (const reason of lostReasons) {
    const label = reason?.trim() || "Neden belirtilmemiş";
    lossBuckets.set(label, (lossBuckets.get(label) ?? 0) + 1);
  }

  const sourceBuckets = new Map<string, SourceReturn>();
  for (const deal of closedDeals) {
    if (deal.buyerSource === null || deal.commissionAmount === null || deal.currency === null) continue;
    if (deal.closedAt === null || deal.closedAt < windowStart) continue;
    const key = `${deal.buyerSource}:${deal.currency}`;
    const bucket = sourceBuckets.get(key) ?? { source: deal.buyerSource, closedCount: 0, commission: 0, currency: deal.currency };
    bucket.closedCount += 1;
    bucket.commission += deal.commissionAmount;
    sourceBuckets.set(key, bucket);
  }

  const timeToWon = median(wonDurations);
  const timeToLost = median(lostDurations);

  return {
    stageDurations: [...durationsByStage.entries()]
      .map(([stage, values]) => ({ stage, medianDays: round1(median(values) ?? 0), sampleSize: values.length }))
      .sort((left, right) => right.medianDays - left.medianDays),
    timeToWonDays: timeToWon === null ? null : round1(timeToWon),
    timeToLostDays: timeToLost === null ? null : round1(timeToLost),
    reworkRate: byOpportunity.size ? reworked / byOpportunity.size : null,
    askByObjective: conversions(windowedInteractions, (interaction) => interaction.objective, interactionObjectiveLabels),
    askByChannel: conversions(windowedInteractions, (interaction) => interaction.channel, interactionChannelLabels),
    lossReasons: [...lossBuckets.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
    keptPromiseRate: promised ? { promised, kept, rate: kept / promised } : null,
    sourceReturns: [...sourceBuckets.values()].sort((left, right) => right.commission - left.commission),
    sampleSufficient: windowedInteractions.length >= minimumSample || byOpportunity.size >= minimumSample,
  };
}

