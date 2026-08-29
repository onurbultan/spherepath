import { describe, expect, it } from "vitest";
import { extractVoiceDraft, maskSensitiveTranscript, sanitizeVoiceExtraction } from "./privacy.js";

describe("voice privacy pipeline", () => {
  it("removes sensitive sentences before extraction", () => {
    const masked = maskSensitiveTranscript("Ayşe yarın görüşmek istiyor. Sağlık durumu hakkında ayrıntı verdi. Onu arayacağım.");
    expect(masked.text).not.toContain("Sağlık durumu");
    expect(masked.text).toContain("[HASSAS İÇERİK MASKELENDİ]");
    expect(masked.categories).toContain("health");
    const extraction = extractVoiceDraft(masked.text);
    expect(extraction.interaction.nextActionType).toBe("call");
    expect(extraction.interaction.daysFromNow).toBe(1);
  });

  it("returns an unclear draft when all meaningful content is masked", () => {
    const masked = maskSensitiveTranscript("Siyasi görüşünü uzun uzun anlattı.");
    expect(extractVoiceDraft(masked.text).isUnclear).toBe(true);
  });

  it("removes sensitive text even if an AI extraction attempts to return it", () => {
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
