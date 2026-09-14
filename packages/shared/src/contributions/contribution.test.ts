import { describe, expect, it } from "vitest";
import {
  contributionSummaryLine,
  createContribution,
  summariseContributions,
  suggestedContributionKind,
  type Contribution,
} from "./contribution.js";

const tenant = { officeId: "o1", ownerUid: "u1" };
const entry = (kind: Contribution["kind"], occurredAt: number, deleted = false): Contribution => ({
  ...tenant, contactId: "c1", kind, subjectType: "note", subjectId: null,
  note: "x", sourceInboxItemId: null, occurredAt,
  deletedAt: deleted ? 1 : null, createdAt: occurredAt, updatedAt: occurredAt,
});

describe("what somebody has brought the advisor", () => {
  it("records the contribution with the moment it happened", () => {
    const contribution = createContribution({
      contactId: "c1", kind: "listing_lead", subjectType: "portfolio_item",
      subjectId: "p1", note: "Akın'ın tarlası için yetki aldık", sourceInboxItemId: "note-1", occurredAt: null,
    }, tenant, 5_000);
    expect(contribution.occurredAt).toBe(5_000);
    expect(contribution.deletedAt).toBeNull();
  });

  it("keeps a backdated contribution at the date it actually happened", () => {
    const contribution = createContribution({
      contactId: "c1", kind: "partner", subjectType: "deal",
      subjectId: "d1", note: "Satışta ortak yaptık", sourceInboxItemId: null, occurredAt: 2_000,
    }, tenant, 5_000);
    expect(contribution.occurredAt).toBe(2_000);
  });

  it("counts the ledger by kind, most of it first", () => {
    const summary = summariseContributions([
      entry("listing_lead", 1_000), entry("listing_lead", 2_000),
      entry("customer_lead", 3_000), entry("mandate", 4_000),
    ]);
    expect(summary.total).toBe(4);
    expect(summary.byKind[0]).toEqual({ kind: "listing_lead", count: 2 });
    expect(summary.lastAt).toBe(4_000);
  });

  it("leaves a removed contribution out of the count", () => {
    const summary = summariseContributions([entry("referral", 1_000), entry("referral", 2_000, true)]);
    expect(summary.total).toBe(1);
  });

  it("reads back as the sentence the advisor asked for", () => {
    const summary = summariseContributions([
      entry("listing_lead", 1_000), entry("listing_lead", 2_000), entry("customer_lead", 3_000),
    ]);
    expect(contributionSummaryLine(summary)).toBe("2 portföy · 1 müşteri");
  });

  it("says nothing for somebody who has brought nothing yet", () => {
    expect(contributionSummaryLine(summariseContributions([]))).toBeNull();
  });

  it("offers the kind that fits what the line produced", () => {
    expect(suggestedContributionKind("portfolio_item")).toBe("listing_lead");
    expect(suggestedContributionKind("contact")).toBe("referral");
    expect(suggestedContributionKind("opportunity")).toBe("customer_lead");
    expect(suggestedContributionKind("deal")).toBe("partner");
  });
});
