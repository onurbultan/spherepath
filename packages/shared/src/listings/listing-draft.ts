import { z } from "zod";
import type {
  AuthorizationType,
  CurrencyCode,
  Listing,
  ListingReadinessEvidence,
  ListingStatus,
  Property,
  PropertyFeature,
  PropertyType,
  TenantOwned,
} from "../domain/entities.js";

export const propertyTypes = ["apartment", "villa", "detached_house", "land", "commercial"] as const satisfies readonly PropertyType[];
export const propertyFeatures = ["ground_floor", "no_elevator", "furnished", "sea_view", "parking", "garden", "pool", "gated_community", "middle_floor", "top_floor", "new_building"] as const satisfies readonly PropertyFeature[];
export const authorizationTypes = ["exclusive", "open", "verbal", "unknown"] as const satisfies readonly AuthorizationType[];
export const listingStatuses = ["preparing", "active", "reserved", "sold", "rented", "removed"] as const satisfies readonly ListingStatus[];
export const currencyCodes = ["TRY", "GBP", "USD", "EUR"] as const satisfies readonly CurrencyCode[];

export const propertyTypeLabels: Record<PropertyType, string> = {
  apartment: "Daire", villa: "Villa", detached_house: "Müstakil", land: "Arsa", commercial: "Ticari",
};
export const propertyFeatureLabels: Record<PropertyFeature, string> = {
  ground_floor: "Zemin kat", no_elevator: "Asansörsüz", furnished: "Eşyalı", sea_view: "Deniz manzaralı",
  parking: "Otoparklı", garden: "Bahçeli", pool: "Havuzlu", gated_community: "Site içinde", middle_floor: "Ara kat",
  top_floor: "Çatı katı", new_building: "Yeni bina",
};
export const authorizationTypeLabels: Record<AuthorizationType, string> = {
  exclusive: "Tek yetkili", open: "Açık yetki", verbal: "Sözlü", unknown: "Belirsiz",
};
export const listingStatusLabels: Record<ListingStatus, string> = {
  preparing: "Hazırlanıyor", active: "Aktif", reserved: "Rezerve", sold: "Satıldı", rented: "Kiralandı", removed: "Kaldırıldı",
};

export const listingDraftSchema = z.object({
  opportunityId: z.string().trim().min(1).max(160),
  address: z.string().trim().min(3).max(500),
  regionSlug: z.string().trim().min(2).max(160),
  propertyType: z.enum(propertyTypes),
  roomCount: z.number().nonnegative().max(100).nullable(),
  areaM2: z.number().positive().max(1_000_000).nullable(),
  features: z.array(z.enum(propertyFeatures)).max(12),
  authorizationType: z.enum(authorizationTypes),
  askingPrice: z.number().positive().max(1_000_000_000_000).nullable(),
  currency: z.enum(currencyCodes),
  expiresAt: z.number().int().positive().nullable(),
}).strict();

export type ListingDraft = z.infer<typeof listingDraftSchema>;

export const existingListingDraftSchema = listingDraftSchema.omit({ opportunityId: true }).extend({
  ownerContactId: z.string().trim().min(1).max(160),
  opportunityType: z.enum(["seller_listing", "landlord_listing"]),
  sourceInboxItemId: z.string().trim().min(1).max(160).nullable().default(null),
}).strict();

export type ExistingListingDraft = z.infer<typeof existingListingDraftSchema>;

export const listingPriceUpdateSchema = z.object({
  listingId: z.string().trim().min(1).max(160),
  askingPrice: z.number().positive().max(1_000_000_000_000),
  currency: z.enum(currencyCodes),
}).strict();

export type ListingPriceUpdate = z.infer<typeof listingPriceUpdateSchema>;

export const listingAuthorizationUpdateSchema = z.object({
  listingId: z.string().trim().min(1).max(160),
  authorizationType: z.enum(authorizationTypes),
}).strict();

export type ListingAuthorizationUpdate = z.infer<typeof listingAuthorizationUpdateSchema>;

export const listingVerificationStatuses = ["pending", "verified", "not_required"] as const;
export const listingVerificationStatusLabels = {
  pending: "Bekliyor",
  verified: "Doğrulandı",
  not_required: "Muaf / gerekmiyor",
} as const satisfies Record<(typeof listingVerificationStatuses)[number], string>;

export const listingReadinessEvidenceSchema = z.object({
  mandate: z.enum(listingVerificationStatuses),
  eids: z.enum(listingVerificationStatuses),
  media: z.enum(["pending", "ready"]),
  processingBasis: z.enum(["pending", "verified"]),
}).strict();

export const listingReadinessUpdateSchema = z.object({
  listingId: z.string().trim().min(1).max(160),
  evidence: listingReadinessEvidenceSchema,
}).strict();

export type ListingReadinessUpdate = z.infer<typeof listingReadinessUpdateSchema>;

export function initialListingReadinessEvidence(authorizationType: AuthorizationType): ListingReadinessEvidence {
  return {
    mandate: authorizationType === "verbal" ? "not_required" : "pending",
    eids: "pending",
    media: "pending",
    processingBasis: "verified",
  };
}

export function createPropertyAndListing(draft: ListingDraft, tenant: TenantOwned, ownerContactId: string, propertyId: string, now: number): { property: Property; listing: Listing } {
  const parsed = listingDraftSchema.parse(draft);
  const summary = {
    address: parsed.address,
    regionSlug: parsed.regionSlug.toLocaleLowerCase("tr-TR").replace(/\s+/g, "-").replace(/[^a-z0-9çğıöşü-]/g, ""),
    type: parsed.propertyType,
    roomCount: parsed.roomCount,
    areaM2: parsed.areaM2,
    features: parsed.features,
  };
  return {
    property: {
      ...tenant, ownerContactId, address: summary.address, regionSlug: summary.regionSlug, geo: null, geohash: null,
      type: summary.type, roomCount: summary.roomCount, areaM2: summary.areaM2, features: summary.features,
      deletedAt: null, createdAt: now, updatedAt: now,
    },
    listing: {
      ...tenant, propertyId, opportunityId: parsed.opportunityId, authorizationType: parsed.authorizationType,
      propertySummary: summary, askingPrice: parsed.askingPrice, currency: parsed.currency, status: "preparing",
      readinessEvidence: initialListingReadinessEvidence(parsed.authorizationType),
      acquiredAt: now, expiresAt: parsed.expiresAt, deletedAt: null, createdAt: now, updatedAt: now,
    },
  };
}
