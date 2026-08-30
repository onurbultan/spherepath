import { describe, expect, it } from "vitest";
import { emptyVoiceInsights, voiceExtractionSchema } from "../../../packages/shared/src/index.js";
import { normalizeVoiceActionTiming, voiceReferenceContext } from "./temporal.js";
import { extractVoiceDraft } from "./privacy.js";

const saturday = new Date("2026-08-29T09:00:00.000Z");

function extraction(nextActionType: "call" | "message" | "valuation" | null = "call") {
  return voiceExtractionSchema.parse({
    isUnclear: false,
    interaction: {
      channel: "phone",
      objective: "follow_up",
      direction: "mutual",
      outcome: "Test sonucu",
      askOutcome: "unclear",
      noteSummary: "Test özeti",
      nextActionType,
      daysFromNow: 1,
      actionTime: null,
    },
    insights: emptyVoiceInsights,
    confidence: [],
    provenance: { engine: "rules", model: null, promptVersion: "test" },
  });
}

describe("voice action timing", () => {
  it("resolves Friday and time from a Saturday reference", () => {
    const result = normalizeVoiceActionTiming(extraction("valuation"), "Cuma günü saat 15:00'te değerleme yapacağız.", saturday);
    expect(result.interaction.daysFromNow).toBe(6);
    expect(result.interaction.actionTime).toBe("15:00");
  });

  it("resolves Wednesday instead of retaining a guessed tomorrow", () => {
    const result = normalizeVoiceActionTiming(extraction("message"), "Çarşamba kısa listeyi WhatsApp'tan paylaşacağım.", saturday);
    expect(result.interaction.daysFromNow).toBe(4);
  });

  it("does not confuse today's completed call with next Tuesday's follow-up", () => {
    const result = normalizeVoiceActionTiming(
      extraction("call"),
      "Derya Kaya ile bugün telefonda görüştüm. Önümüzdeki salı saat 11:00'de kendisini arayıp seçenekleri paylaşacağım.",
      saturday,
    );
    expect(result.interaction.daysFromNow).toBe(3);
    expect(result.interaction.actionTime).toBe("11:00");
  });

  it("recovers the future weekday when speech recognition splits a dotted time", () => {
    const result = normalizeVoiceActionTiming(
      extraction("call"),
      "Derya Kaya ile bugün telefonla görüştüm. Urla'da 3 + 1 Bahçeli bir ev arıyor bütçesi 12 milyon liraya kadar taşınmak için acele etmiyor ama uygun bir portföy çıkarsa evi görmek istiyor. Önümüzdeki salı saat 11. 00'de kendisini arayıp seçenekleri paylaşacağım.",
      saturday,
    );
    expect(result.interaction.daysFromNow).toBe(3);
    expect(result.interaction.actionTime).toBe("11:00");
  });

  it("resolves Turkish number words in relative dates", () => {
    const result = normalizeVoiceActionTiming(
      extraction("message"),
      "Üç gün sonra WhatsApp'tan uygun yerleri göndereceğim.",
      saturday,
    );
    expect(result.interaction.daysFromNow).toBe(3);
  });

  it("keeps the date and time attached to the matching action clause", () => {
    const result = normalizeVoiceActionTiming(
      extraction("message"),
      "Yarın emsal satışları e-posta ile göndereceğim, çarşamba saat 11:00'de evde değerleme yapacağız.",
      saturday,
    );
    expect(result.interaction.daysFromNow).toBe(1);
    expect(result.interaction.actionTime).toBeNull();
  });

  it("selects the valuation date and time from the same multi-action sentence", () => {
    const result = normalizeVoiceActionTiming(
      extraction("valuation"),
      "Yarın emsal satışları e-posta ile göndereceğim, çarşamba saat 11:00'de evde değerleme yapacağız.",
      saturday,
    );
    expect(result.interaction.daysFromNow).toBe(4);
    expect(result.interaction.actionTime).toBe("11:00");
  });

  it("does not assign a later valuation time to an earlier message", () => {
    const result = normalizeVoiceActionTiming(
      extraction("message"),
      "Öncesinde emsal verileri e-posta ile gönderilecek. Cuma saat 15:00'te değerleme yapılacak.",
      saturday,
    );
    expect(result.interaction.daysFromNow).toBe(6);
    expect(result.interaction.actionTime).toBeNull();
  });

  it("clears scheduling when there is no next action", () => {
    const result = normalizeVoiceActionTiming(extraction(null), "Cuma 15:00 uygunum.", saturday);
    expect(result.interaction.daysFromNow).toBeNull();
    expect(result.interaction.actionTime).toBeNull();
  });

  it("describes the exact model reference date", () => {
    expect(voiceReferenceContext(saturday)).toContain("2026-08-29 (Cumartesi)");
  });

  it("resolves a mobile-style follow-up with typographic apostrophes", () => {
    const transcript = "Önümüzdeki perşembe saat 10:30’da arayıp seçenekleri paylaşacağım.";
    const result = normalizeVoiceActionTiming(extractVoiceDraft(transcript), transcript, saturday);
    expect(result.interaction.nextActionType).toBe("call");
    expect(result.interaction.daysFromNow).toBe(5);
    expect(result.interaction.actionTime).toBe("10:30");
  });
});
