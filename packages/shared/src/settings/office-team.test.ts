import { describe, expect, it } from "vitest";
import { joinOfficeSchema, officeInviteCodeSchema } from "./office-team.js";

describe("office invitation schemas", () => {
  it("normalizes a readable invitation code", () => {
    expect(joinOfficeSchema.parse({ code: " abcd2345 " })).toEqual({ code: "ABCD2345" });
  });

  it("rejects ambiguous and malformed codes", () => {
    expect(officeInviteCodeSchema.safeParse("ABCD01IL").success).toBe(false);
    expect(officeInviteCodeSchema.safeParse("ABC2345").success).toBe(false);
  });
});
