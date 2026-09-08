import { describe, expect, it } from "vitest";
import { opportunitiesForJourney } from "./opportunity-list-scope";

describe("opportunitiesForJourney", () => {
  const opportunities = [
    { id: "owner-sale-1", type: "seller_listing" as const, stage: "won" },
    { id: "owner-rent-1", type: "landlord_listing" as const, stage: "won" },
    { id: "buyer-1", type: "buyer_requirement" as const, stage: "won" },
  ];

  it("keeps counters and rows in the selected opportunity journey", () => {
    expect(opportunitiesForJourney(opportunities, "owner")).toHaveLength(2);
    expect(opportunitiesForJourney(opportunities, "requirement")).toHaveLength(1);
  });

  it("keeps every journey when the advisor asks for the whole day's work", () => {
    expect(opportunitiesForJourney(opportunities, "all")).toHaveLength(3);
  });

  it("does not hand back the caller's own array to mutate", () => {
    expect(opportunitiesForJourney(opportunities, "all")).not.toBe(opportunities);
  });
});
