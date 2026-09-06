import { describe, expect, it } from "vitest";
import { emptyVoiceInsights, voiceExtractionSchema } from "../../../packages/shared/src/index.js";
import { normalizeVoiceExtraction } from "./normalization.js";
import { extractVoiceDraft } from "./privacy.js";

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
  it.each([
    ["18–35 milyon TL", 18_000_000, 35_000_000],
    ["18 milyon ile 35 milyon TL", 18_000_000, 35_000_000],
    ["18.000.000–35.000.000 TL", 18_000_000, 35_000_000],
    ["1,5-2 milyon TL", 1_500_000, 2_000_000],
    ["35-45 bin TL", 35_000, 45_000],
  ])("preserves both budget bounds in %s independently of the area minimum", (budget, min, max) => {
    const transcript = `Urla'da villa arıyor. Bütçesi ${budget}. En az 180 m² olmalı.`;
    const result = normalizeVoiceExtraction(extraction("buy", "message"), transcript);
    expect(result.insights.propertyPreferences).toMatchObject({ budgetRange: { min, max, currency: "TRY" }, areaMinM2: 180, areaMaxM2: null });
    expect(result.insights.propertySituations[0]?.propertyPreferences).toMatchObject({ budgetRange: { min, max, currency: "TRY" }, areaMinM2: 180, areaMaxM2: null });
  });

  it("does not apply an area minimum to a budget maximum", () => {
    const result = normalizeVoiceExtraction(extraction("buy", "message"), "Urla'da villa arıyor. Bütçesi 35 milyon TL'ye kadar. En az 180 metrekare olmalı.");
    expect(result.insights.propertyPreferences).toMatchObject({ budgetRange: { min: null, max: 35_000_000 }, areaMinM2: 180, areaMaxM2: null });
  });

  it("does not apply a budget minimum to an area maximum", () => {
    const result = normalizeVoiceExtraction(extraction("buy", "message"), "Villa arıyor. Bütçesi en az 18 milyon TL. En fazla 250 m2 olmalı.");
    expect(result.insights.propertyPreferences).toMatchObject({ budgetRange: { min: 18_000_000, max: null }, areaMinM2: null, areaMaxM2: 250 });
  });

  it("restores a missing model budget bound from the explicit complete note", () => {
    const source = extraction("buy", "message");
    const preferences = { ...source.insights.propertyPreferences, budgetRange: { min: null, max: 35_000_000, currency: "TRY" as const } };
    source.insights.propertySituations = [{ propertyContext: "search_preference", summary: "Urla'da villa arıyor.", propertyPreferences: preferences }];
    const result = normalizeVoiceExtraction(source, "Urla'da villa arıyor. Bütçesi 18–35 milyon TL. En az 180 m².");
    expect(result.insights.propertyPreferences.budgetRange).toEqual({ min: 18_000_000, max: 35_000_000, currency: "TRY" });
  });

  it("keeps grouped and decimal sale prices within their sentence", () => {
    const result = normalizeVoiceExtraction(extraction("sell", "message"), "Karşıyaka'da 180 m² evini 8.500.000 TL'ye satmak istiyor. Urla'da 18–35 milyon TL bütçeyle villa arıyor.");
    expect(result.insights.propertySituations).toHaveLength(2);
    expect(result.insights.propertySituations[0]?.propertyPreferences).toMatchObject({ transactionType: "sell", budgetRange: { min: 8_500_000, max: 8_500_000 }, areaMinM2: 180, areaMaxM2: 180 });
    expect(result.insights.propertyPreferences).toMatchObject({ transactionType: "buy", budgetRange: { min: 18_000_000, max: 35_000_000 }, areaMinM2: null });
  });

  it("does not treat a phone or room configuration as money", () => {
    const result = normalizeVoiceExtraction(extraction("buy", "message"), "3+1 ve 180–250 m² villa arıyor. Telefon: 05550001122.");
    expect(result.insights.propertyPreferences).toMatchObject({ budgetRange: null, areaMinM2: 180, areaMaxM2: 250 });
  });

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

  it("keeps explicit lifestyle requirements without inventing a detached house", () => {
    const source = extraction("buy", "other");
    const result = normalizeVoiceExtraction({
      ...source,
      interaction: { ...source.interaction, direction: "outbound" },
      insights: {
        ...source.insights,
        propertyPreferences: {
          ...source.insights.propertyPreferences,
          propertyTypes: ["detached_house"],
          mustHaves: ["Bahçeli"],
        },
      },
    }, "Derya Kaya ile bugün telefonda görüştüm. Urla'da 3+1 bahçeli bir ev arıyor. Tercihi sakin bir sokak ve denize yürüme mesafesi.");

    expect(result.interaction.direction).toBe("mutual");
    expect(result.insights.propertyPreferences.propertyTypes).toEqual([]);
    expect(result.insights.propertyPreferences.mustHaves).toEqual([
      "Bahçeli",
      "Sakin sokak",
      "Denize yürüme mesafesi",
    ]);
  });

  it("keeps a sale and a later purchase as two separate property situations", () => {
    const transcript = "Derya Hanım'la görüştüm. Karşıyaka'daki 3+1 evini 8 milyona satmaya karar vermiş. Orası satıldıktan sonra Koçlarda bir villa almayı hedefliyor. Ona ilgili portföyleri ve ilgili alıcıları bulmamız gerekiyor.";
    const result = normalizeVoiceExtraction(extractVoiceDraft(transcript), transcript);

    expect(result.insights.propertySituations).toHaveLength(2);
    expect(result.insights.propertySituations[0]).toMatchObject({
      propertyContext: "subject_property",
      propertyPreferences: {
        transactionType: "sell",
        preferredLocations: ["Karşıyaka"],
        budgetRange: { min: 8_000_000, max: 8_000_000, currency: "TRY" },
        bedroomCountMin: 3,
        livingRoomCountMin: 1,
      },
    });
    expect(result.insights.propertySituations[1]).toMatchObject({
      propertyContext: "search_preference",
      propertyPreferences: {
        transactionType: "buy",
        propertyTypes: ["villa"],
        preferredLocations: ["Koçlar"],
        bedroomCountMin: null,
      },
    });
    expect(result.insights.propertyContext).toBe("search_preference");
    expect(result.insights.propertyPreferences).toMatchObject({
      transactionType: "buy",
      propertyTypes: ["villa"],
      preferredLocations: ["Koçlar"],
      bedroomCountMin: null,
    });
  });

  it("combines a multi-sentence mobile note with typographic apostrophes", () => {
    const transcript = "Elif Karaca Urla İskele’de 3+1 bahçeli villa arıyor. Bütçesi 18 milyon TL’ye kadar. Önümüzdeki perşembe saat 10:30’da arayıp seçenekleri paylaşacağım.";
    const result = normalizeVoiceExtraction(extractVoiceDraft(transcript), transcript);

    expect(result.interaction.nextActionType).toBe("call");
    expect(result.insights.propertyPreferences).toMatchObject({
      transactionType: "buy",
      propertyTypes: ["villa"],
      preferredLocations: ["Urla İskele"],
      budgetRange: { min: null, max: 18_000_000, currency: "TRY" },
      bedroomCountMin: 3,
      livingRoomCountMin: 1,
      mustHaves: ["Bahçeli"],
    });
  });

  it("removes the known contact name from a location candidate", () => {
    const transcript = "Elif Deneme Urla'da 12 milyon TL bütçeyle 3+1 bahçeli ev arıyor.";
    const result = normalizeVoiceExtraction(extractVoiceDraft(transcript), transcript, "Elif Deneme");
    expect(result.insights.propertyPreferences.preferredLocations).toEqual(["Urla"]);
    expect(result.insights.propertyPreferences.budgetRange).toEqual({ min: null, max: 12_000_000, currency: "TRY" });
  });

  it("keeps a Turkish rental requirement's room plan, budget, pool and parking", () => {
    const transcript = "Karşıyaka'da kiralık 4+1 daire arıyor. En fazla 45 bin TL; havuz ve otopark şart.";
    const result = normalizeVoiceExtraction(extraction("rent", "message"), transcript);
    expect(result.insights.propertyPreferences).toMatchObject({
      transactionType: "rent",
      bedroomCountMin: 4,
      livingRoomCountMin: 1,
      budgetRange: { min: null, max: 45_000, currency: "TRY" },
      mustHaves: ["Otoparklı", "Havuzlu"],
    });
  });
});
