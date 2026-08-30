import { describe, expect, it } from "vitest";
import { extractVoiceDraft, maskSensitiveTranscript, sanitizeVoiceExtraction, sensitiveMask } from "./privacy.js";

describe("voice privacy pipeline", () => {
  it("masks the sensitive term but keeps the rest of the transcript usable", () => {
    const masked = maskSensitiveTranscript("Ayşe yarın görüşmek istiyor. Sağlık durumu hakkında ayrıntı verdi. Onu arayacağım.");
    expect(masked.text).not.toContain("Sağlık durumu");
    expect(masked.text).toContain(sensitiveMask);
    expect(masked.categories).toContain("health");
    expect(masked.text).toContain("Onu arayacağım.");
    const extraction = extractVoiceDraft(masked.text);
    expect(extraction.interaction.nextActionType).toBe("call");
    expect(extraction.interaction.daysFromNow).toBe(1);
  });

  it("keeps everyday Turkish words that only share a prefix with a sensitive root", () => {
    const cases = [
      "Müşteriye 3+1 bir daire lazım, bütçesi 5 milyon.",
      "Rumeli Hisarı civarında bir ev bakıyor.",
      "Kadıköy'de oturmak istiyor, Türkiye geneline bakmıyor.",
      "Türkçe evrak hazırlanacak.",
      "Hastane yakını olsun istiyor.",
      "Sitede dinlenme alanı var mı diye sordu.",
      "Dinamik bir bölge arıyor.",
    ];
    for (const sentence of cases) {
      const masked = maskSensitiveTranscript(sentence);
      expect(masked.text, sentence).toBe(sentence);
      expect(masked.categories, sentence).toEqual([]);
    }
  });

  it("still masks genuine sensitive terms in every category", () => {
    const cases: Array<[string, string]> = [
      ["Laz kökenli olduğunu söyledi.", "ethnicity"],
      ["Türk vatandaşı değil.", "ethnicity"],
      ["Rum asıllı bir aile.", "ethnicity"],
      ["Hastalığı nedeniyle taşınmak istiyor.", "health"],
      ["Dini bayramda taşınmak istemiyor.", "religion"],
      ["Sendika üyesi olduğunu belirtti.", "union_membership"],
      ["Siyasi görüşünü uzun uzun anlattı.", "political_opinion"],
    ];
    for (const [sentence, category] of cases) {
      const masked = maskSensitiveTranscript(sentence);
      expect(masked.categories, sentence).toContain(category);
      expect(masked.text, sentence).toContain(sensitiveMask);
    }
  });

  it("reports masked ranges that point at the mask inside the returned text", () => {
    const masked = maskSensitiveTranscript("Bugün hasta olduğunu söyledi.");
    expect(masked.maskedRanges).toHaveLength(1);
    const [range] = masked.maskedRanges;
    expect(masked.text.slice(range!.start, range!.end)).toBe(sensitiveMask);
  });

  it("returns an unclear draft when nothing survives masking", () => {
    const masked = maskSensitiveTranscript("Müslüman.");
    expect(extractVoiceDraft(masked.text).isUnclear).toBe(true);
  });

  it("drops an extracted value entirely when it carries sensitive content", () => {
    const extraction = extractVoiceDraft("Kadıköy'de ev arıyor.");
    const sanitized = sanitizeVoiceExtraction({
      ...extraction,
      insights: {
        ...extraction.insights,
        keyThingsToRemember: ["Sağlık durumu nedeniyle taşınacak.", "Açık mutfak istiyor."],
        suggestedActionReason: "Hastalık bilgisine göre ara.",
      },
    });
    expect(sanitized.insights.keyThingsToRemember).toEqual(["Açık mutfak istiyor."]);
    expect(sanitized.insights.suggestedActionReason).toBeNull();
  });
});
