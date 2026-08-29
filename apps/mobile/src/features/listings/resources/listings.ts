import { createCommandId, type ExistingListingDraft, type Listing, type ListingDraft, type ListingStatus, type ListingTransition } from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";

export interface ListingRecord extends Listing { id: string; ownerContactName: string }
export async function listListings(): Promise<ListingRecord[]> { return (await apiClient.query<undefined, { listings: ListingRecord[] }>("listListings", undefined)).listings; }
export async function saveListing(session: WorkspaceSession, draft: ListingDraft): Promise<ListingRecord> { return (await apiClient.command<ListingDraft, { listing: ListingRecord }>("createListing", draft, createCommandId(session.uid))).listing; }
export async function saveExistingListing(session: WorkspaceSession, draft: ExistingListingDraft): Promise<ListingRecord> { return (await apiClient.command<ExistingListingDraft, { listing: ListingRecord }>("importExistingListing", draft, createCommandId(session.uid))).listing; }
export async function moveListing(session: WorkspaceSession, transition: ListingTransition): Promise<{ listingId: string; toStatus: ListingStatus; eventId: string }> { return apiClient.command<ListingTransition, { listingId: string; toStatus: ListingStatus; eventId: string }>("advanceListing", transition, createCommandId(session.uid)); }
