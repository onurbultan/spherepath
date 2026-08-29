import { describe, expect, it } from "vitest";
import { swipeDestination } from "./swipe-tabs";

describe("swipeDestination", () => {
  it("moves between adjacent tabs", () => {
    expect(swipeDestination("/", -90, 0)).toBe("/funnel");
    expect(swipeDestination("/funnel", 90, 0)).toBe("/");
  });

  it("accepts a fast, short swipe", () => {
    expect(swipeDestination("/listings", -35, -0.5)).toBe("/contacts");
  });

  it("ignores taps, unknown routes, and edge swipes", () => {
    expect(swipeDestination("/", -20, -0.1)).toBeNull();
    expect(swipeDestination("/settings", -100, -1)).toBeNull();
    expect(swipeDestination("/contacts", -100, -1)).toBeNull();
  });
});
