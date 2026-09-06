import { describe, expect, it } from "vitest";
import { accessRequestNextStatus, createDataSubjectRequestSchema, resolveDataSubjectRequestSchema } from "./data-subject-request.js";

describe("data subject requests", () => {
  it("requires details for a correction request", () => {
    expect(createDataSubjectRequestSchema.safeParse({ contactId: "contact-1", type: "correction", requesterReference: "", details: "" }).success).toBe(false);
  });

  it("accepts an access request without free-text details", () => {
    expect(createDataSubjectRequestSchema.safeParse({ contactId: "contact-1", type: "access", requesterReference: "case-1", details: "" }).success).toBe(true);
  });

  it("does not allow correction data on a rejection", () => {
    expect(resolveDataSubjectRequestSchema.safeParse({
      requestId: "request-1",
      decision: "rejected",
      resolutionNote: "Identity could not be verified.",
      correctedContact: { fullName: "Updated Person", phone: "", metAtPlace: "", source: "in_person", role: "unknown" },
    }).success).toBe(false);
  });
});


describe("access request lifecycle", () => {
  it("keeps verification, preparation and delivery as separate steps", () => {
    expect(accessRequestNextStatus("pending_verification", "approved")).toBe("approved");
    expect(accessRequestNextStatus("approved", "prepared")).toBe("processing");
    expect(accessRequestNextStatus("processing", "completed")).toBe("completed");
  });
  it("rejects delivery before preparation and reopens no terminal request", () => {
    expect(() => accessRequestNextStatus("pending_verification", "completed")).toThrow();
    expect(() => accessRequestNextStatus("approved", "completed")).toThrow();
    expect(() => accessRequestNextStatus("completed", "approved")).toThrow();
  });
});
