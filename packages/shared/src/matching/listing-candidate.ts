import type { Listing } from "../domain/entities.js";
import type { PortfolioItemRecord, PortfolioTransactionType } from "./portfolio-match.js";

export function listingMatchCandidate(listing: Listing & { id: string }, transactionType: PortfolioTransactionType, advisorName: string): PortfolioItemRecord | null {
  if (listing.deletedAt !== null || !["preparing", "active", "reserved"].includes(listing.status)) return null;
  const property = listing.propertySummary;
  return {
    id: `listing-${listing.id}`, sourceListingId: listing.id, sourcePropertyId: listing.propertyId,
    source: "listing", officeId: listing.officeId, ownerUid: listing.ownerUid,
    sharedByName: advisorName, sourceAuthorName: advisorName,
    headline: property.address, summary: property.address,
    location: property.regionSlug.replace(/-/gu, " "), transactionType,
    propertyType: property.type, askingPrice: listing.askingPrice === null ? null : { amount: listing.askingPrice, currency: listing.currency },
    bedroomCount: property.type === "land" ? null : property.roomCount, livingRoomCount: null,
    areaM2: property.type === "land" ? null : property.areaM2, landAreaM2: property.type === "land" ? property.areaM2 : null,
    features: property.features, attributes: [], authorizationType: listing.authorizationType,
    titleDeedType: "unknown", constructionAllowed: null, listingUrl: null,
    availability: listing.status === "reserved" ? "reserved" : "available",
    createdAt: listing.createdAt, updatedAt: listing.updatedAt,
  };
}
