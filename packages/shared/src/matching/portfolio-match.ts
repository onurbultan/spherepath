import { z } from "zod";
import type {
  Audited,
  PropertyFeature,
  PropertyPreferences,
  TenantOwned,
} from "../domain/entities.js";

export const portfolioSources = ["manual", "whatsapp_group", "listing"] as const;
export const portfolioAvailabilityValues = ["available", "reserved", "closed", "withdrawn"] as const;
export const portfolioAuthorizationTypes = ["exclusive", "open", "verbal", "none", "unknown"] as const;
export const titleDeedTypes = ["full", "shared", "unknown"] as const;
export const portfolioTransactionTypes = ["sell", "let"] as const;

export type PortfolioSource = typeof portfolioSources[number];
export type PortfolioAvailability = typeof portfolioAvailabilityValues[number];
export type PortfolioAuthorizationType = typeof portfolioAuthorizationTypes[number];
export type TitleDeedType = typeof titleDeedTypes[number];
export type PortfolioTransactionType = typeof portfolioTransactionTypes[number];

const optionalNumber = (maximum: number) => z.number().nonnegative().max(maximum).nullable();
const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();

export const portfolioItemDraftSchema = z.object({
  source: z.enum(portfolioSources),
  sourceAuthorName: optionalText(120),
  headline: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(3).max(1_000),
  transactionType: z.enum(portfolioTransactionTypes),
  propertyType: z.enum(["apartment", "villa", "detached_house", "land", "commercial"]),
  location: z.string().trim().min(2).max(240),
  askingPrice: z.object({
    amount: z.number().positive().max(1_000_000_000_000),
    currency: z.enum(["TRY", "GBP", "USD", "EUR"]),
  }).strict().nullable(),
  bedroomCount: optionalNumber(100),
  livingRoomCount: optionalNumber(20),
  areaM2: optionalNumber(1_000_000),
  landAreaM2: optionalNumber(10_000_000),
  features: z.array(z.enum(["ground_floor", "no_elevator", "furnished", "sea_view", "parking", "garden", "pool", "gated_community", "middle_floor", "top_floor", "new_building"])).max(12),
  attributes: z.array(z.string().trim().min(2).max(120)).max(20),
  authorizationType: z.enum(portfolioAuthorizationTypes),
  titleDeedType: z.enum(titleDeedTypes),
  constructionAllowed: z.boolean().nullable(),
  listingUrl: z.string().url().max(1_000).nullable(),
}).strict();

export const portfolioTextInputSchema = z.object({
  text: z.string().trim().min(10).max(8_000),
  source: z.enum(portfolioSources).default("whatsapp_group"),
}).strict();

export const portfolioItemCommandSchema = z.object({
  portfolioItemId: z.string().min(1).max(160),
}).strict();

export const matchNotificationCommandSchema = z.object({
  notificationIds: z.array(z.string().min(1).max(360)).min(1).max(100),
}).strict();

export type PortfolioItemDraft = z.infer<typeof portfolioItemDraftSchema>;

export interface PortfolioItem extends TenantOwned, Audited, PortfolioItemDraft {
  availability: PortfolioAvailability;
}

export interface PortfolioItemRecord extends PortfolioItem {
  id: string;
  sharedByName: string;
}

export type MatchReasonStatus = "match" | "mismatch" | "unknown";
export type MatchReasonKey = "transaction" | "property_type" | "location" | "budget" | "rooms" | "area" | "must_have" | "deal_breaker";

export interface PortfolioMatchReason {
  key: MatchReasonKey;
  status: MatchReasonStatus;
  weight: number;
  detail: string;
}

/**
 * Only these three make a portfolio genuinely unshowable: a buyer cannot be sent a
 * rental, land is not a flat, and a deal breaker is an answer the contact already gave.
 * Everything else -- price, rooms, area, district, a missing must-have -- is a matter of
 * degree the advisor should judge, so it lowers the score instead of hiding the record.
 */
export const disqualifyingReasonKeys = ["transaction", "property_type", "deal_breaker"] as const satisfies readonly MatchReasonKey[];

export interface PortfolioMatchScore {
  eligible: boolean;
  score: number;
  coverage: number;
  reasons: PortfolioMatchReason[];
  /** Criteria that missed without disqualifying the portfolio. */
  softMismatchKeys: MatchReasonKey[];
}

/** Match scores are whole percentages on the wire, never 0–1 ratios. */
export const matchScoreSchema = z.number().int().min(0).max(100);

