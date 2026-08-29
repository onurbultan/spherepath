import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  assertListingTransition,
  createPropertyAndListing,
  existingListingDraftSchema,
  listingDraftSchema,
  listingTransitionSchema,
  type Listing,
  type ListingDraft,
  type ExistingListingDraft,
  type ListingStatus,
} from "../../../packages/shared/src/index";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims } from "../auth/claims.js";

export interface ListingRecord extends Listing {
  id: string;
  ownerContactName: string;
}

const callableOptions = {
  region: "europe-west8" as const, cors: true, maxInstances: 10, memory: "256MiB" as const, timeoutSeconds: 60,
};
const millis = (value: unknown): number | null => value instanceof Timestamp ? value.toMillis() : null;
const timestamp = (value: number | null): Timestamp | null => value === null ? null : Timestamp.fromMillis(value);

function toStoredListing(listing: Listing) {
  return { ...listing, acquiredAt: Timestamp.fromMillis(listing.acquiredAt), expiresAt: timestamp(listing.expiresAt), deletedAt: timestamp(listing.deletedAt), createdAt: Timestamp.fromMillis(listing.createdAt), updatedAt: Timestamp.fromMillis(listing.updatedAt) };
}

function toListingRecord(id: string, data: DocumentData, ownerContactName: string): ListingRecord {
  return { ...(data as Listing), id, ownerContactName, acquiredAt: millis(data.acquiredAt) ?? 0, expiresAt: millis(data.expiresAt), deletedAt: millis(data.deletedAt), createdAt: millis(data.createdAt) ?? 0, updatedAt: millis(data.updatedAt) ?? 0 };
}

export const listListings = onCall(callableOptions, async (request): Promise<{ listings: ListingRecord[] }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<undefined>(request.data);
  return observeApiRequest("listListings", envelope.requestId, async () => {
    const firestore = getFirestore();
    let query: FirebaseFirestore.Query = firestore.collection("listings").where("officeId", "==", claims.officeId);
    if (claims.role !== "broker") query = query.where("ownerUid", "==", claims.uid);
    const snapshot = await query.limit(200).get();
    const documents = snapshot.docs.filter((item) => item.data().deletedAt === null);
    const opportunityIds = [...new Set(documents.map((item) => item.data().opportunityId as string))];
    const opportunitySnapshots = opportunityIds.length ? await firestore.getAll(...opportunityIds.map((id) => firestore.collection("opportunities").doc(id))) : [];
    const contactIds = [...new Set(opportunitySnapshots.map((item) => item.data()?.subjectContactId as string).filter(Boolean))];
    const contacts = contactIds.length ? await firestore.getAll(...contactIds.map((id) => firestore.collection("contacts").doc(id))) : [];
    const contactNames = new Map(contacts.map((item) => [item.id, (item.data()?.fullName ?? item.data()?.label ?? "İsimsiz kişi") as string]));
    const opportunityContacts = new Map(opportunitySnapshots.map((item) => [item.id, item.data()?.subjectContactId as string]));
    const listings = documents.map((item) => toListingRecord(item.id, item.data(), contactNames.get(opportunityContacts.get(item.data().opportunityId) ?? "") ?? "İsimsiz kişi")).sort((left, right) => right.updatedAt - left.updatedAt);
    return { listings };
  });
});

