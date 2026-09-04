import { describe, expect, it } from "vitest";
import { createPropertyAndListing, existingListingDraftSchema, listingAuthorizationUpdateSchema, listingDraftSchema, listingPriceUpdateSchema, listingReadinessUpdateSchema, type ListingDraft } from "./listing-draft.js";
import { listingActivationIssues } from "./listing-transitions.js";

const draft: ListingDraft = { opportunityId: "opp-1", address: "Teşvikiye Mah. 12", regionSlug: "Şişli Merkez", propertyType: "apartment", roomCount: 3, areaM2: 145, features: ["parking"], authorizationType: "exclusive", askingPrice: 12_500_000, currency: "TRY", expiresAt: null };

describe("listing draft", () => {
  it("creates separate property and listing entities with English fields", () => {
    const result = createPropertyAndListing(draft, { officeId: "office", ownerUid: "owner" }, "contact", "property", 10);
    expect(result.property.regionSlug).toBe("şişli-merkez");
    expect(result.listing.propertyId).toBe("property");
    expect(result.listing.status).toBe("preparing");
  });

  it("rejects a non-positive asking price", () => {
    expect(listingDraftSchema.safeParse({ ...draft, askingPrice: 0 }).success).toBe(false);
    expect(listingPriceUpdateSchema.safeParse({ listingId: "listing-1", askingPrice: 0, currency: "TRY" }).success).toBe(false);
    expect(listingPriceUpdateSchema.safeParse({ listingId: "listing-1", askingPrice: 12_500_000, currency: "TRY" }).success).toBe(true);
  });

  it("accepts an existing owner authorization without a prebuilt opportunity", () => {
    const listing = Object.fromEntries(Object.entries(draft).filter(([key]) => key !== "opportunityId"));
    expect(existingListingDraftSchema.safeParse({ ...listing, ownerContactId: "contact", opportunityType: "seller_listing" }).success).toBe(true);
    expect(existingListingDraftSchema.safeParse({ ...listing, ownerContactId: "", opportunityType: "seller_listing" }).success).toBe(false);
  });

  it("keeps the source inbox item when an authorization comes from the feed", () => {
    const listing = Object.fromEntries(Object.entries(draft).filter(([key]) => key !== "opportunityId"));
    const result = existingListingDraftSchema.parse({
      ...listing,
      ownerContactId: "contact",
      opportunityType: "seller_listing",
      sourceInboxItemId: "note-1",
    });
    expect(result.sourceInboxItemId).toBe("note-1");
  });

  it("keeps an unknown authorization in preparation until it is verified", () => {
    const listing = createPropertyAndListing({ ...draft, authorizationType: "unknown", askingPrice: null }, { officeId: "office", ownerUid: "owner" }, "contact", "property", 10).listing;
    expect(listingActivationIssues(listing)).toEqual([
      "Yetki türü doğrulandı",
      "Liste fiyatı girildi",
      "Yetki sözleşmesi veya muafiyet doğrulandı",
      "EİDS kaydı veya muafiyet doğrulandı",
      "Fotoğraf ve medya yayına hazır",
    ]);
    expect(listingAuthorizationUpdateSchema.parse({ listingId: "listing-1", authorizationType: "open" }).authorizationType).toBe("open");
  });

  it("requires explicit readiness evidence before activation", () => {
    const listing = createPropertyAndListing(draft, { officeId: "office", ownerUid: "owner" }, "contact", "property", 10).listing;
    expect(listingActivationIssues(listing)).toContain("EİDS kaydı veya muafiyet doğrulandı");
    const evidence = listingReadinessUpdateSchema.parse({ listingId: "listing-1", evidence: { mandate: "verified", eids: "not_required", media: "ready", processingBasis: "verified" } }).evidence;
    expect(listingActivationIssues({ ...listing, readinessEvidence: evidence })).toEqual([]);
  });
});
