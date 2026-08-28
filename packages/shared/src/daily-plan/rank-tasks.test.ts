import { describe, expect, it } from "vitest";
import { rankDailyTaskCandidates } from "./rank-tasks";

describe("rankDailyTaskCandidates", () => {
  it("keeps the plan small and removes compliance-blocked actions", () => {
    const ranked = rankDailyTaskCandidates(
      [
        { id: "blocked", overdueDays: 30, bottleneckImpact: 10, estimatedValueImpact: 10, ageDays: 30, complianceBlocked: true },
        { id: "overdue", overdueDays: 3, bottleneckImpact: 1, estimatedValueImpact: 0, ageDays: 2, complianceBlocked: false },
        { id: "impact", overdueDays: 0, bottleneckImpact: 8, estimatedValueImpact: 0, ageDays: 1, complianceBlocked: false },
      ],
      5,
    );

    expect(ranked.map((candidate) => candidate.id)).toEqual(["overdue", "impact"]);
  });
});
