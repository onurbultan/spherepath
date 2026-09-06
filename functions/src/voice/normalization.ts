import {
  emptyVoicePropertyPreferences,
  voiceExtractionSchema,
  type VoiceExtraction,
  type VoicePropertyPreferences,
  type VoicePropertySituation,
} from "../../../packages/shared/src/index.js";

function appendUnique(values: string[], additions: string[]): string[] {
  const result = [...values];
  for (const addition of additions) {
    if (!result.some((value) => value.localeCompare(addition, "tr-TR", { sensitivity: "base" }) === 0)) result.push(addition);
  }
  return result.slice(0, 20);
}

const numericPattern = String.raw`(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)`;
const moneyUnitPattern = String.raw`(?:milyon(?:a|e|dan|den|luk|lük)?|bin|TL|₺|lira)`;

function numericValue(value: string): number {
  return Number(value.replace(/\.(?=\d{3}(?:\D|$))/gu, "").replace(",", "."));
}

function moneyMultiplier(unit: string): number {
  return /^milyon/iu.test(unit) ? 1_000_000 : /^bin$/iu.test(unit) ? 1_000 : 1;
}

/** A qualifier belongs to the adjacent measurement, never to the entire note. */
function measurementBound(text: string, match: RegExpMatchArray): "min" | "max" | null {
  const before = text.slice(0, match.index ?? 0);
  const after = text.slice((match.index ?? 0) + match[0].length);
  if (/(?:en az|alt sınır[ıi]?)\s*(?:(?:bütçe(?:si)?|fiyat[ıi]?)\s*:?\s*)?$/iu.test(before)
    || /^\s*(?:ve\s+)?(?:üzeri|üstü)(?=\s|$|[.,;])/iu.test(after)) return "min";
  if (/(?:en fazla|en çok|üst sınır[ıi]?)\s*(?:(?:bütçe(?:si)?|fiyat[ıi]?)\s*:?\s*)?$/iu.test(before)
    || /^\s*(?:['’](?:ye|ya)|TL['’](?:ye|ya))?\s*kadar(?=\s|$|[.,;])/iu.test(after)) return "max";
  return null;
}

function amountFrom(text: string, transactionType: VoicePropertyPreferences["transactionType"]): VoicePropertyPreferences["budgetRange"] {
  const range = text.match(new RegExp(String.raw`(?<![\p{L}\p{N}])(${numericPattern})\s*(milyon|bin)?\s*(?:[-–—]|ile)\s*(${numericPattern})\s*(${moneyUnitPattern})(?=\s|$|[.,;'’])`, "iu"));
  if (range?.[1] && range[3] && range[4]) {
    const min = numericValue(range[1]) * moneyMultiplier(range[2] ?? range[4]);
    const max = numericValue(range[3]) * moneyMultiplier(range[4]);
    // An inverted range needs advisor review; do not silently swap its meaning.
    return min > 0 && max >= min ? { min, max, currency: "TRY" } : null;
  }
  const amount = text.match(new RegExp(String.raw`(?<![\p{L}\p{N}])(${numericPattern})\s*(${moneyUnitPattern})(?=\s|$|[.,;'’])`, "iu"))
    ?? text.match(/(?:bütçe(?:si)?|fiyat[ıi]?)\s*:?\s*(\d{6,12})(?=\s|$|[.,;])/iu);
  if (!amount?.[1]) return null;
  const value = numericValue(amount[1]) * moneyMultiplier(amount[2] ?? "TL");
  if (!value || !Number.isFinite(value)) return null;
  const lowerBound = measurementBound(text, amount) === "min";
  const exactPropertyPrice = transactionType === "sell" || transactionType === "let";
  return { min: exactPropertyPrice || lowerBound ? value : null, max: exactPropertyPrice || !lowerBound ? value : null, currency: "TRY" };
}

function areaFrom(text: string): Pick<VoicePropertyPreferences, "areaMinM2" | "areaMaxM2"> {
  const range = text.match(/\b(\d{2,5})\s*(?:m²|m2|metrekare)?\s*(?:-|–|—|ile)\s*(\d{2,5})\s*(?:m²|m2|metrekare)/iu);
  if (range?.[1] && range[2]) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return min <= max ? { areaMinM2: min, areaMaxM2: max } : { areaMinM2: null, areaMaxM2: null };
  }
  const area = text.match(/\b(\d{2,5})\s*(?:m²|m2|metrekare)/iu);
  if (!area?.[1]) return { areaMinM2: null, areaMaxM2: null };
  const value = Number(area[1]);
  const bound = measurementBound(text, area);
  return { areaMinM2: bound === "max" ? null : value, areaMaxM2: bound === "min" ? null : value };
}