export function formatMatchScore(score: number): string {
  return `%${matchScoreSchema.parse(score)}`;
}

export interface PortfolioMatchRecord extends PortfolioMatchScore {
  contactId: string;
  contactName: string;
  portfolioItem: PortfolioItemRecord;
  /** Which side of the contact this match answers, when more than one is on file. */
  situationSummary?: string | null;
}

export interface PortfolioMatchNotificationRecord {
  id: string;
  match: PortfolioMatchRecord;
  createdAt: number;
  readAt: number | null;
}

export const portfolioSourceLabels: Record<PortfolioSource, string> = {
  manual: "Manuel",
  whatsapp_group: "WhatsApp grubu",
  listing: "İlan",
};

export const portfolioAuthorizationLabels: Record<PortfolioAuthorizationType, string> = {
  exclusive: "Tek yetkili",
  open: "Açık yetki",
  verbal: "Sözlü",
  none: "Yetkisiz paylaşım",
  unknown: "Yetki belirsiz",
};

export const titleDeedTypeLabels: Record<TitleDeedType, string> = {
  full: "Müstakil tapu",
  shared: "Hisse tapu",
  unknown: "Tapu türü belirsiz",
};

const weights: Record<MatchReasonKey, number> = {
  transaction: 16,
  property_type: 14,
  location: 18,
  budget: 18,
  rooms: 10,
  area: 10,
  must_have: 10,
  deal_breaker: 4,
};

const foldCharacters: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };

export function normalizeMatchText(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/gu, (character) => foldCharacters[character] ?? character)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalizeMatchText(value).split(/\s+/u).filter((token) => token.length > 1));
}

function overlaps(left: string, right: string): boolean {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  return [...leftTokens].some((token) => rightTokens.has(token));
}

function itemSearchText(item: PortfolioItemDraft): string {
  const featureTerms: Record<PropertyFeature, string> = {
    ground_floor: "zemin kat",
    no_elevator: "asansorsuz",
    furnished: "esyali",
    sea_view: "deniz manzarali",
    parking: "otopark",
    garden: "bahce",
    pool: "havuz",
    gated_community: "site icinde",
    middle_floor: "ara kat",
    top_floor: "cati kat",
    new_building: "yeni bina",
  };
  return normalizeMatchText([
    item.headline,
    item.summary,
    item.location,
    ...item.features.map((feature) => featureTerms[feature]),
    ...item.attributes,
    item.titleDeedType !== "unknown" ? "tapulu tapu" : "",
    item.titleDeedType === "full" ? "mustakil tapu" : "",
    item.titleDeedType === "shared" ? "hisse tapu" : "",
    item.constructionAllowed === true ? "ev yapmaya uygun insaat yapilabilir" : "",
    item.constructionAllowed === false ? "insaat yapilamaz ev yapmaya uygun degil" : "",
  ].join(" "));
}

function canonicalRequirement(value: string): string | null {
  const normalized = normalizeMatchText(value);
  if (/\b(otopark|park yeri|garaj)\b/u.test(normalized)) return "otopark";
  if (/\basansor\b/u.test(normalized)) return "asansor";
  if (/\b(bahce|genis bahce)\b/u.test(normalized)) return "bahce";
  if (/\bhavuz\b/u.test(normalized)) return "havuz";
  if (/\bdeniz manzara/u.test(normalized)) return "deniz manzarali";
  if (/\bmustakil tapu\b/u.test(normalized)) return "mustakil tapu";
  if (/\b(hisse tapu|hisseli tapu)\b/u.test(normalized)) return "hisse tapu";
  if (/\b(tapu|tapulu)\b/u.test(normalized)) return "tapulu";
  if (/\b(ev yap|insaat|yapilasma)\b/u.test(normalized)) return "ev yapmaya uygun";
  if (/\bana yol[a]? cepheli\b/u.test(normalized)) return "ana yola cepheli";
  return null;
}

