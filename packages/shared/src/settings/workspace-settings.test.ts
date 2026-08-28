import { describe, expect, it } from "vitest";
import { workspaceSettingsSchema } from "./workspace-settings.js";

const validSettings = {
  displayName: "Spherepath Advisor",
  phone: "+90 555 000 00 00",
  defaultRegions: ["Kadıköy"],
  monthlyPortfolioTarget: 8,
  weeklyCapacity: 20,
  country: "TR" as const,
  dataControllerName: "Spherepath Office",
  verbisStatus: "unknown" as const,
  trncFilingConfirmed: false,
  trncTransferLicenseConfirmed: false,
  dailyPlanReminderEnabled: true,
  dailyPlanReminderHour: 8,
  dailyPlanReminderMinute: 30,
};

describe("workspace settings", () => {
  it("accepts a valid Türkiye workspace", () => {
    expect(workspaceSettingsSchema.parse(validSettings).country).toBe("TR");
  });

  it("blocks TRNC until both transfer safeguards are confirmed", () => {
    expect(workspaceSettingsSchema.safeParse({ ...validSettings, country: "TRNC" }).success).toBe(false);
    expect(workspaceSettingsSchema.safeParse({ ...validSettings, country: "TRNC", trncFilingConfirmed: true, trncTransferLicenseConfirmed: true }).success).toBe(true);
  });

  it("rejects out-of-range reminder time", () => {
    expect(workspaceSettingsSchema.safeParse({ ...validSettings, dailyPlanReminderHour: 24 }).success).toBe(false);
  });
});
