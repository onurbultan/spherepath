import { describe, expect, it } from "vitest";
import { buildTodayOverview, dailyTaskOutcomeSchema, todayOverviewQuerySchema } from "./build-overview.js";

describe("today overview", () => {
  it("keeps a one-off skip separate from a permanent communication preference", () => {
    const base = { taskId: "next-action-contact-1", outcomeNote: null, rescheduledAt: null, rescheduledActionType: null };
    expect(dailyTaskOutcomeSchema.safeParse({ ...base, status: "skipped", skippedReason: "Bugün uygun değil." }).success).toBe(true);
    expect(dailyTaskOutcomeSchema.safeParse({ ...base, status: "contact_opt_out", skippedReason: null }).success).toBe(false);
    expect(dailyTaskOutcomeSchema.parse({ ...base, status: "contact_opt_out", skippedReason: "Telefon ve WhatsApp istemiyor." }).status).toBe("contact_opt_out");
  });

  it("keeps empty legacy queries on the 30 day default", () => {
    expect(todayOverviewQuerySchema.parse(undefined)).toEqual({ period: "30d" });
    expect(todayOverviewQuerySchema.parse(null)).toEqual({ period: "30d" });
    expect(todayOverviewQuerySchema.parse({})).toEqual({ period: "30d" });
    expect(todayOverviewQuerySchema.safeParse({ period: "forever" }).success).toBe(false);
  });

  it("turns a new contact into an acquaintance count and first-interaction task", () => {
    const overview = buildTodayOverview([{
      id: "contact-1",
      name: "Ayşe Kaya",
      createdAt: 1_000,
      meaningfulTouchCount: 0,
      nextActionAt: null,
      nextActionType: null,
    }], [], 2_000);

    expect(overview.stages.acquaintance).toBe(1);
    expect(overview.stages.relationship).toBe(0);
    expect(overview.tasks[0]?.type).toBe("record_interaction");
  });

  it("prioritizes scheduled next actions without hiding the remaining work", () => {
    const contacts = Array.from({ length: 7 }, (_, index) => ({
      id: `contact-${index}`,
      name: `Kişi ${index}`,
      createdAt: 1_000,
      meaningfulTouchCount: 1,
      nextActionAt: 10_000 - index,
      nextActionType: "call" as const,
    }));
    const overview = buildTodayOverview(contacts, [], 2_000);
    expect(overview.tasks).toHaveLength(7);
    expect(overview.tasks[0]?.contactId).toBe("contact-6");
  });

  it("keeps separate contact and opportunity actions visible", () => {
    const now = 2_000;
    const overview = buildTodayOverview([{ id: "contact-1", name: "Ayşe", createdAt: 1_000, meaningfulTouchCount: 1, nextActionAt: 3_000, nextActionType: "call" }], [{ id: "opportunity-1", subjectContactId: "contact-1", subjectContactName: "Ayşe", stage: "first_contact", createdAt: 1_000, nextActionAt: 4_000, nextActionType: "appointment" }], now);
    expect(overview.tasks.map((item) => item.id).sort()).toEqual(["next-action-contact-1", "opportunity-action-opportunity-1"]);
  });

  it("ranks a broken promise above an on-time opportunity action", () => {
    const now = 10 * 86_400_000;
    const overdue = { id: "contact-1", name: "Ayşe", createdAt: 0, meaningfulTouchCount: 1, nextActionAt: now - 2 * 86_400_000, nextActionType: "call" as const };
    const onTime = { id: "opportunity-1", subjectContactId: "contact-2", subjectContactName: "Deniz", stage: "appointment" as const, createdAt: 0, nextActionAt: now + 86_400_000, nextActionType: "appointment" as const, estimatedValue: { amount: 9_000_000, currency: "TRY" } };
    const overview = buildTodayOverview([overdue], [onTime], now);
    expect(overview.tasks[0]?.id).toBe("next-action-contact-1");
  });

  it("puts the larger deal first when two opportunities are equally overdue", () => {
    const now = 10 * 86_400_000;
    const due = now - 86_400_000;
    const small = { id: "small", subjectContactId: "contact-1", subjectContactName: "Küçük", stage: "appointment" as const, createdAt: 0, nextActionAt: due, nextActionType: "call" as const, estimatedValue: { amount: 500_000, currency: "TRY" } };
    const large = { id: "large", subjectContactId: "contact-2", subjectContactName: "Büyük", stage: "appointment" as const, createdAt: 0, nextActionAt: due, nextActionType: "call" as const, estimatedValue: { amount: 9_000_000, currency: "TRY" } };
    const overview = buildTodayOverview([], [small, large], now);
    expect(overview.tasks[0]?.id).toBe("opportunity-action-large");
  });

  it("compares deal size within a currency rather than across currencies", () => {
    const now = 10 * 86_400_000;
    const due = now - 86_400_000;
    const topOfItsCurrency = { id: "gbp", subjectContactId: "contact-1", subjectContactName: "Sterlin", stage: "appointment" as const, createdAt: 0, nextActionAt: due, nextActionType: "call" as const, estimatedValue: { amount: 400_000, currency: "GBP" } };
    const midOfItsCurrency = { id: "try", subjectContactId: "contact-2", subjectContactName: "Lira", stage: "appointment" as const, createdAt: 0, nextActionAt: due, nextActionType: "call" as const, estimatedValue: { amount: 5_000_000, currency: "TRY" } };
    const ceiling = { id: "try-top", subjectContactId: "contact-3", subjectContactName: "Tavan", stage: "appointment" as const, createdAt: 0, nextActionAt: now + 86_400_000, nextActionType: "call" as const, estimatedValue: { amount: 20_000_000, currency: "TRY" } };
    const overview = buildTodayOverview([], [topOfItsCurrency, midOfItsCurrency, ceiling], now);
    expect(overview.tasks[0]?.id).toBe("opportunity-action-gbp");
  });

  it("turns an open opportunity next action into the first task", () => {
    const overview = buildTodayOverview([], [{
      id: "opportunity-1",
      subjectContactId: "contact-1",
      subjectContactName: "Deniz Aral",
      stage: "appointment",
      nextActionAt: 3_000,
      nextActionType: "appointment",
    }], 2_000);
    expect(overview.tasks[0]).toMatchObject({ opportunityId: "opportunity-1", title: "Deniz Aral" });
  });

  it("shows only today's interactions in reverse chronological order", () => {
    const now = Date.UTC(2026, 7, 29, 12);
    const overview = buildTodayOverview([], [], now, [], [], new Set(), [
      { id: "older", contactId: "contact-1", contactName: "Dün", outcome: "Eski görüşme", occurredAt: Date.UTC(2026, 7, 28, 12) },
      { id: "first", contactId: "contact-2", contactName: "Ayşe", outcome: "İlk görüşme", occurredAt: Date.UTC(2026, 7, 29, 8) },
      { id: "latest", contactId: "contact-3", contactName: "Deniz", outcome: "Son görüşme", occurredAt: Date.UTC(2026, 7, 29, 10) },
    ]);

    expect(overview.recentInteractions.map((item) => item.id)).toEqual(["latest", "first"]);
  });

  it("uses the selected reporting window for every funnel stage", () => {
    const now = Date.UTC(2026, 7, 29, 12);
    const old = now - 60 * 86_400_000;
    const recent = now - 10 * 86_400_000;
    const contacts = [
      { id: "old", name: "Eski", createdAt: old, meaningfulTouchCount: 1, lastTouchAt: old, nextActionAt: null, nextActionType: null },
      { id: "recent", name: "Yeni", createdAt: recent, meaningfulTouchCount: 1, lastTouchAt: recent, nextActionAt: null, nextActionType: null },
    ];
    const opportunities = [
      { id: "old-lead", subjectContactId: "old", subjectContactName: "Eski", stage: "new_lead" as const, createdAt: old, nextActionAt: null, nextActionType: null },
      { id: "recent-lead", subjectContactId: "recent", subjectContactName: "Yeni", stage: "new_lead" as const, createdAt: recent, nextActionAt: null, nextActionType: null },
    ];

    const thirtyDays = buildTodayOverview(contacts, opportunities, now, [], [], new Set(), [], "30d");
    const ninetyDays = buildTodayOverview(contacts, opportunities, now, [], [], new Set(), [], "90d");

    expect(thirtyDays).toMatchObject({ period: "30d", stages: { acquaintance: 1, relationship: 1, lead: 1 } });
    expect(ninetyDays).toMatchObject({ period: "90d", stages: { acquaintance: 2, relationship: 2, lead: 2 } });
  });
});
