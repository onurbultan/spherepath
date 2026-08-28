import { describe, expect, it } from "vitest";
import { buildTodayOverview } from "./build-overview.js";

describe("today overview", () => {
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

  it("prioritizes scheduled next actions and caps the plan at five", () => {
    const contacts = Array.from({ length: 7 }, (_, index) => ({
      id: `contact-${index}`,
      name: `Kişi ${index}`,
      createdAt: 1_000,
      meaningfulTouchCount: 1,
      nextActionAt: 10_000 - index,
      nextActionType: "call" as const,
    }));
    const overview = buildTodayOverview(contacts, [], 2_000);
    expect(overview.tasks).toHaveLength(5);
    expect(overview.tasks[0]?.contactId).toBe("contact-6");
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
});
