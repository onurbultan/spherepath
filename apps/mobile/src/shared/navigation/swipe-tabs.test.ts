import { describe, expect, it } from "vitest";
import { swipeDestination } from "./swipe-tabs";

describe("swipeDestination", () => {
  it("moves between adjacent tabs", () => {
    expect(swipeDestination("/", -90, 0)).toBe("/contacts");
    expect(swipeDestination("/contacts", 90, 0)).toBe("/");
  });

  it("accepts a fast, short swipe", () => {
    expect(swipeDestination("/listings", -35, -0.5)).toBeNull();
    expect(swipeDestination("/opportunities", 35, 0.5)).toBe("/capture");
  });

  it("ignores taps, unknown routes, and edge swipes", () => {
    expect(swipeDestination("/", -20, -0.1)).toBeNull();
    expect(swipeDestination("/settings", -100, -1)).toBeNull();
    expect(swipeDestination("/funnel", -100, -1)).toBeNull();
    expect(swipeDestination("/listings", -100, -1)).toBeNull();
  });
});