export const createListing = onCall(callableOptions, async (request): Promise<{ listing: ListingRecord }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<ListingDraft>(request.data, { command: true });
  const parsed = listingDraftSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Listing input is invalid.", parsed.error.flatten());

  return observeApiRequest("createListing", envelope.requestId, async () => {
    const firestore = getFirestore();
    const opportunityRef = firestore.collection("opportunities").doc(parsed.data.opportunityId);
    const propertyRef = firestore.collection("properties").doc();
    const listingRef = firestore.collection("listings").doc();
    const eventRef = firestore.collection("stageEvents").doc();
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const result = await firestore.runTransaction(async (transaction) => {
      const [receiptSnapshot, opportunitySnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(opportunityRef)]);
      if (receiptSnapshot.exists) {
        const receipt = receiptSnapshot.data()!;
        if (receipt.officeId !== claims.officeId || receipt.ownerUid !== claims.uid || receipt.type !== "createListing") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return { listingId: receipt.listingId as string, ownerContactId: receipt.ownerContactId as string };
      }
      if (!opportunitySnapshot.exists) throw new HttpsError("not-found", "Opportunity was not found.");
      const opportunity = opportunitySnapshot.data()!;
      const canManage = opportunity.officeId === claims.officeId && (opportunity.ownerUid === claims.uid || claims.role === "broker") && opportunity.deletedAt === null;
      if (!canManage) throw new HttpsError("permission-denied", "Opportunity is outside your workspace.");
      if (opportunity.stage !== "won") throw new HttpsError("failed-precondition", "Only won opportunities can become listings.");
      if (!['seller_listing', 'landlord_listing'].includes(opportunity.type)) throw new HttpsError("failed-precondition", "Only owner opportunities can become listings.");
      if (opportunity.propertyId) throw new HttpsError("already-exists", "Opportunity already has a property.");

      const now = Date.now();
      const nowTimestamp = Timestamp.fromMillis(now);
      const entities = createPropertyAndListing(parsed.data, { officeId: opportunity.officeId, ownerUid: opportunity.ownerUid }, opportunity.subjectContactId, propertyRef.id, now);
      transaction.create(propertyRef, { ...entities.property, deletedAt: null, createdAt: nowTimestamp, updatedAt: nowTimestamp });
      transaction.create(listingRef, toStoredListing(entities.listing));
      transaction.update(opportunityRef, { propertyId: propertyRef.id, updatedAt: nowTimestamp });
      transaction.create(eventRef, { officeId: opportunity.officeId, ownerUid: opportunity.ownerUid, entityType: "listing", entityId: listingRef.id, fromStage: null, toStage: "preparing", reason: "Listing created from won opportunity", commandId: envelope.commandId, occurredAt: nowTimestamp, createdAt: nowTimestamp });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "createListing", listingId: listingRef.id, propertyId: propertyRef.id, ownerContactId: opportunity.subjectContactId, createdAt: nowTimestamp });
      return { listingId: listingRef.id, ownerContactId: opportunity.subjectContactId as string };
    });

    const [listingSnapshot, contactSnapshot] = await Promise.all([firestore.collection("listings").doc(result.listingId).get(), firestore.collection("contacts").doc(result.ownerContactId).get()]);
    const contact = contactSnapshot.data();
    return { listing: toListingRecord(listingSnapshot.id, listingSnapshot.data()!, (contact?.fullName ?? contact?.label ?? "İsimsiz kişi") as string) };
  });
});

export const importExistingListing = onCall(callableOptions, async (request): Promise<{ listing: ListingRecord }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<ExistingListingDraft>(request.data, { command: true });
  const parsed = existingListingDraftSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Existing listing input is invalid.", parsed.error.flatten());

  return observeApiRequest("importExistingListing", envelope.requestId, async () => {
    const firestore = getFirestore();
    const contactRef = firestore.collection("contacts").doc(parsed.data.ownerContactId);
    const opportunityRef = firestore.collection("opportunities").doc();
    const propertyRef = firestore.collection("properties").doc();
    const listingRef = firestore.collection("listings").doc();
    const opportunityEventRef = firestore.collection("stageEvents").doc();
    const listingEventRef = firestore.collection("stageEvents").doc();
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const result = await firestore.runTransaction(async (transaction) => {
      const [receiptSnapshot, contactSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(contactRef)]);
      if (receiptSnapshot.exists) {
        const receipt = receiptSnapshot.data()!;
        if (receipt.officeId !== claims.officeId || receipt.ownerUid !== claims.uid || receipt.type !== "importExistingListing") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return { listingId: receipt.listingId as string, ownerContactId: receipt.ownerContactId as string };
      }
      if (!contactSnapshot.exists) throw new HttpsError("not-found", "Contact was not found.");
      const contact = contactSnapshot.data()!;
      const canManage = contact.officeId === claims.officeId && (contact.ownerUid === claims.uid || claims.role === "broker") && contact.deletedAt === null;
      if (!canManage) throw new HttpsError("permission-denied", "Contact is outside your workspace.");

      const now = Date.now();
      const nowTimestamp = Timestamp.fromMillis(now);
      const tenant = { officeId: contact.officeId as string, ownerUid: contact.ownerUid as string };
      const entities = createPropertyAndListing({
        opportunityId: opportunityRef.id,
        address: parsed.data.address,
        regionSlug: parsed.data.regionSlug,
        propertyType: parsed.data.propertyType,
        roomCount: parsed.data.roomCount,
        areaM2: parsed.data.areaM2,
        features: parsed.data.features,
        authorizationType: parsed.data.authorizationType,
        askingPrice: parsed.data.askingPrice,
        currency: parsed.data.currency,
        expiresAt: parsed.data.expiresAt,
      }, tenant, parsed.data.ownerContactId, propertyRef.id, now);
      transaction.create(opportunityRef, {
        ...tenant,
        type: parsed.data.opportunityType,
        subjectContactId: parsed.data.ownerContactId,
        sourceContactId: null,
        referralId: null,
        propertyId: propertyRef.id,
        stage: "won",
        qualifiedAt: nowTimestamp,
        stageEnteredAt: nowTimestamp,
        nextActionAt: null,
        nextActionType: null,
        lostReason: null,
        estimatedValue: { amount: parsed.data.askingPrice, currency: parsed.data.currency },
        closedAt: nowTimestamp,
        deletedAt: null,
        createdAt: nowTimestamp,
        updatedAt: nowTimestamp,
      });
      transaction.create(propertyRef, { ...entities.property, deletedAt: null, createdAt: nowTimestamp, updatedAt: nowTimestamp });
      transaction.create(listingRef, toStoredListing(entities.listing));
      transaction.create(opportunityEventRef, { ...tenant, entityType: "opportunity", entityId: opportunityRef.id, fromStage: null, toStage: "won", reason: "Mevcut yetki içe aktarıldı", commandId: envelope.commandId, occurredAt: nowTimestamp, createdAt: nowTimestamp });
      transaction.create(listingEventRef, { ...tenant, entityType: "listing", entityId: listingRef.id, fromStage: null, toStage: "preparing", reason: "Mevcut yetki içe aktarıldı", commandId: envelope.commandId, occurredAt: nowTimestamp, createdAt: nowTimestamp });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "importExistingListing", listingId: listingRef.id, opportunityId: opportunityRef.id, propertyId: propertyRef.id, ownerContactId: parsed.data.ownerContactId, createdAt: nowTimestamp });
      return { listingId: listingRef.id, ownerContactId: parsed.data.ownerContactId };
    });

    const [listingSnapshot, contactSnapshot] = await Promise.all([firestore.collection("listings").doc(result.listingId).get(), firestore.collection("contacts").doc(result.ownerContactId).get()]);
    const contact = contactSnapshot.data();
    return { listing: toListingRecord(listingSnapshot.id, listingSnapshot.data()!, (contact?.fullName ?? contact?.label ?? "İsimsiz kişi") as string) };
  });
});

