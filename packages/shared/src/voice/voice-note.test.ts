import { describe, expect, it } from "vitest";
import {
  emptyVoicePropertyPreferences,
  mergePropertySituations,
  mergeVoiceInsightsIntoContactMemory,
  registerVoiceTextTestSchema,
  retryVoiceNoteProcessingSchema,
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
      propertySituations: [],
      updatedAt: 1,
    }, {
      keyThingsToRemember: ["açık mutfak istiyor", "İki araçlık otopark önemli"],
      propertyContext: "search_preference",
      propertyPreferences: { ...emptyVoicePropertyPreferences, preferredLocations: ["Moda"] },
      propertySituations: [],
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
      propertySituations: [],
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
      propertySituations: [],
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

  it("validates a queued voice-note recovery command", () => {
    expect(retryVoiceNoteProcessingSchema.parse({ voiceNoteId: "voice-note-1" })).toEqual({ voiceNoteId: "voice-note-1" });
    expect(retryVoiceNoteProcessingSchema.safeParse({ voiceNoteId: "" }).success).toBe(false);
  });
});

describe("mergePropertySituations", () => {
  const preferences = (transactionType: "buy" | "sell") => ({ ...emptyVoicePropertyPreferences, transactionType });
  const selling = { propertyContext: "subject_property" as const, summary: "Bornova'daki 3+1 dairesini satıyor", propertyPreferences: preferences("sell") };
  const buying = { propertyContext: "search_preference" as const, summary: "Urla'da bahçeli ev arıyor", propertyPreferences: preferences("buy") };

  it("keeps both sides when a contact is selling one home and buying another", () => {
    const merged = mergePropertySituations([], [selling, buying]);
    expect(merged).toHaveLength(2);
    expect(merged.map((situation) => situation.propertyContext)).toEqual(["subject_property", "search_preference"]);
  });

  it("refreshes a situation instead of duplicating the same side", () => {
    const updated = { ...buying, summary: "Urla'da bahçeli ev arıyor, bütçe arttı" };
    const merged = mergePropertySituations([selling, buying], [updated]);
    expect(merged).toHaveLength(2);
    expect(merged.find((situation) => situation.propertyContext === "search_preference")?.summary).toContain("bütçe arttı");
  });

  it("drops the least recently touched situation once the cap is reached", () => {
    const renting = { propertyContext: "search_preference" as const, summary: "Ofis kiralamak istiyor", propertyPreferences: { ...emptyVoicePropertyPreferences, transactionType: "rent" as const } };
    const investing = { propertyContext: "search_preference" as const, summary: "Yatırımlık arsa bakıyor", propertyPreferences: { ...emptyVoicePropertyPreferences, transactionType: "invest" as const } };
    const merged = mergePropertySituations([selling, buying, renting], [investing]);
    expect(merged).toHaveLength(3);
    expect(merged.some((situation) => situation.summary === selling.summary)).toBe(false);
    expect(merged.some((situation) => situation.summary === investing.summary)).toBe(true);
  });
});
