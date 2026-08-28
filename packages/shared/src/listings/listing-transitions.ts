import { z } from "zod";
import { listingStatuses } from "./listing-draft.js";
import type { ListingStatus } from "../domain/entities.js";

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