export const advanceListing = onCall(callableOptions, async (request): Promise<{ listingId: string; toStatus: ListingStatus; eventId: string }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = listingTransitionSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Listing transition is invalid.", parsed.error.flatten());

  return observeApiRequest("advanceListing", envelope.requestId, async () => {
    const firestore = getFirestore();
    const listingRef = firestore.collection("listings").doc(parsed.data.listingId);
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const eventRef = firestore.collection("stageEvents").doc();
    return firestore.runTransaction(async (transaction) => {
      const [receiptSnapshot, listingSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(listingRef)]);
      if (receiptSnapshot.exists) {
        const receipt = receiptSnapshot.data()!;
        if (receipt.officeId !== claims.officeId || receipt.ownerUid !== claims.uid || receipt.type !== "advanceListing") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return { listingId: receipt.listingId as string, toStatus: receipt.toStatus as ListingStatus, eventId: receipt.eventId as string };
      }
      if (!listingSnapshot.exists) throw new HttpsError("not-found", "Listing was not found.");
      const listing = listingSnapshot.data()!;
      const canManage = listing.officeId === claims.officeId && (listing.ownerUid === claims.uid || claims.role === "broker") && listing.deletedAt === null;
      if (!canManage) throw new HttpsError("permission-denied", "Listing is outside your workspace.");
      try { assertListingTransition(listing.status as ListingStatus, parsed.data.toStatus); }
      catch { throw new HttpsError("failed-precondition", `Listing cannot move from ${listing.status} to ${parsed.data.toStatus}.`); }
      const now = Timestamp.now();
      transaction.update(listingRef, { status: parsed.data.toStatus, updatedAt: now });
      transaction.create(eventRef, { officeId: listing.officeId, ownerUid: listing.ownerUid, entityType: "listing", entityId: listingRef.id, fromStage: listing.status, toStage: parsed.data.toStatus, reason: parsed.data.reason, commandId: envelope.commandId, occurredAt: now, createdAt: now });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "advanceListing", listingId: listingRef.id, toStatus: parsed.data.toStatus, eventId: eventRef.id, createdAt: now });
      return { listingId: listingRef.id, toStatus: parsed.data.toStatus, eventId: eventRef.id };
    });
  });
});
