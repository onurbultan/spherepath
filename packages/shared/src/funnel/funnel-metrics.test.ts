import { describe, expect, it } from "vitest";
import { buildFunnelMetrics, type FunnelInteraction, type FunnelStageEvent } from "./funnel-metrics";

const day = 86_400_000;
const now = 400 * day;
const event = (entityId: string, toStage: string, daysAgo: number, extra: Partial<FunnelStageEvent> = {}): FunnelStageEvent =>
  ({ entityType: "opportunity", entityId, fromStage: null, toStage, occurredAt: now - daysAgo * day, ...extra });
const interaction = (overrides: Partial<FunnelInteraction> = {}): FunnelInteraction => ({
  contactId: "contact-1", channel: "phone", objective: "request_listing", askOutcome: "positive",
  occurredAt: now - 5 * day, nextActionAt: null, ...overrides,
});

describe("buildFunnelMetrics", () => {
  it("measures how long opportunities sit in each stage", () => {
    const events = [
      event("o1", "new_lead", 20), event("o1", "first_contact", 14), event("o1", "appointment", 10),
      event("o2", "new_lead", 18), event("o2", "first_contact", 8),
    ];
    const metrics = buildFunnelMetrics(events, [], [], [], "30d", now);
    const newLead = metrics.stageDurations.find((entry) => entry.stage === "new_lead");
    expect(newLead).toMatchObject({ sampleSize: 2 });
    expect(newLead?.medianDays).toBe(8);
  });

  it("reports time to won and time to lost separately", () => {
    const events = [
      event("won-1", "new_lead", 30), event("won-1", "won", 10),
      event("lost-1", "new_lead", 25), event("lost-1", "lost", 20),
    ];
    const metrics = buildFunnelMetrics(events, [], [], [], "30d", now);
    expect(metrics.timeToWonDays).toBe(20);
    expect(metrics.timeToLostDays).toBe(5);
  });

  it("counts a correction or a reopened loss as rework", () => {
    const events = [
      event("o1", "new_lead", 20), event("o1", "appointment", 15, { correction: true }),
      event("o2", "new_lead", 20), event("o2", "first_contact", 10),
    ];
    expect(buildFunnelMetrics(events, [], [], [], "30d", now).reworkRate).toBe(0.5);
  });

  it("ranks which ask actually lands, ignoring conversations where nothing was asked", () => {
    const interactions = [
      interaction({ objective: "request_listing", askOutcome: "positive" }),
      interaction({ objective: "request_listing", askOutcome: "negative" }),
      interaction({ objective: "request_referral", askOutcome: "positive" }),
      interaction({ objective: "request_referral", askOutcome: "positive" }),
      interaction({ objective: "follow_up", askOutcome: "not_asked" }),
    ];
    const metrics = buildFunnelMetrics([], interactions, [], [], "30d", now);
    expect(metrics.askByObjective[0]).toMatchObject({ label: "Referans talebi", asked: 2, positive: 2, rate: 1 });
    expect(metrics.askByObjective.find((entry) => entry.label === "Takip")).toBeUndefined();
  });

  it("scores kept promises and ignores ones not yet due", () => {
    const interactions = [
      interaction({ contactId: "kept", occurredAt: now - 10 * day, nextActionAt: now - 8 * day }),
      interaction({ contactId: "kept", occurredAt: now - 7 * day, nextActionAt: null }),
      interaction({ contactId: "broken", occurredAt: now - 10 * day, nextActionAt: now - 8 * day }),
      interaction({ contactId: "pending", occurredAt: now - 2 * day, nextActionAt: now + 3 * day }),
    ];
    expect(buildFunnelMetrics([], interactions, [], [], "30d", now).keptPromiseRate).toEqual({ promised: 2, kept: 1, rate: 0.5 });
  });

  it("groups loss reasons and names the unexplained ones", () => {
    const metrics = buildFunnelMetrics([], [], ["Fiyat yüksek", "Fiyat yüksek", null], [], "30d", now);
    expect(metrics.lossReasons[0]).toEqual({ reason: "Fiyat yüksek", count: 2 });
    expect(metrics.lossReasons[1]).toEqual({ reason: "Neden belirtilmemiş", count: 1 });
  });

  it("attributes closed commission back to where the contact came from", () => {
    const deals = [
      { buyerSource: "referral" as const, commissionAmount: 90_000, currency: "TRY" as const, closedAt: now - 3 * day },
      { buyerSource: "listing" as const, commissionAmount: 30_000, currency: "TRY" as const, closedAt: now - 4 * day },
      { buyerSource: "referral" as const, commissionAmount: 60_000, currency: "TRY" as const, closedAt: now - 200 * day },
    ];
    const metrics = buildFunnelMetrics([], [], [], deals, "30d", now);
    expect(metrics.sourceReturns[0]).toMatchObject({ source: "referral", closedCount: 1, commission: 90_000 });
    expect(metrics.sourceReturns).toHaveLength(2);
  });

  it("refuses to call a tiny sample a finding", () => {
    expect(buildFunnelMetrics([], [interaction()], [], [], "30d", now).sampleSufficient).toBe(false);
  });
});
