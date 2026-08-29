import { voiceExtractionSchema, type VoiceExtraction } from "../../../packages/shared/src/index.js";

export function normalizeVoiceExtraction(
  extraction: VoiceExtraction,
  maskedTranscript: string,
): VoiceExtraction {
  const preferences = extraction.insights.propertyPreferences;
  const transactionType = preferences.transactionType;
  const propertyContext = transactionType === "sell" || transactionType === "let"
    ? "subject_property"
    : transactionType === "buy" || transactionType === "rent" || transactionType === "invest"
      ? "search_preference"
      : extraction.insights.propertyContext;

  const roomConfigurations = [...maskedTranscript.matchAll(/\b(\d{1,2})\s*\+\s*(\d{1,2})\b/gu)];
  const roomConfiguration = roomConfigurations.at(-1);
  const areaRanges = [...maskedTranscript.matchAll(/\b(\d{2,5})\s*(?:-|–|—|ile)\s*(\d{2,5})\s*(?:m²|m2|metrekare)\b/giu)];
  const areaRange = areaRanges.at(-1);
  const conditionalAcceptance = extraction.interaction.askOutcome === "positive"
    && /\b(?:ancak|fakat|şartıyla|bağlı|görmeden|incelemeden|değerleme(?:yi|sini)?\s+gör(?:meden|dükten)|sonra\s+karar)\b/iu.test(maskedTranscript);
  const earlierMessageStep = /(?:öncesinde|önce)[^.!?]{0,220}\b(?:e-?posta|mail|mesaj|whatsapp|gönder|ilet|paylaş)\w*/iu.test(maskedTranscript);
  const nextActionType = earlierMessageStep && extraction.interaction.nextActionType !== "message"
    ? "message"
    : extraction.interaction.nextActionType;
  const explicitlyNotApplicable = /(?:talep|yetkilendirme|öneri)[^.!?]{0,100}(?:uygun değildi|sırası değildi|uygun bir (?:an|zaman) değildi)/iu.test(maskedTranscript);
  const askOutcome = extraction.interaction.askOutcome === "not_applicable" && !explicitlyNotApplicable
    ? "not_asked"
    : conditionalAcceptance
      ? "unclear"
      : extraction.interaction.askOutcome;
  const keyThingsToRemember = extraction.insights.keyThingsToRemember.filter((item) => (
    !/(?:artık geçerli değil|artık geçersiz|eski.+geçersiz)/iu.test(item)
    && !/(?:şart|zorunlu|önemli) değil/iu.test(item)
  ));

  return voiceExtractionSchema.parse({
    ...extraction,
    interaction: {
      ...extraction.interaction,
      askOutcome,
      nextActionType,
    },
    insights: {
      ...extraction.insights,
      keyThingsToRemember,
      propertyContext,
      propertyPreferences: {
        ...preferences,
        bedroomCountMin: roomConfiguration?.[1] ? Number(roomConfiguration[1]) : preferences.bedroomCountMin,
        livingRoomCountMin: roomConfiguration?.[2] ? Number(roomConfiguration[2]) : preferences.livingRoomCountMin,
        roomCountMin: roomConfiguration ? null : preferences.roomCountMin,
        areaMinM2: areaRange?.[1] ? Number(areaRange[1]) : preferences.areaMinM2,
        areaMaxM2: areaRange?.[2] ? Number(areaRange[2]) : preferences.areaMaxM2,
      },
    },
  });
}
