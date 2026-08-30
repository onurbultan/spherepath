import type { VoiceExtraction } from "../../../packages/shared/src/index.js";

export interface VoiceDiscardQualitySnapshot {
  durationMs: number;
  transcriptLength: number;
  transcriptWordCount: number;
  transcriptionModel: string | null;
  transcriptionWarning: string | null;
  maskedCategoryCount: number;
  extractionEngine: VoiceExtraction["provenance"]["engine"] | null;
  extractionModel: string | null;
  promptVersion: string | null;
  confidenceCount: number;
  rememberedFactCount: number;
  preferenceValueCount: number;
  hadNextAction: boolean;
}

export function isPossiblyIncompleteTranscription(durationMs: number, transcript: string): boolean {
  if (durationMs < 12_000) return false;
  const text = transcript.trim();
  const wordCount = text ? text.split(/\s+/u).length : 0;
  return wordCount < Math.max(6, Math.floor((durationMs / 1_000) * 0.35));
}

interface VoiceDiscardSource {
  durationMs?: unknown;
  maskedTranscript?: unknown;
  maskedCategories?: unknown;
  transcriptionModel?: unknown;
  transcriptionWarning?: unknown;
  extraction?: VoiceExtraction | null;
}

function populatedPreferenceCount(extraction: VoiceExtraction | null): number {
  if (!extraction) return 0;
  const item = extraction.insights.propertyPreferences;
  return [
    item.transactionType,
    item.propertyTypes.length ? item.propertyTypes : null,
    item.preferredLocations.length ? item.preferredLocations : null,
    item.budgetRange,
    item.bedroomCountMin,
    item.livingRoomCountMin,
    item.roomCountMin,
    item.areaMinM2,
    item.areaMaxM2,
    item.mustHaves.length ? item.mustHaves : null,
    item.dealBreakers.length ? item.dealBreakers : null,
    item.timeline,
  ].filter((value) => value !== null).length;
}

export function buildVoiceDiscardQualitySnapshot(source: VoiceDiscardSource): VoiceDiscardQualitySnapshot {
  const transcript = typeof source.maskedTranscript === "string" ? source.maskedTranscript.trim() : "";
  const extraction = source.extraction ?? null;
  return {
    durationMs: typeof source.durationMs === "number" ? source.durationMs : 0,
    transcriptLength: transcript.length,
    transcriptWordCount: transcript ? transcript.split(/\s+/u).length : 0,
    transcriptionModel: typeof source.transcriptionModel === "string" ? source.transcriptionModel : null,
    transcriptionWarning: typeof source.transcriptionWarning === "string" ? source.transcriptionWarning : null,
    maskedCategoryCount: Array.isArray(source.maskedCategories) ? source.maskedCategories.length : 0,
    extractionEngine: extraction?.provenance.engine ?? null,
    extractionModel: extraction?.provenance.model ?? null,
    promptVersion: extraction?.provenance.promptVersion ?? null,
    confidenceCount: extraction?.confidence.length ?? 0,
    rememberedFactCount: extraction?.insights.keyThingsToRemember.length ?? 0,
    preferenceValueCount: populatedPreferenceCount(extraction),
    hadNextAction: Boolean(extraction?.interaction.nextActionType),
  };
}
