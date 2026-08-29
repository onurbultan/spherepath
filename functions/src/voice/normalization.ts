import { voiceExtractionSchema, type VoiceExtraction } from "../../../packages/shared/src/index.js";

function appendUnique(values: string[], additions: string[]): string[] {
  const result = [...values];
  for (const addition of additions) {
    if (!result.some((value) => value.localeCompare(addition, "tr-TR", { sensitivity: "base" }) === 0)) result.push(addition);
  }
  return result.slice(0, 20);
}

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
  const explicitMustHaves = [
    /\bbahçeli\b/iu.test(maskedTranscript) ? "Bahçeli" : null,
    /\bsakin\s+(?:bir\s+)?(?:sokak|cadde|mahalle)\b/iu.test(maskedTranscript) ? "Sakin sokak" : null,
    /\bdenize\s+yürüme\s+mesafesi(?:nde)?\b/iu.test(maskedTranscript) ? "Denize yürüme mesafesi" : null,
  ].filter((item): item is string => item !== null);
  const propertyTypes = preferences.propertyTypes.filter((propertyType) => {
    if (propertyType === "detached_house") return /\bmüstakil\b/iu.test(maskedTranscript);
    if (propertyType === "villa") return /\bvilla\b/iu.test(maskedTranscript);
    return true;
  });
  const explicitDirection = /\b(?:ben\s+|kendisini\s+)?aradım\b|\btelefon\s+ettim\b/iu.test(maskedTranscript)
    ? "outbound"
    : /\b(?:beni|bizi)\s+aradı\b|\bkendisi\s+aradı\b/iu.test(maskedTranscript)
      ? "inbound"
      : "mutual";

  return voiceExtractionSchema.parse({
    ...extraction,
    interaction: {
      ...extraction.interaction,
      askOutcome,
      nextActionType,
      direction: explicitDirection,
    },
    insights: {
      ...extraction.insights,
      keyThingsToRemember,
      propertyContext,
      propertyPreferences: {
        ...preferences,
        propertyTypes,
        bedroomCountMin: roomConfiguration?.[1] ? Number(roomConfiguration[1]) : preferences.bedroomCountMin,
        livingRoomCountMin: roomConfiguration?.[2] ? Number(roomConfiguration[2]) : preferences.livingRoomCountMin,
        roomCountMin: roomConfiguration ? null : preferences.roomCountMin,
        areaMinM2: areaRange?.[1] ? Number(areaRange[1]) : preferences.areaMinM2,
        areaMaxM2: areaRange?.[2] ? Number(areaRange[2]) : preferences.areaMaxM2,
        mustHaves: appendUnique(preferences.mustHaves, explicitMustHaves),
      },
    },
  });
}
