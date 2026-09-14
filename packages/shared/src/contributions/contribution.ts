import { z } from "zod";
import type { Audited, Instant, TenantOwned } from "../domain/entities.js";

/**
 * What somebody brought the advisor. A relationship business runs on this and
 * the system could not see it: the referral count existed but never appeared on
 * a person's page, and "satış oldu, şu kişiyle ortak yaptık" had nowhere to go
 * at all. Without it, the advisor cannot answer the only question that decides
 * who they call next -- who actually brings me work.
 *
 * A contribution is a fact about the past, not a pipeline: it records that this
 * came from that person. The referral record remains its own thing, with its
 * own stages, and writes one of these when it is created.
 */
export const contributionKinds = ["referral", "listing_lead", "customer_lead", "mandate", "partner", "information"] as const;
export type ContributionKind = (typeof contributionKinds)[number];

export const contributionKindLabels: Record<ContributionKind, string> = {
  referral: "Referans verdi",
  listing_lead: "Portföy kazandırdı",
  customer_lead: "Müşteri buldu",
  mandate: "Yetki verdi",
  partner: "Ortak çalıştı",
  information: "Bilgi verdi",
};

/** Plural, for the ledger line: "2 portföy kazandırdı". */
export const contributionKindCountLabels: Record<ContributionKind, string> = {
  referral: "referans",
  listing_lead: "portföy",
  customer_lead: "müşteri",
  mandate: "yetki",
  partner: "ortak iş",
  information: "bilgi",
};

export const contributionSubjectTypes = ["contact", "opportunity", "listing", "portfolio_item", "deal", "note"] as const;
export type ContributionSubjectType = (typeof contributionSubjectTypes)[number];

export interface Contribution extends TenantOwned, Audited {
  /** Who brought it. */
  contactId: string;
  kind: ContributionKind;
  /** What it produced, when it produced a record. */
  subjectType: ContributionSubjectType;
  subjectId: string | null;
  /** The line it came from, in the advisor's own words. */
  note: string;
  sourceInboxItemId: string | null;
  occurredAt: Instant;
  deletedAt: Instant | null;
}

export interface ContributionRecord extends Contribution {
  id: string;
}

export const contributionDraftSchema = z.object({
  contactId: z.string().trim().min(1).max(160),
  kind: z.enum(contributionKinds),
  subjectType: z.enum(contributionSubjectTypes),
  subjectId: z.string().trim().min(1).max(160).nullable().default(null),
  note: z.string().trim().min(2, "Katkının ne olduğunu kısaca yaz.").max(500),
  sourceInboxItemId: z.string().trim().min(1).max(160).nullable().default(null),
  occurredAt: z.number().int().positive().nullable().default(null),
}).strict();
export type ContributionDraft = z.infer<typeof contributionDraftSchema>;

export function createContribution(draft: ContributionDraft, tenant: TenantOwned, now: number): Contribution {
  const parsed = contributionDraftSchema.parse(draft);
  return {
    ...tenant,
    contactId: parsed.contactId,
    kind: parsed.kind,
    subjectType: parsed.subjectType,
    subjectId: parsed.subjectId,
    note: parsed.note,
    sourceInboxItemId: parsed.sourceInboxItemId,
    occurredAt: parsed.occurredAt ?? now,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface ContributionSummary {
  total: number;
  byKind: Array<{ kind: ContributionKind; count: number }>;
  lastAt: Instant | null;
}

/**
 * The ledger as one line: what this person has brought, most of it first. The
 * advisor asked for exactly this sentence -- "sana 2 referans portföy
 * kazandırdı, 1 müşteri buldu" -- and it is the reason to call them back.
 */
export function summariseContributions(contributions: readonly Contribution[]): ContributionSummary {
  const live = contributions.filter((entry) => entry.deletedAt === null);
  const counts = new Map<ContributionKind, number>();
  for (const entry of live) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
  return {
    total: live.length,
    byKind: [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((left, right) => right.count - left.count || contributionKinds.indexOf(left.kind) - contributionKinds.indexOf(right.kind)),
    lastAt: live.reduce<Instant | null>((latest, entry) => Math.max(latest ?? 0, entry.occurredAt) || null, null),
  };
}

/** "2 portföy · 1 müşteri · 1 yetki", or null when this person has brought nothing yet. */
export function contributionSummaryLine(summary: ContributionSummary): string | null {
  if (!summary.total) return null;
  return summary.byKind.map((entry) => `${entry.count} ${contributionKindCountLabels[entry.kind]}`).join(" · ");
}

/**
 * The kinds worth offering for a line that just became a record. A line that
 * produced a portfolio was a portfolio lead; one that produced a person was a
 * referral. Offering all six every time makes the advisor read a list instead
 * of confirming what they already know.
 */
export function suggestedContributionKind(subjectType: ContributionSubjectType): ContributionKind {
  if (subjectType === "portfolio_item" || subjectType === "listing") return "listing_lead";
  if (subjectType === "contact") return "referral";
  if (subjectType === "opportunity") return "customer_lead";
  if (subjectType === "deal") return "partner";
  return "information";
}
