import type { CurrencyCode, DealStage } from "../domain/entities.js";
import { reportingPeriodDays, type ReportingPeriod } from "../today/build-overview.js";

export interface EarningsDeal {
  stage: DealStage;
  actualAmount: number | null;
  commissionAmount: number | null;
  currency: CurrencyCode | null;
  closedAt: number | null;
}

export interface EarningsCurrencyTotal {
  currency: CurrencyCode;
  commission: number;
  volume: number;
  closedCount: number;
  /** Commission as a share of realized volume; null while no volume is recorded. */
  commissionRate: number | null;
}

export interface EarningsSummary {
  period: ReportingPeriod;
  closedCount: number;
  totals: EarningsCurrencyTotal[];
  /** Closed deals whose amount or currency is missing, so they sit outside every total. */
  incompleteCount: number;
}

/**
 * Totals realized commission per currency for deals closed inside the period.
 * Amounts in different currencies are never added together, and a closed deal
 * with missing figures is reported as incomplete rather than counted as zero.
 */
export function buildEarningsSummary(
  deals: readonly EarningsDeal[],
  period: ReportingPeriod,
  now: number,
): EarningsSummary {
  const windowStart = now - reportingPeriodDays[period] * 86_400_000;
  const closed = deals.filter((deal) => deal.stage === "closed" && deal.closedAt !== null && deal.closedAt >= windowStart);
  const buckets = new Map<CurrencyCode, { commission: number; volume: number; closedCount: number }>();
  let incompleteCount = 0;

  for (const deal of closed) {
    if (deal.currency === null || deal.commissionAmount === null || deal.actualAmount === null) {
      incompleteCount += 1;
      continue;
    }
    const bucket = buckets.get(deal.currency) ?? { commission: 0, volume: 0, closedCount: 0 };
    bucket.commission += deal.commissionAmount;
    bucket.volume += deal.actualAmount;
    bucket.closedCount += 1;
    buckets.set(deal.currency, bucket);
  }

  const totals = [...buckets.entries()]
    .map(([currency, bucket]) => ({
      currency,
      commission: bucket.commission,
      volume: bucket.volume,
      closedCount: bucket.closedCount,
      commissionRate: bucket.volume > 0 ? bucket.commission / bucket.volume : null,
    }))
    .sort((left, right) => right.commission - left.commission || left.currency.localeCompare(right.currency));

  return { period, closedCount: closed.length, totals, incompleteCount };
}
