import { describe, expect, it } from "vitest";
import { buildFunnelCoaching, buildFunnelTargetProgress, type FunnelCounts } from "./build-funnel";

describe("buildFunnelCoaching", () => {
  it("gives a constructive lead prompt", () => {
    const result = buildFunnelCoaching({ newPeople: 30, leads: 0, appointments: 0, portfolioMeetings: 0, authorizedListings: 0, negotiations: 0, closings: 0 });
    expect(result.title).toContain("gayrimenkul");
    expect(result.script).toContain("Çevrenizde");
  });
  it("does not diagnose a tiny sample", () => {
    expect(buildFunnelCoaching({ newPeople: 2, leads: 0, appointments: 0, portfolioMeetings: 0, authorizedListings: 0, negotiations: 0, closings: 0 }).target).toBe("capture");
  });
});

const counts = (authorizedListings: number): FunnelCounts => ({
  newPeople: 10, leads: 4, appointments: 3, portfolioMeetings: 2, authorizedListings, negotiations: 1, closings: 0,
});

describe("buildFunnelTargetProgress", () => {
  it("scales the monthly target to the reporting period", () => {
    expect(buildFunnelTargetProgress(counts(6), "90d", 4)).toMatchObject({ monthlyTarget: 4, periodTarget: 12, achieved: 6, ratio: 0.5 });
    expect(buildFunnelTargetProgress(counts(6), "30d", 4).periodTarget).toBe(4);
    expect(buildFunnelTargetProgress(counts(6), "1y", 4).periodTarget).toBe(48);
  });

  it("reports no ratio while the advisor has not set a target", () => {
    expect(buildFunnelTargetProgress(counts(6), "30d", null)).toMatchObject({ monthlyTarget: null, periodTarget: null, achieved: 6, ratio: null });
  });
});
