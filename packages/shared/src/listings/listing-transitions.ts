import { z } from "zod";
import { listingStatuses } from "./listing-draft.js";
import type { Listing, ListingStatus } from "../domain/entities.js";

const transitions: Record<ListingStatus, readonly ListingStatus[]> = {
  preparing: ["active", "removed"],
  active: ["reserved", "sold", "rented", "removed"],
  reserved: ["active", "sold", "rented", "removed"],
  sold: [], rented: [], removed: [],
};

export const listingTransitionSchema = z.object({
  listingId: z.string().trim().min(1).max(160),
  toStatus: z.enum(listingStatuses),
  reason: z.string().trim().max(500).nullable(),
}).strict();
export type ListingTransition = z.infer<typeof listingTransitionSchema>;

export function nextListingStatuses(status: ListingStatus): readonly ListingStatus[] { return transitions[status]; }
export function assertListingTransition(from: ListingStatus, to: ListingStatus): void {
  if (!transitions[from].includes(to)) throw new Error(`Listing cannot move from ${from} to ${to}.`);
}

export interface ListingReadinessItem {
  key: "authorization" | "price" | "property" | "mandate" | "eids" | "media" | "processing_basis";
  label: string;
  ready: boolean;
}

/** The server and both clients use the same minimum activation contract. */
export function listingReadiness(listing: Pick<Listing, "authorizationType" | "askingPrice" | "propertySummary" | "readinessEvidence">): ListingReadinessItem[] {
  const evidence = listing.readinessEvidence;
  return [
    { key: "authorization", label: "Yetki türü doğrulandı", ready: listing.authorizationType !== "unknown" },
    { key: "price", label: "Liste fiyatı girildi", ready: typeof listing.askingPrice === "number" && listing.askingPrice > 0 },
    { key: "property", label: "Mülk ve adres bilgisi tamam", ready: listing.propertySummary.address.trim().length >= 3 && listing.propertySummary.regionSlug.trim().length >= 2 },
    { key: "mandate", label: "Yetki sözleşmesi veya muafiyet doğrulandı", ready: evidence?.mandate === "verified" || evidence?.mandate === "not_required" },
    { key: "eids", label: "EİDS kaydı veya muafiyet doğrulandı", ready: evidence?.eids === "verified" || evidence?.eids === "not_required" },
    { key: "media", label: "Fotoğraf ve medya yayına hazır", ready: evidence?.media === "ready" },
    { key: "processing_basis", label: "İşleme dayanağı doğrulandı", ready: evidence?.processingBasis === "verified" },
  ];
}

export function listingActivationIssues(listing: Pick<Listing, "authorizationType" | "askingPrice" | "propertySummary" | "readinessEvidence">): string[] {
  return listingReadiness(listing).filter((item) => !item.ready).map((item) => item.label);
}
