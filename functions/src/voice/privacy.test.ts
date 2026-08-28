import { describe, expect, it } from "vitest";
import { extractVoiceDraft, maskSensitiveTranscript } from "./privacy.js";

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
});