function hasKnownRequirement(item: PortfolioItemDraft, requirement: string): { known: boolean; present: boolean } {
  const canonical = canonicalRequirement(requirement);
  const haystack = itemSearchText(item);
  if (!canonical) return { known: false, present: overlaps(requirement, haystack) };
  if (canonical === "tapulu") return { known: item.titleDeedType !== "unknown", present: item.titleDeedType !== "unknown" };
  if (canonical === "mustakil tapu") return { known: item.titleDeedType !== "unknown", present: item.titleDeedType === "full" };
  if (canonical === "hisse tapu") return { known: item.titleDeedType !== "unknown", present: item.titleDeedType === "shared" };
  if (canonical === "ev yapmaya uygun") return { known: item.constructionAllowed !== null, present: item.constructionAllowed === true };
  if (canonical === "ana yola cepheli") {
    const positive = /\bana yol[a]? cepheli\b/u.test(haystack);
    const explicitlyNotFronting = /\bana yol[a]? cepheli (?:degil|olmayan)\b/u.test(haystack);
    return { known: positive, present: positive && !explicitlyNotFronting };
  }
  const canonicalFeature: Partial<Record<string, PropertyFeature>> = {
    otopark: "parking", asansor: "no_elevator", bahce: "garden", havuz: "pool", "deniz manzarali": "sea_view",
  };
  const feature = canonicalFeature[canonical];
  if (feature === "no_elevator") {
    const hasNoElevator = item.features.includes("no_elevator") || haystack.includes("asansorsuz");
    const hasElevator = haystack.includes("asansor") && !hasNoElevator;
    return { known: hasNoElevator || hasElevator, present: hasElevator };
  }
  if (feature) return { known: item.features.includes(feature) || haystack.includes(canonical), present: item.features.includes(feature) || haystack.includes(canonical) };
  return { known: haystack.includes(canonical), present: haystack.includes(canonical) };
}

function addReason(reasons: PortfolioMatchReason[], key: MatchReasonKey, status: MatchReasonStatus, detail: string) {
  reasons.push({ key, status, weight: weights[key], detail });
}

function transactionMatches(preferences: PropertyPreferences, item: PortfolioItemDraft): boolean | null {
  if (!preferences.transactionType) return null;
  if (["buy", "invest"].includes(preferences.transactionType)) return item.transactionType === "sell";
  if (preferences.transactionType === "rent") return item.transactionType === "let";
  return false;
}

