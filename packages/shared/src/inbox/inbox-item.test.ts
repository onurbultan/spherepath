import { describe, expect, it } from "vitest";
import { emptyVoiceInsights } from "../voice/voice-note";
import { classifyInboxText, inboxAnalysisHighlights, inboxKindAfterAnalysis, inboxOpportunityType, isInboxItemResolved, maskSensitiveInboxText, processInboxItemSchema, updateInboxItemSchema, type InboxAppliedAction, type InboxItemAnalysis } from "./inbox-item";

describe("inbox classification", () => {
  it("suggests a requirement and detects a location", () => {
    const result = classifyInboxText("Urla'da bahçeli ev arıyor. Bütçe 12 milyon.");
    expect(result.kind).toBe("requirement");
    expect(result.needsLocation).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.92);
  });

  it("asks for location on a property note without one", () => {
    const result = classifyInboxText("Satılık üç artı bir bahçeli ev duydum.");
    expect(result.kind).toBe("property");
    expect(result.needsLocation).toBe(true);
  });

  it("masks a complete sensitive sentence", () => {
    const result = maskSensitiveInboxText("Bahçeli ev arıyor. Sağlık sorunu var. Haftaya ara.");
    expect(result.masked).toBe(true);
    expect(result.text).not.toContain("Sağlık sorunu");
  });

  it("only treats an explicit name and phone pair as an auto-creatable person", () => {
    expect(classifyInboxText("Kişi: Derya Kaya Telefon: +90 532 111 22 33").explicitContact).toEqual({ fullName: "Derya Kaya", phone: "+905321112233" });
    expect(classifyInboxText("Derya ile tanıştım").explicitContact).toBeNull();
  });

  it("allows the advisor to edit and link a note", () => {
    expect(updateInboxItemSchema.parse({ inboxItemId: "note-1", text: "Düzeltilmiş not", linkedContactId: "contact-1" })).toMatchObject({ text: "Düzeltilmiş not", linkedContactId: "contact-1" });
  });

  it("validates a requirement conversion as one trusted command", () => {
    expect(processInboxItemSchema.parse({ inboxItemId: "note-1", action: "requirement", contactId: "contact-1", opportunityType: "buyer_requirement", nextActionType: "call", nextActionAt: Date.now() + 86_400_000, approvedInsights: emptyVoiceInsights }).action).toBe("requirement");
    expect(processInboxItemSchema.safeParse({ inboxItemId: "note-1", action: "requirement", contactId: "contact-1", opportunityType: "seller_listing", nextActionType: "call", nextActionAt: Date.now() + 86_400_000, approvedInsights: emptyVoiceInsights }).success).toBe(false);
  });

  it("validates a new person, interaction, opportunity and follow-up as one trusted command", () => {
    const result = processInboxItemSchema.parse({
      inboxItemId: "note-1",
      action: "person",
      contact: {
        fullName: "Selin Aras",
        phone: "",
        metAtPlace: "Telefon görüşmesi",
        source: "inbound_call",
        role: "tenant",
        nextActionType: "message",
        nextActionAt: Date.now() + 86_400_000,
      },
      approvedInsights: emptyVoiceInsights,
      opportunityType: "tenant_requirement",
    });
    expect(result).toMatchObject({ action: "person", recordInteraction: true, opportunityType: "tenant_requirement" });
  });

  it("does not open work for a new person without a dated first follow-up", () => {
    expect(processInboxItemSchema.safeParse({
      inboxItemId: "note-1",
      action: "person",
      contact: { fullName: "Selin Aras", phone: "", metAtPlace: "", source: "other", role: "tenant" },
      opportunityType: "tenant_requirement",
    }).success).toBe(false);
  });
});

describe("post-analysis inbox routing", () => {
  const analysis = {
    insights: {
      keyThingsToRemember: [], propertyContext: null,
      propertyPreferences: { transactionType: null, propertyTypes: [], preferredLocations: [], budgetRange: null, bedroomCountMin: null, livingRoomCountMin: null, roomCountMin: null, areaMinM2: null, areaMaxM2: null, mustHaves: [], dealBreakers: [], timeline: null },
      propertySituations: [], suggestedActionReason: null, contactName: "Mert Yalın", contactPhone: null,
    },
    nextActionType: "call", nextActionAt: Date.now() + 86_400_000,
    opportunityType: "seller_listing", engine: "rules",
  } satisfies InboxItemAnalysis;

  it("routes an unlinked typed note naming someone to the person workflow", () => {
    expect(inboxKindAfterAnalysis("follow_up", "typed", null, analysis)).toBe("person");
  });

  it("does not reinterpret linked or WhatsApp notes", () => {
    expect(inboxKindAfterAnalysis("follow_up", "typed", "contact-1", analysis)).toBe("follow_up");
    expect(inboxKindAfterAnalysis("property", "whatsapp", null, analysis)).toBe("property");
  });

  it("derives a seller opportunity from a subject-property situation", () => {
    expect(inboxOpportunityType({
      ...analysis.insights,
      propertySituations: [{
        propertyContext: "subject_property",
        summary: "Balıklıova'da satılık villa",
        propertyPreferences: { ...analysis.insights.propertyPreferences, transactionType: "sell" },
      }],
    })).toBe("seller_listing");
  });
});

describe("resolved notes", () => {
  const action = (type: InboxAppliedAction["type"], undoneAt: number | null = null): InboxAppliedAction =>
    ({ type, entityId: null, label: type, appliedAt: 1, undoneAt });

  it("treats a note that produced a record as finished", () => {
    expect(isInboxItemResolved({ appliedActions: [action("contact_created")] })).toBe(true);
    expect(isInboxItemResolved({ appliedActions: [action("listing_created")] })).toBe(true);
  });

  it("does not count classification, which happens to every note", () => {
    expect(isInboxItemResolved({ appliedActions: [action("classification")] })).toBe(false);
    expect(isInboxItemResolved({ appliedActions: [] })).toBe(false);
  });

  it("reopens a note whose action was undone", () => {
    expect(isInboxItemResolved({ appliedActions: [action("contact_created", 2)] })).toBe(false);
  });
});

describe("what the card can show", () => {
  const analysis = (situations: Array<{ summary: string }>, nextActionType: "call" | null = null) => ({
    insights: { ...emptyVoiceInsights, propertySituations: situations.map((s) => ({ ...s, propertyContext: "subject_property" as const, propertyPreferences: emptyVoiceInsights.propertyPreferences })) },
    nextActionType, nextActionAt: null, opportunityType: "buyer_requirement" as const, engine: "vertex_ai" as const,
  });

  it("shows every situation, because one call holds more than one", () => {
    expect(inboxAnalysisHighlights(analysis([{ summary: "Kadıovacık'ta 620 m² satılık arsa." }, { summary: "İçmeler'de 600 m² üzeri arayış." }])))
      .toEqual(["Kadıovacık'ta 620 m² satılık arsa.", "İçmeler'de 600 m² üzeri arayış."]);
  });

  it("adds the next step when the note names one", () => {
    expect(inboxAnalysisHighlights(analysis([{ summary: "Bir mülk." }], "call"))).toContain("Sonraki: Ara");
  });

  it("says nothing before the note has been read", () => {
    expect(inboxAnalysisHighlights(null)).toEqual([]);
  });
});
