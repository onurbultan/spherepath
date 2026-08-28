import { describe, expect, it } from "vitest";
import { assertListingTransition, nextListingStatuses } from "./listing-transitions.js";

describe("listing transitions", () => {
  it("allows the explicit listing lifecycle", () => {
    expect(nextListingStatuses("preparing")).toEqual(["active", "removed"]);
    expect(() => assertListingTransition("active", "sold")).not.toThrow();
  });
  it("keeps terminal statuses terminal", () => {
    expect(() => assertListingTransition("sold", "active")).toThrow();
  });
});