function propertyTypesFrom(text: string): VoicePropertyPreferences["propertyTypes"] {
  return [
    /\bvilla\b/iu.test(text) ? "villa" as const : null,
    /\bmüstakil\b/iu.test(text) ? "detached_house" as const : null,
    /\b(?:daire|apartman)\b/iu.test(text) ? "apartment" as const : null,
    /\barsa\b/iu.test(text) ? "land" as const : null,
    /\b(?:ticari|işyeri|dükkan|ofis)\b/iu.test(text) ? "commercial" as const : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
}

function locationsFrom(text: string): string[] {
  const values: string[] = [];
  for (const match of text.matchAll(/\b(?:([A-ZÇĞİÖŞÜ][\p{L}.-]{1,40})\s+)?([A-ZÇĞİÖŞÜ][\p{L}.-]{1,40})['’](?:da|de|ta|te)\b/gu)) {
    const value = [match[1], match[2]].filter(Boolean).join(" ");
    if (value) values.push(value);
  }
  for (const match of text.matchAll(/\b([A-ZÇĞİÖŞÜ][\p{L}.-]{1,60})(?:['’](?:da|de|ta|te)ki)\b/gu)) {
    if (match[1]) values.push(match[1]);
  }
  for (const match of text.matchAll(/\b([A-ZÇĞİÖŞÜ][\p{L}.-]{2,60}?)(?:['’]?(?:da|de|ta|te))\s+(?:bir\s+)?(?:villa|daire|ev|arsa|müstakil|işyeri)\b/gu)) {
    if (match[1]) values.push(match[1]);
  }
  return appendUnique([], values).slice(0, 8);
}

function preferencesFrom(text: string, transactionType: VoicePropertyPreferences["transactionType"]): VoicePropertyPreferences {
  const room = text.match(/\b(\d{1,2})\s*\+\s*(\d{1,2})\b/u);
  return {
    ...emptyVoicePropertyPreferences,
    transactionType,
    propertyTypes: propertyTypesFrom(text),
    preferredLocations: locationsFrom(text),
    budgetRange: amountFrom(text, transactionType),
    bedroomCountMin: room?.[1] ? Number(room[1]) : null,
    livingRoomCountMin: room?.[2] ? Number(room[2]) : null,
    ...areaFrom(text),
    mustHaves: [
      /\bbahçeli\b/iu.test(text) ? "Bahçeli" : null,
      /\b(?:otopark|garaj)(?:lı|li|lu|lü)?\b/iu.test(text) ? "Otoparklı" : null,
      /\bhavuz(?:lu|lü)?\b/iu.test(text) ? "Havuzlu" : null,
      /\bsakin\s+(?:bir\s+)?(?:sokak|cadde|mahalle)\b/iu.test(text) ? "Sakin sokak" : null,
      /\bdenize\s+yürüme\s+mesafesi(?:nde)?\b/iu.test(text) ? "Denize yürüme mesafesi" : null,
    ].filter((item): item is string => item !== null),
  };
}

function deterministicPropertySituations(text: string): VoicePropertySituation[] {
  const sentences = text.split(/(?<=[.!?])\s+/u).map((item) => item.trim()).filter(Boolean);
  const situations: VoicePropertySituation[] = [];
  for (const sentence of sentences) {
    const rentalSearch = /\b(?:kiralamayı|kiralamak|kiracı\s+olmayı|kiralık\b[^.!?]{0,100}\b(?:arıyor|arayışında))\b/iu.test(sentence);
    const subjectTransaction = /(?:^|\s)(?:satmaya|satmak|satışa|satılık)(?=\s|$|[.,;])/iu.test(sentence)
      ? "sell" as const
      : /(?:^|\s)(?:kiraya\s+vermeye|kiraya\s+vermek)(?=\s|$|[.,;])/iu.test(sentence)
        || (!rentalSearch && /(?:^|\s)kiralık(?=\s|$|[.,;])/iu.test(sentence))
        ? "let" as const
        : null;
    const searchTransaction = rentalSearch
      ? "rent" as const
      : /(?:^|\s)(?:satın\s+almayı|almayı|almak|arıyor|arayışında)(?=\s|$|[.,;])/iu.test(sentence)
        && !/(?:^|\s)(?:satmaya|satmak)(?=\s|$|[.,;])/iu.test(sentence)
        ? "buy" as const
        : null;
    if (subjectTransaction) situations.push({
      propertyContext: "subject_property",
      summary: sentence.slice(0, 240),
      propertyPreferences: preferencesFrom(sentence, subjectTransaction),
    });
    if (searchTransaction) situations.push({
      propertyContext: "search_preference",
      summary: sentence.slice(0, 240),
      propertyPreferences: preferencesFrom(sentence, searchTransaction),
    });
  }
  return situations.slice(0, 3);
}

function normalizeSituation(situation: VoicePropertySituation): VoicePropertySituation {
  const deterministic = preferencesFrom(situation.summary, situation.propertyPreferences.transactionType);
  return {
    ...situation,
    propertyPreferences: {
      ...situation.propertyPreferences,
      propertyTypes: situation.propertyPreferences.propertyTypes.length ? situation.propertyPreferences.propertyTypes : deterministic.propertyTypes,
      preferredLocations: situation.propertyPreferences.preferredLocations.length ? situation.propertyPreferences.preferredLocations : deterministic.preferredLocations,
      budgetRange: deterministic.budgetRange ?? situation.propertyPreferences.budgetRange,
      bedroomCountMin: situation.propertyPreferences.bedroomCountMin ?? deterministic.bedroomCountMin,
      livingRoomCountMin: situation.propertyPreferences.livingRoomCountMin ?? deterministic.livingRoomCountMin,
      areaMinM2: situation.propertyPreferences.areaMinM2 ?? deterministic.areaMinM2,
      areaMaxM2: situation.propertyPreferences.areaMaxM2 ?? deterministic.areaMaxM2,
      mustHaves: appendUnique(situation.propertyPreferences.mustHaves, deterministic.mustHaves),
    },
  };
}

export function normalizeVoiceExtraction(
  extraction: VoiceExtraction,
  maskedTranscript: string,
  knownContactName: string | null = null,
): VoiceExtraction {
  const inferredSituations = deterministicPropertySituations(maskedTranscript);
  const propertySituations = (extraction.insights.propertySituations.length
    ? extraction.insights.propertySituations.map(normalizeSituation)
    : inferredSituations.map(normalizeSituation)).slice(0, 3);
  const primarySituation = [...propertySituations].reverse().find((item) => item.propertyContext === "search_preference")
    ?? propertySituations[0]
    ?? null;
  const extractedPreferences = extraction.insights.propertyPreferences;
  // A short field note often spreads one requirement across several sentences
  // (location first, budget next). When there is only one property situation,
  // enrich that situation from the complete note without mixing two properties.
  const wholeNotePreferences = primarySituation && propertySituations.length === 1
    ? preferencesFrom(maskedTranscript, primarySituation.propertyPreferences.transactionType)
    : null;
  const primaryPreferences = primarySituation && wholeNotePreferences ? {
    ...primarySituation.propertyPreferences,
    propertyTypes: appendUnique(primarySituation.propertyPreferences.propertyTypes, wholeNotePreferences.propertyTypes),
    preferredLocations: appendUnique(primarySituation.propertyPreferences.preferredLocations, wholeNotePreferences.preferredLocations),
    budgetRange: wholeNotePreferences.budgetRange ?? primarySituation.propertyPreferences.budgetRange,
    bedroomCountMin: primarySituation.propertyPreferences.bedroomCountMin ?? wholeNotePreferences.bedroomCountMin,
    livingRoomCountMin: primarySituation.propertyPreferences.livingRoomCountMin ?? wholeNotePreferences.livingRoomCountMin,
    roomCountMin: primarySituation.propertyPreferences.roomCountMin ?? wholeNotePreferences.roomCountMin,
    areaMinM2: primarySituation.propertyPreferences.areaMinM2 ?? wholeNotePreferences.areaMinM2,
    areaMaxM2: primarySituation.propertyPreferences.areaMaxM2 ?? wholeNotePreferences.areaMaxM2,
    mustHaves: appendUnique(primarySituation.propertyPreferences.mustHaves, wholeNotePreferences.mustHaves),
    dealBreakers: appendUnique(primarySituation.propertyPreferences.dealBreakers, wholeNotePreferences.dealBreakers),
    timeline: primarySituation.propertyPreferences.timeline ?? wholeNotePreferences.timeline,
  } : primarySituation?.propertyPreferences;
  const samePrimaryTransaction = primarySituation?.propertyPreferences.transactionType !== null
    && primarySituation?.propertyPreferences.transactionType === extractedPreferences.transactionType;
  const preferences = primarySituation ? {
    ...primaryPreferences!,
    propertyTypes: appendUnique(primaryPreferences!.propertyTypes, samePrimaryTransaction ? extractedPreferences.propertyTypes : []),
    preferredLocations: appendUnique(primaryPreferences!.preferredLocations, samePrimaryTransaction ? extractedPreferences.preferredLocations : []),
    budgetRange: primaryPreferences!.budgetRange ?? (samePrimaryTransaction ? extractedPreferences.budgetRange : null),
    bedroomCountMin: primaryPreferences!.bedroomCountMin ?? (samePrimaryTransaction ? extractedPreferences.bedroomCountMin : null),
    livingRoomCountMin: primaryPreferences!.livingRoomCountMin ?? (samePrimaryTransaction ? extractedPreferences.livingRoomCountMin : null),
    roomCountMin: primaryPreferences!.roomCountMin ?? (samePrimaryTransaction ? extractedPreferences.roomCountMin : null),
    areaMinM2: primaryPreferences!.areaMinM2 ?? (samePrimaryTransaction ? extractedPreferences.areaMinM2 : null),
    areaMaxM2: primaryPreferences!.areaMaxM2 ?? (samePrimaryTransaction ? extractedPreferences.areaMaxM2 : null),
    mustHaves: appendUnique(primaryPreferences!.mustHaves, samePrimaryTransaction ? extractedPreferences.mustHaves : []),
    dealBreakers: appendUnique(primaryPreferences!.dealBreakers, samePrimaryTransaction ? extractedPreferences.dealBreakers : []),
    timeline: primaryPreferences!.timeline ?? (samePrimaryTransaction ? extractedPreferences.timeline : null),
  } : extractedPreferences;
  const preferenceEvidence = primarySituation?.summary ?? maskedTranscript;
  const transactionType = preferences.transactionType;
  const propertyContext = transactionType === "sell" || transactionType === "let"
    ? "subject_property"
    : transactionType === "buy" || transactionType === "rent" || transactionType === "invest"
      ? "search_preference"
      : extraction.insights.propertyContext;

  const roomConfigurations = [...maskedTranscript.matchAll(/\b(\d{1,2})\s*\+\s*(\d{1,2})\b/gu)];
  const roomConfiguration = roomConfigurations.at(-1);
  const area = areaFrom(maskedTranscript);
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
    /\b(?:otopark|garaj)(?:lı|li|lu|lü)?\b/iu.test(maskedTranscript) ? "Otoparklı" : null,
    /\bhavuz(?:lu|lü)?\b/iu.test(maskedTranscript) ? "Havuzlu" : null,
    /\bsakin\s+(?:bir\s+)?(?:sokak|cadde|mahalle)\b/iu.test(maskedTranscript) ? "Sakin sokak" : null,
    /\bdenize\s+yürüme\s+mesafesi(?:nde)?\b/iu.test(maskedTranscript) ? "Denize yürüme mesafesi" : null,
  ].filter((item): item is string => item !== null);
  const propertyTypes = preferences.propertyTypes.filter((propertyType) => {
    if (propertyType === "detached_house") return /\bmüstakil\b/iu.test(preferenceEvidence);
    if (propertyType === "villa") return /\bvilla\b/iu.test(preferenceEvidence);
    return true;
  });
  const explicitDirection = /\b(?:ben\s+|kendisini\s+)?aradım\b|\btelefon\s+ettim\b/iu.test(maskedTranscript)
    ? "outbound"
    : /\b(?:beni|bizi)\s+aradı\b|\bkendisi\s+aradı\b/iu.test(maskedTranscript)
      ? "inbound"
      : "mutual";

  const nameTokens = new Set((knownContactName ?? "")
    .toLocaleLowerCase("tr-TR")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1));
  const cleanLocations = (locations: string[]) => locations.flatMap((location) => {
    if (!nameTokens.size) return [location];
    const cleaned = location.split(/\s+/u)
      .filter((token) => !nameTokens.has(token.replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase("tr-TR")))
      .join(" ")
      .trim();
    return cleaned.length >= 2 ? [cleaned] : [];
  });
  const normalizedSituations = propertySituations.map((situation) => ({
    ...situation,
    propertyPreferences: {
      ...(situation === primarySituation ? preferences : situation.propertyPreferences),
      preferredLocations: cleanLocations(situation === primarySituation ? preferences.preferredLocations : situation.propertyPreferences.preferredLocations),
    },
  }));

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
      keyThingsToRemember: propertySituations.length > 1
        ? appendUnique(keyThingsToRemember, propertySituations.map((item) => item.summary)).slice(0, 8)
        : keyThingsToRemember,
      propertyContext,
      propertySituations: normalizedSituations,
      propertyPreferences: {
        ...preferences,
        preferredLocations: cleanLocations(preferences.preferredLocations),
        propertyTypes,
        bedroomCountMin: primarySituation ? preferences.bedroomCountMin : roomConfiguration?.[1] ? Number(roomConfiguration[1]) : preferences.bedroomCountMin,
        livingRoomCountMin: primarySituation ? preferences.livingRoomCountMin : roomConfiguration?.[2] ? Number(roomConfiguration[2]) : preferences.livingRoomCountMin,
        roomCountMin: primarySituation ? preferences.roomCountMin : roomConfiguration ? null : preferences.roomCountMin,
        areaMinM2: primarySituation ? preferences.areaMinM2 : area.areaMinM2 ?? preferences.areaMinM2,
        areaMaxM2: primarySituation ? preferences.areaMaxM2 : area.areaMaxM2 ?? preferences.areaMaxM2,
        mustHaves: appendUnique(preferences.mustHaves, explicitMustHaves),
      },
    },
  });
}
