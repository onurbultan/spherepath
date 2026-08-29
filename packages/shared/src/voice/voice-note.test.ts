import { describe, expect, it } from "vitest";
import {
  emptyVoicePropertyPreferences,
  mergeVoiceInsightsIntoContactMemory,
  registerVoiceTextTestSchema,
  voiceExtractionSchema,
} from "./voice-note.js";

describe("voice extraction contract", () => {
  it("accepts a structured Turkish CRM extraction with English field names", () => {
    const result = voiceExtractionSchema.parse({
      isUnclear: false,
      interaction: {
        channel: "in_person",
        objective: "follow_up",
        direction: "mutual",
        outcome: "Kadıköy'de iki odalı bir daire arıyor.",
        askOutcome: "positive",
        noteSummary: "Bütçe ve konum tercihleri konuşuldu.",
        nextActionType: "message",
        daysFromNow: 2,
      },
      insights: {
        keyThingsToRemember: ["Sessiz bir çalışma odası istiyor."],
        propertyContext: "search_preference",
        propertyPreferences: {
          ...emptyVoicePropertyPreferences,
          transactionType: "buy",
          propertyTypes: ["apartment"],
          preferredLocations: ["Kadıköy"],
          budgetRange: { min: 6_500_000, max: 7_000_000, currency: "TRY" },
          roomCountMin: 2,
          mustHaves: ["Sessiz çalışma odası"],
        },
        suggestedActionReason: "İki gün içinde uygun ilanları gönder.",
      },
      confidence: [{ path: "insights.propertyPreferences.budgetRange", score: 0.94 }],
      provenance: { engine: "vertex_ai", model: "gemini-flash", promptVersion: "voice-extraction-v1" },
    });

    expect(result.insights.propertyPreferences.budgetRange?.max).toBe(7_000_000);
    expect(result.insights.keyThingsToRemember[0]).toContain("çalışma odası");
  });

  it("merges approved memories without duplicating Turkish text", () => {
    const memory = mergeVoiceInsightsIntoContactMemory({
      keyThingsToRemember: ["Açık mutfak istiyor"],
      propertyPreferences: { ...emptyVoicePropertyPreferences, preferredLocations: ["Kadıköy"] },
      updatedAt: 1,
    }, {
      keyThingsToRemember: ["açık mutfak istiyor", "İki araçlık otopark önemli"],
      propertyContext: "search_preference",
      propertyPreferences: { ...emptyVoicePropertyPreferences, preferredLocations: ["Moda"] },
      suggestedActionReason: null,
    }, 2);

    expect(memory.keyThingsToRemember).toEqual(["açık mutfak istiyor", "İki araçlık otopark önemli"]);
    expect(memory.propertyPreferences.preferredLocations).toEqual(["Moda", "Kadıköy"]);
    expect(memory.updatedAt).toBe(2);
  });

  it("does not merge a seller's subject property into search preferences", () => {
    const memory = mergeVoiceInsightsIntoContactMemory({
      keyThingsToRemember: [],
      propertyPreferences: { ...emptyVoicePropertyPreferences, preferredLocations: ["Kadıköy"] },
      updatedAt: 1,
    }, {
      keyThingsToRemember: ["Ataşehir'de 185 m² bir dairesi var."],
      propertyContext: "subject_property",
      propertyPreferences: {
        ...emptyVoicePropertyPreferences,
        transactionType: "sell",
        preferredLocations: ["Ataşehir"],
        areaMinM2: 185,
        areaMaxM2: 185,
      },
      suggestedActionReason: null,
    }, 2);

    expect(memory.propertyPreferences.preferredLocations).toEqual(["Kadıköy"]);
    expect(memory.propertyPreferences.transactionType).toBeNull();
    expect(memory.keyThingsToRemember).toContain("Ataşehir'de 185 m² bir dairesi var.");
  });

  it("validates temporary text-test input without audio fields", () => {
    expect(registerVoiceTextTestSchema.parse({
      contactId: "contact-1",
      transcript: "Kadıköy'de üç odalı bir daire arıyor.",
    })).toEqual({
      contactId: "contact-1",
      transcript: "Kadıköy'de üç odalı bir daire arıyor.",
    });
    expect(registerVoiceTextTestSchema.safeParse({ contactId: "contact-1", transcript: " " }).success).toBe(false);
  });
});
