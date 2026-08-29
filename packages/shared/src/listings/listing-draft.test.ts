import { describe, expect, it } from "vitest";
import { createPropertyAndListing, existingListingDraftSchema, listingDraftSchema, type ListingDraft } from "./listing-draft.js";

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
  });

  it("accepts an existing owner authorization without a prebuilt opportunity", () => {
    const listing = Object.fromEntries(Object.entries(draft).filter(([key]) => key !== "opportunityId"));
    expect(existingListingDraftSchema.safeParse({ ...listing, ownerContactId: "contact", opportunityType: "seller_listing" }).success).toBe(true);
    expect(existingListingDraftSchema.safeParse({ ...listing, ownerContactId: "", opportunityType: "seller_listing" }).success).toBe(false);
  });
});
