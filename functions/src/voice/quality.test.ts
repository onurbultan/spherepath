import { describe, expect, it } from "vitest";
import { emptyVoiceInsights, voiceExtractionSchema } from "../../../packages/shared/src/index.js";
import { buildVoiceDiscardQualitySnapshot, isPossiblyIncompleteTranscription } from "./quality.js";

describe("voice discard quality snapshot", () => {
  it("flags a long recording that produced only one short sentence", () => {
    expect(isPossiblyIncompleteTranscription(21_839, "Bugün Derya Hanım'la görüştüm.")).toBe(true);
    expect(isPossiblyIncompleteTranscription(21_839, "Derya Hanım Urla'da üç artı bir bahçeli ev arıyor ve salı günü tekrar aranmamı istedi.")).toBe(false);
    expect(isPossiblyIncompleteTranscription(8_000, "Kısa not.")).toBe(false);
  });

  it("keeps diagnostic counts without retaining transcript or extracted content", () => {
    const extraction = voiceExtractionSchema.parse({
      isUnclear: false,
      interaction: {
        channel: "phone", objective: "follow_up", direction: "mutual", outcome: "Özel özet",
        askOutcome: "not_asked", noteSummary: "Saklanmaması gereken içerik", nextActionType: "call",
        daysFromNow: 2, actionTime: null,
      },
      insights: {
        ...emptyVoiceInsights,
        keyThingsToRemember: ["Özel bilgi"],
        propertyPreferences: { ...emptyVoiceInsights.propertyPreferences, preferredLocations: ["Urla"], transactionType: "buy" },
      },
      confidence: [{ path: "interaction.outcome", score: 0.9 }],
      provenance: { engine: "vertex_ai", model: "test-model", promptVersion: "test-v1" },
    });
    const snapshot = buildVoiceDiscardQualitySnapshot({
      durationMs: 20_000,
      maskedTranscript: "Bugün uzun bir görüşme özeti kaydettim.",
      maskedCategories: [],
      transcriptionModel: "chirp_3",
      transcriptionWarning: "possibly_incomplete",
      extraction,
    });

    expect(snapshot).toMatchObject({
      durationMs: 20_000,
      transcriptWordCount: 6,
      transcriptionModel: "chirp_3",
      transcriptionWarning: "possibly_incomplete",
      extractionEngine: "vertex_ai",
      rememberedFactCount: 1,
      preferenceValueCount: 2,
      hadNextAction: true,
    });
    expect(JSON.stringify(snapshot)).not.toContain("Özel");
    expect(JSON.stringify(snapshot)).not.toContain("Urla");
  });
});
