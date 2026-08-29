import { describe, expect, it } from "vitest";
import { buildFunnelCoaching } from "./build-funnel";

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
