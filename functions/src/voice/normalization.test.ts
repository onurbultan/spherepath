import { describe, expect, it } from "vitest";
import { emptyVoiceInsights, voiceExtractionSchema } from "../../../packages/shared/src/index.js";
import { normalizeVoiceExtraction } from "./normalization.js";

function extraction(transactionType: "buy" | "sell" | "rent", nextActionType: "message" | "valuation" | "other") {
  return voiceExtractionSchema.parse({
    isUnclear: false,
    interaction: {
      channel: "phone",
      objective: "follow_up",
      direction: "mutual",
      outcome: "Test sonucu",
      askOutcome: "positive",
      noteSummary: "Test özeti",
      nextActionType,
      daysFromNow: 1,
      actionTime: null,
    },
    insights: {
      ...emptyVoiceInsights,
      propertyPreferences: { ...emptyVoiceInsights.propertyPreferences, transactionType },
    },
    confidence: [],
    provenance: { engine: "rules", model: null, promptVersion: "test" },
  });
}

describe("voice extraction normalization", () => {
  it("preserves room configuration and both ends of an area range", () => {
    const result = normalizeVoiceExtraction(extraction("rent", "message"), "En az 3+1 ve 250-350 m2 ofis arıyor.");
    expect(result.insights.propertyPreferences).toMatchObject({
      bedroomCountMin: 3,
      livingRoomCountMin: 1,
      roomCountMin: null,
      areaMinM2: 250,
      areaMaxM2: 350,
    });
    expect(result.insights.propertyContext).toBe("search_preference");
  });

  it("marks seller property as subject property and conditional acceptance as unclear", () => {
    const result = normalizeVoiceExtraction(extraction("sell", "valuation"), "Yetkilendirmeye olumlu bakıyor ancak değerlemeyi görmeden karar vermeyecek.");
    expect(result.insights.propertyContext).toBe("subject_property");
    expect(result.interaction.askOutcome).toBe("unclear");
  });

  it("selects an earlier promised email before a later valuation", () => {
    const result = normalizeVoiceExtraction(extraction("sell", "valuation"), "Öncesinde emsal verilerini e-posta ile göndereceğim. Cuma değerleme yapacağız.");
    expect(result.interaction.nextActionType).toBe("message");
  });

  it("normalizes an earlier email even when the model labels it as other", () => {
    const result = normalizeVoiceExtraction(extraction("sell", "other"), "Öncesinde emsal verilerini e-posta ile göndereceğim. Cuma değerleme yapacağız.");
    expect(result.interaction.nextActionType).toBe("message");
  });

  it("uses the latest room configuration when old preferences are revoked", () => {
    const source = extraction("buy", "message");
    const result = normalizeVoiceExtraction({
      ...source,
      interaction: { ...source.interaction, askOutcome: "not_applicable" },
      insights: {
        ...source.insights,
        keyThingsToRemember: ["Eski 2+1 kriteri artık geçersiz.", "Havuz şart değil.", "Kendisi arayacak."],
      },
    }, "Eskiden 2+1 arıyordu ama artık geçerli değil. Güncel olarak en az 3+1 arıyor; havuz şart değil.");

    expect(result.insights.propertyPreferences).toMatchObject({ bedroomCountMin: 3, livingRoomCountMin: 1 });
    expect(result.insights.keyThingsToRemember).toEqual(["Kendisi arayacak."]);
    expect(result.interaction.askOutcome).toBe("not_asked");
  });
});