export function scorePortfolioItem(preferences: PropertyPreferences, item: PortfolioItemDraft): PortfolioMatchScore {
  const reasons: PortfolioMatchReason[] = [];
  let hardMismatch = false;
  const transaction = transactionMatches(preferences, item);
  if (transaction === null) addReason(reasons, "transaction", "unknown", "Talebin işlem türü bilinmiyor.");
  else if (transaction) addReason(reasons, "transaction", "match", "İşlem türü talep ile uyumlu.");
  else { hardMismatch = true; addReason(reasons, "transaction", "mismatch", "Satış/kiralama türü talep ile uyuşmuyor."); }

  if (!preferences.propertyTypes.length) addReason(reasons, "property_type", "unknown", "Talepte gayrimenkul türü belirtilmemiş.");
  else if (preferences.propertyTypes.includes(item.propertyType)) addReason(reasons, "property_type", "match", "Gayrimenkul türü talep ile uyumlu.");
  else { hardMismatch = true; addReason(reasons, "property_type", "mismatch", "Gayrimenkul türü talep dışında."); }

  if (!preferences.preferredLocations.length) addReason(reasons, "location", "unknown", "Talepte bölge belirtilmemiş.");
  else if (preferences.preferredLocations.some((location) => overlaps(location, item.location))) addReason(reasons, "location", "match", `${item.location} aranan bölgelerle örtüşüyor.`);
  else addReason(reasons, "location", "mismatch", `${item.location} aranan bölgelerle örtüşmüyor.`);

  const budget = preferences.budgetRange;
  if (!budget || !item.askingPrice || budget.currency !== item.askingPrice.currency) addReason(reasons, "budget", "unknown", "Fiyat ve bütçe aynı para biriminde karşılaştırılamıyor.");
  else if (budget.max !== null && item.askingPrice.amount > budget.max) addReason(reasons, "budget", "mismatch", `Fiyat, azami bütçeyi %${Math.round(((item.askingPrice.amount - budget.max) / budget.max) * 100)} aşıyor.`);
  else addReason(reasons, "budget", "match", "Fiyat belirtilen bütçe içinde.");

  const requiredBedrooms = preferences.bedroomCountMin ?? preferences.roomCountMin;
  const requiredLivingRooms = preferences.livingRoomCountMin;
  if (requiredBedrooms === null && requiredLivingRooms === null) addReason(reasons, "rooms", "unknown", "Talepte oda alt sınırı belirtilmemiş.");
  else if (item.bedroomCount === null || (requiredLivingRooms !== null && item.livingRoomCount === null)) addReason(reasons, "rooms", "unknown", "Portföyün oda bilgisi eksik.");
  else if (item.bedroomCount >= (requiredBedrooms ?? 0) && (item.livingRoomCount ?? 0) >= (requiredLivingRooms ?? 0)) addReason(reasons, "rooms", "match", "Oda düzeni talebi karşılıyor.");
  else addReason(reasons, "rooms", "mismatch", `Oda düzeni asgari talebi karşılamıyor (${item.bedroomCount ?? 0}+${item.livingRoomCount ?? 0}, istenen ${requiredBedrooms ?? 0}+${requiredLivingRooms ?? 0}).`);

  const comparableArea = item.propertyType === "land" ? item.landAreaM2 : item.areaM2;
  if (preferences.areaMinM2 === null && preferences.areaMaxM2 === null) addReason(reasons, "area", "unknown", "Talepte alan sınırı belirtilmemiş.");
  else if (comparableArea === null) addReason(reasons, "area", "unknown", "Portföyün alan bilgisi eksik.");
  else if ((preferences.areaMinM2 === null || comparableArea >= preferences.areaMinM2) && (preferences.areaMaxM2 === null || comparableArea <= preferences.areaMaxM2)) addReason(reasons, "area", "match", "Alan ölçüsü talep aralığında.");
  else addReason(reasons, "area", "mismatch", `Alan ölçüsü talep aralığının dışında (${comparableArea} m²).`);

  if (!preferences.mustHaves.length) addReason(reasons, "must_have", "unknown", "Zorunlu özellik belirtilmemiş.");
  else {
    const checks = preferences.mustHaves.map((requirement) => ({ requirement, ...hasKnownRequirement(item, requirement) }));
    const missing = checks.filter((check) => check.known && !check.present);
    const matched = checks.filter((check) => check.present);
    if (missing.length) addReason(reasons, "must_have", "mismatch", `Eksik zorunlu özellik: ${missing.map((item) => item.requirement).join(", ")}.`);
    else if (matched.length === checks.length) addReason(reasons, "must_have", "match", "Bilinen zorunlu özelliklerin tamamı karşılanıyor.");
    else addReason(reasons, "must_have", "unknown", "Bazı zorunlu özellikler için portföy bilgisi eksik.");
  }

  if (!preferences.dealBreakers.length) addReason(reasons, "deal_breaker", "match", "Çakışan istenmeyen özellik bulunmadı.");
  else {
    const checks = preferences.dealBreakers.map((requirement) => ({ requirement, ...hasKnownRequirement(item, requirement) }));
    const conflicts = checks.filter((check) => check.present);
    if (conflicts.length) { hardMismatch = true; addReason(reasons, "deal_breaker", "mismatch", `İstenmeyen özellik mevcut: ${conflicts.map((item) => item.requirement).join(", ")}.`); }
    else if (checks.every((check) => check.known)) addReason(reasons, "deal_breaker", "match", "Bilinen istenmeyen özelliklerle çakışma yok.");
    else addReason(reasons, "deal_breaker", "unknown", "Bazı istenmeyen özellikler için portföy bilgisi eksik.");
  }

  const assessed = reasons.filter((reason) => reason.status !== "unknown");
  const assessedWeight = assessed.reduce((sum, reason) => sum + reason.weight, 0);
  const matchedWeight = assessed.filter((reason) => reason.status === "match").reduce((sum, reason) => sum + reason.weight, 0);
  const totalWeight = reasons.reduce((sum, reason) => sum + reason.weight, 0);
  const disqualifying = new Set<MatchReasonKey>(disqualifyingReasonKeys);
  return {
    eligible: !hardMismatch,
    softMismatchKeys: reasons.filter((reason) => reason.status === "mismatch" && !disqualifying.has(reason.key)).map((reason) => reason.key),
    // Unknown criteria are not treated as matches. This keeps a partially known
    // candidate from being presented as a misleading 100% fit.
    score: totalWeight ? Math.round((matchedWeight / totalWeight) * 100) : 0,
    coverage: totalWeight ? Math.round((assessedWeight / totalWeight) * 100) : 0,
    reasons,
  };
}

export function createPortfolioItem(draft: PortfolioItemDraft, tenant: TenantOwned, now: number): PortfolioItem {
  return { ...portfolioItemDraftSchema.parse(draft), ...tenant, availability: "available", createdAt: now, updatedAt: now };
}
