import { getFirestore, Timestamp, FieldPath, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  contactDraftSchema,
  contactMemorySchema,
  contactPrivacyDraftSchema,
  contactMemoryNotesSchema,
  createContact as createContactEntity,
  createKnownProperty,
  firstSpecialCategoryRefusal,
  knownPropertyDraftSchema,
  mergeContactRoles,
  type Contact,
  type ContactDraft,
  type ContactPrivacyDraft,
  type Interaction,
  type KnownPropertyRecord,
} from "../../../packages/shared/src/index";
import { requireSpherepathClaims, type SpherepathClaims } from "../auth/claims.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { contactPhoneFields } from "./phone-index.js";
import { toStoredContact } from "./contact-store.js";

interface ContactRecord extends Contact {
  id: string;
}

interface ContactInteractionRecord extends Interaction {
  id: string;
}

interface ContactTaskOutcomeRecord {
  id: string;
  taskId: string;
  status: "completed" | "skipped" | "rescheduled" | "contact_opt_out";
  note: string | null;
  rescheduledAt: number | null;
  resolvedAt: number;
}

function callableOptions() {
  return {
    region: "europe-west8" as const,
    cors: true,
    maxInstances: 10,
    memory: "256MiB" as const,
    timeoutSeconds: 60,
  };
}

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function timestamp(value: number | null): Timestamp | null {
  return value === null ? null : Timestamp.fromMillis(value);
}

function toContactRecord(id: string, data: DocumentData): ContactRecord {
  const relationship = data.relationship as DocumentData;
  const privacy = data.privacy as DocumentData;
  const memory = (data.memory ?? {}) as DocumentData;
  const purposes = (privacy.purposes ?? {}) as Record<string, DocumentData>;
  return {
    ...(data as Contact),
    id,
    metAt: millis(data.metAt),
    createdAt: millis(data.createdAt) ?? 0,
    updatedAt: millis(data.updatedAt) ?? 0,
    deletedAt: millis(data.deletedAt),
    relationship: {
      ...(relationship as Contact["relationship"]),
      lastTouchAt: millis(relationship.lastTouchAt),
      nextActionAt: millis(relationship.nextActionAt),
    },
    memory: contactMemorySchema.parse({
      keyThingsToRemember: memory.keyThingsToRemember ?? [],
      propertySituations: memory.propertySituations ?? [],
      propertyPreferences: memory.propertyPreferences ?? {
        transactionType: null,
        propertyTypes: [],
        preferredLocations: [],
        budgetRange: null,
        bedroomCountMin: null,
        livingRoomCountMin: null,
        roomCountMin: null,
        areaMinM2: null,
        areaMaxM2: null,
        mustHaves: [],
        dealBreakers: [],
        timeline: null,
      },
      updatedAt: millis(memory.updatedAt),
    }),
    privacy: {
      ...(privacy as Contact["privacy"]),
      purposes: Object.fromEntries(Object.entries(purposes).map(([key, purpose]) => [key, { legalBasis: (purpose.legalBasis ?? "legitimate_interest") as Contact["privacy"]["purposes"][string]["legalBasis"], startedAt: millis(purpose.startedAt) ?? 0 }])),
      noticeAt: millis(privacy.noticeAt),
      marketingConsentAt: millis(privacy.marketingConsentAt),
      marketingWithdrawnAt: millis(privacy.marketingWithdrawnAt),
      iysCheckedAt: millis(privacy.iysCheckedAt),
      deletionRequestedAt: millis(privacy.deletionRequestedAt),
    },
  };
}


function toInteractionRecord(id: string, data: DocumentData): ContactInteractionRecord {
  return {
    ...(data as Interaction),
    id,
    occurredAt: millis(data.occurredAt) ?? 0,
    nextActionAt: millis(data.nextActionAt),
    createdAt: millis(data.createdAt) ?? 0,
  };
}

function parseDraft(value: unknown): ContactDraft {
  const parsed = contactDraftSchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Contact input is invalid.", parsed.error.flatten());
  }
  return parsed.data;
}

function parseContactId(value: unknown): string {
  return parseDocumentId(value, "contactId");
}

function parseDocumentId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 160) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return value;
}

function canManage(data: DocumentData, claims: SpherepathClaims) {
  return data.officeId === claims.officeId && (data.ownerUid === claims.uid || claims.role === "broker");
}

function validateCommandReceipt(data: DocumentData, claims: SpherepathClaims, type: string): string {
  if (data.officeId !== claims.officeId || data.ownerUid !== claims.uid || data.type !== type || typeof data.contactId !== "string") {
    throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
  }
  return data.contactId;
}

export const listContacts = onCall(callableOptions(), async (request): Promise<{ contacts: ContactRecord[]; nextCursor: string | null }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<{ cursor?: unknown } | undefined>(request.data);
  const cursor = envelope.data?.cursor;
  if (cursor !== undefined && (typeof cursor !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/u.test(cursor))) throw new HttpsError("invalid-argument", "Invalid cursor.");
  return observeApiRequest("listContacts", envelope.requestId, async () => {
    const firestore = getFirestore();
    let contactsQuery: FirebaseFirestore.Query = firestore.collection("contacts")
      .where("officeId", "==", claims.officeId);
    if (claims.role !== "broker") contactsQuery = contactsQuery.where("ownerUid", "==", claims.uid);

    contactsQuery = contactsQuery.orderBy(FieldPath.documentId());
    if (typeof cursor === "string") contactsQuery = contactsQuery.startAfter(cursor);
    // Older clients sent undefined and expect the original first 1,000 rows.
    // Current resources opt into 500-row cursor pagination with an object.
    const pageSize = envelope.data == null ? 1_000 : 500;
    const snapshot = await contactsQuery.limit(pageSize + 1).get();
    const page = snapshot.docs.slice(0, pageSize);
    const contacts = page
      .map((item) => toContactRecord(item.id, item.data()))
      .filter((contact) => contact.deletedAt === null)
      .sort((left, right) => right.createdAt - left.createdAt);
    return { contacts, nextCursor: snapshot.size > pageSize ? page.at(-1)!.id : null };
  });
});

export const listContactInteractions = onCall(callableOptions(), async (request): Promise<{ interactions: ContactInteractionRecord[]; taskOutcomes: ContactTaskOutcomeRecord[] }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<{ contactId?: unknown }>(request.data);
  const contactId = parseContactId(envelope.data?.contactId);
  return observeApiRequest("listContactInteractions", envelope.requestId, async () => {
    const firestore = getFirestore();
    const contactSnapshot = await firestore.collection("contacts").doc(contactId).get();
    if (!contactSnapshot.exists || !canManage(contactSnapshot.data()!, claims) || contactSnapshot.data()!.deletedAt !== null) {
      throw new HttpsError("not-found", "Contact was not found.");
    }
    const directTaskIds = [`next-action-${contactId}`, `first-interaction-${contactId}`];
    const [snapshot, contactTaskOutcomesSnapshot, legacyTaskOutcomesSnapshot] = await Promise.all([
      firestore.collection("interactions").where("contactId", "==", contactId).limit(100).get(),
      firestore.collection("dailyTaskCompletions").where("contactId", "==", contactId).limit(100).get(),
      firestore.collection("dailyTaskCompletions").where("taskId", "in", directTaskIds).limit(100).get(),
    ]);
    const interactions = snapshot.docs
      .filter((item) => canManage(item.data(), claims))
      .map((item) => toInteractionRecord(item.id, item.data()))
      .sort((left, right) => right.occurredAt - left.occurredAt);
    const taskOutcomeDocuments = new Map([...contactTaskOutcomesSnapshot.docs, ...legacyTaskOutcomesSnapshot.docs].map((item) => [item.id, item]));
    const taskOutcomes = [...taskOutcomeDocuments.values()]
      .filter((item) => {
        const data = item.data();
        return canManage(data, claims) && (data.contactId === contactId || directTaskIds.includes(data.taskId as string));
      })
      .flatMap<ContactTaskOutcomeRecord>((item) => {
        const data = item.data();
        if (!["completed", "skipped", "rescheduled", "contact_opt_out"].includes(data.status as string)) return [];
        return [{
          id: item.id,
          taskId: data.taskId as string,
          status: data.status as ContactTaskOutcomeRecord["status"],
          note: typeof data.outcomeNote === "string" ? data.outcomeNote : typeof data.skippedReason === "string" ? data.skippedReason : null,
          rescheduledAt: millis(data.rescheduledAt),
          resolvedAt: millis(data.resolvedAt) ?? millis(data.updatedAt) ?? 0,
        }];
      })
      .sort((left, right) => right.resolvedAt - left.resolvedAt);
    return { interactions, taskOutcomes };
  });
});

export const createContact = onCall(callableOptions(), async (request): Promise<{ contact: ContactRecord }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<ContactDraft>(request.data, { command: true });
  return observeApiRequest("createContact", envelope.requestId, async () => {
    const draft = parseDraft(envelope.data);
    const firestore = getFirestore();
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const contactRef = firestore.collection("contacts").doc();
    const now = Date.now();
    const contact = { ...createContactEntity(draft, { officeId: claims.officeId, ownerUid: claims.uid }, now), ...contactPhoneFields(draft.phone) };
    const contactId = await firestore.runTransaction(async (transaction) => {
      const receipt = await transaction.get(commandRef);
      if (receipt.exists) return validateCommandReceipt(receipt.data()!, claims, "createContact");
      transaction.create(contactRef, toStoredContact(contact));
      transaction.create(commandRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        type: "createContact",
        contactId: contactRef.id,
        createdAt: Timestamp.fromMillis(now),
      });
      return contactRef.id;
    });
    const snapshot = await firestore.collection("contacts").doc(contactId).get();
    return { contact: toContactRecord(snapshot.id, snapshot.data()!) };
  });
});

export const updateContact = onCall(callableOptions(), async (request): Promise<{ contact: ContactRecord }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<{ contactId?: unknown; draft?: unknown }>(request.data, { command: true });
  const input = envelope.data;
  const contactId = parseContactId(input?.contactId);
  const draft = parseDraft(input?.draft);
  const firestore = getFirestore();
  const reference = firestore.collection("contacts").doc(contactId);
  const commandRef = firestore.collection("commands").doc(envelope.commandId!);

  return observeApiRequest("updateContact", envelope.requestId, async () => {
  await firestore.runTransaction(async (transaction) => {
    const [receipt, snapshot] = await Promise.all([transaction.get(commandRef), transaction.get(reference)]);
    if (receipt.exists) {
      const receiptContactId = validateCommandReceipt(receipt.data()!, claims, "updateContact");
      if (receiptContactId !== contactId) throw new HttpsError("permission-denied", "Command receipt target does not match.");
      return;
    }
    if (!snapshot.exists) throw new HttpsError("not-found", "Contact was not found.");
    const data = snapshot.data()!;
    if (!canManage(data, claims) || data.deletedAt !== null) {
      throw new HttpsError("permission-denied", "Contact is outside your workspace.");
    }
    const now = Timestamp.now();
    transaction.update(reference, {
      fullName: draft.fullName,
      internalLabel: draft.internalLabel || null,
      label: null,
      ...contactPhoneFields(draft.phone),
      metAtPlace: draft.metAtPlace || null,
      source: draft.source,
      // The form offers one role; the contact may already hold several, each put
      // there by work that was opened for them. Writing the single choice over
      // the set used to delete the rest without saying so.
      roles: mergeContactRoles((data.roles ?? []) as Contact["roles"], draft.role),
      updatedAt: now,
    });
    transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "updateContact", contactId, createdAt: now });
  });

  const updated = await reference.get();
  return { contact: toContactRecord(updated.id, updated.data()!) };
  });
});

export const archiveContact = onCall(callableOptions(), async (request): Promise<{ contactId: string }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<{ contactId?: unknown }>(request.data, { command: true });
  const contactId = parseContactId(envelope.data?.contactId);
  const firestore = getFirestore();
  const reference = firestore.collection("contacts").doc(contactId);
  const commandRef = firestore.collection("commands").doc(envelope.commandId!);

  return observeApiRequest("archiveContact", envelope.requestId, async () => {
  await firestore.runTransaction(async (transaction) => {
    const [receipt, snapshot] = await Promise.all([transaction.get(commandRef), transaction.get(reference)]);
    if (receipt.exists) {
      const receiptContactId = validateCommandReceipt(receipt.data()!, claims, "archiveContact");
      if (receiptContactId !== contactId) throw new HttpsError("permission-denied", "Command receipt target does not match.");
      return;
    }
    if (!snapshot.exists) throw new HttpsError("not-found", "Contact was not found.");
    const data = snapshot.data()!;
    if (!canManage(data, claims) || data.deletedAt !== null) {
      throw new HttpsError("permission-denied", "Contact is outside your workspace.");
    }
    const now = Timestamp.now();
    transaction.update(reference, { deletedAt: now, updatedAt: now });
    transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "archiveContact", contactId, createdAt: now });
  });

  return { contactId };
  });
});

export const updateContactPrivacy = onCall(callableOptions(), async (request): Promise<{ contact: ContactRecord }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<ContactPrivacyDraft>(request.data, { command: true });
  const parsed = contactPrivacyDraftSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Privacy input is invalid.", parsed.error.flatten());
  const firestore = getFirestore();
  const reference = firestore.collection("contacts").doc(parsed.data.contactId);
  const commandRef = firestore.collection("commands").doc(envelope.commandId!);

  return observeApiRequest("updateContactPrivacy", envelope.requestId, async () => {
    await firestore.runTransaction(async (transaction) => {
      const [receipt, snapshot] = await Promise.all([transaction.get(commandRef), transaction.get(reference)]);
      if (receipt.exists) {
        const receiptContactId = validateCommandReceipt(receipt.data()!, claims, "updateContactPrivacy");
        if (receiptContactId !== parsed.data.contactId) throw new HttpsError("permission-denied", "Command receipt target does not match.");
        return;
      }
      if (!snapshot.exists) throw new HttpsError("not-found", "Contact was not found.");
      const data = snapshot.data()!;
      if (!canManage(data, claims) || data.deletedAt !== null) throw new HttpsError("permission-denied", "Contact is outside your workspace.");
      const now = Timestamp.now();
      const previous = (data.privacy ?? {}) as DocumentData;
      const consentChangedToGranted = parsed.data.marketingConsent === "granted" && previous.marketingConsent !== "granted";
      const consentChangedToWithdrawn = parsed.data.marketingConsent === "withdrawn" && previous.marketingConsent !== "withdrawn";
      transaction.update(reference, {
        privacy: {
          purposes: { core_crm: { legalBasis: parsed.data.coreCrmLegalBasis, startedAt: previous.purposes?.core_crm?.startedAt ?? now } },
          noticeStatus: parsed.data.noticeStatus,
          noticeAt: parsed.data.noticeStatus === "completed" ? previous.noticeAt ?? now : null,
          noticeMethod: parsed.data.noticeStatus === "completed" ? parsed.data.noticeMethod : null,
          noticeVersion: parsed.data.noticeStatus === "completed" ? parsed.data.noticeVersion : null,
          marketingConsent: parsed.data.marketingConsent,
          marketingConsentAt: consentChangedToGranted ? now : previous.marketingConsentAt ?? null,
          marketingWithdrawnAt: consentChangedToWithdrawn ? now : previous.marketingWithdrawnAt ?? null,
          marketingChannels: parsed.data.marketingConsent === "granted" ? parsed.data.marketingChannels : [],
          iysStatus: parsed.data.iysStatus,
          iysCheckedAt: parsed.data.iysStatus === "unknown" ? null : now,
          profilingObjection: parsed.data.profilingObjection,
          deletionRequestedAt: previous.deletionRequestedAt ?? null,
        },
        updatedAt: now,
      });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "updateContactPrivacy", contactId: parsed.data.contactId, createdAt: now });
    });
    const snapshot = await reference.get();
    return { contact: toContactRecord(snapshot.id, snapshot.data()!) };
  });
});

/**
 * What the advisor knows about a person, written by the advisor. Contact memory
 * could only ever be filled by an approved reading of a note, so everything an
 * advisor simply knew -- what somebody does for a living, what they care about,
 * what they asked to be consulted on -- had nowhere to go.
 *
 * Property preferences are deliberately untouched here: those are matched
 * against inventory and are built from confirmed readings, not free text.
 */
export const updateContactMemory = onCall(callableOptions(), async (request): Promise<{ contact: ContactRecord }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = contactMemoryNotesSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Hafıza notları geçersiz.", parsed.error.flatten());
  const refusal = firstSpecialCategoryRefusal(parsed.data.keyThingsToRemember);
  if (refusal) throw new HttpsError("invalid-argument", refusal);

  const firestore = getFirestore();
  const reference = firestore.collection("contacts").doc(parsed.data.contactId);
  const commandRef = firestore.collection("commands").doc(envelope.commandId!);

  return observeApiRequest("updateContactMemory", envelope.requestId, async () => {
    await firestore.runTransaction(async (transaction) => {
      const [receipt, snapshot] = await Promise.all([transaction.get(commandRef), transaction.get(reference)]);
      if (receipt.exists) {
        const receiptContactId = validateCommandReceipt(receipt.data()!, claims, "updateContactMemory");
        if (receiptContactId !== parsed.data.contactId) throw new HttpsError("permission-denied", "Command receipt target does not match.");
        return;
      }
      if (!snapshot.exists) throw new HttpsError("not-found", "Contact was not found.");
      const data = snapshot.data()!;
      if (!canManage(data, claims) || data.deletedAt !== null) throw new HttpsError("permission-denied", "Contact is outside your workspace.");
      const now = Timestamp.now();
      transaction.update(reference, {
        "memory.keyThingsToRemember": parsed.data.keyThingsToRemember,
        "memory.updatedAt": now,
        updatedAt: now,
      });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "updateContactMemory", contactId: parsed.data.contactId, createdAt: now });
    });
    const updated = await reference.get();
    return { contact: toContactRecord(updated.id, updated.data()!) };
  });
});

function toKnownPropertyRecord(id: string, data: DocumentData, hasListing: boolean): KnownPropertyRecord {
  return {
    ...(data as KnownPropertyRecord),
    id,
    hasListing,
    note: (data.note ?? null) as string | null,
    createdAt: millis(data.createdAt) ?? 0,
    updatedAt: millis(data.updatedAt) ?? 0,
    deletedAt: millis(data.deletedAt),
  };
}

export const listKnownProperties = onCall(callableOptions(), async (request): Promise<{ properties: KnownPropertyRecord[] }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<{ contactId?: unknown }>(request.data);
  const contactId = parseContactId(envelope.data?.contactId);
  return observeApiRequest("listKnownProperties", envelope.requestId, async () => {
    const firestore = getFirestore();
    const contactSnapshot = await firestore.collection("contacts").doc(contactId).get();
    if (!contactSnapshot.exists || !canManage(contactSnapshot.data()!, claims) || contactSnapshot.data()!.deletedAt !== null) {
      throw new HttpsError("not-found", "Contact was not found.");
    }
    const snapshot = await firestore.collection("properties")
      .where("officeId", "==", claims.officeId)
      .where("ownerContactId", "==", contactId)
      .limit(100)
      .get();
    const owned = snapshot.docs.filter((item) => canManage(item.data(), claims) && item.data().deletedAt === null);
    if (!owned.length) return { properties: [] };
    // A property with a mandate belongs on the portfolio screen; the card says
    // so rather than offering to record what is already recorded there.
    const listings = await firestore.collection("listings").where("officeId", "==", claims.officeId).limit(500).get();
    const listed = new Set(listings.docs.filter((item) => item.data().deletedAt === null).map((item) => item.data().propertyId as string));
    return {
      properties: owned
        .map((item) => toKnownPropertyRecord(item.id, item.data(), listed.has(item.id)))
        .sort((left, right) => right.createdAt - left.createdAt),
    };
  });
});

/**
 * Records a property the advisor knows this person owns. No mandate is implied
 * and none is written: knowing that somebody has a field in Bodrum is not the
 * same as having the right to sell it, and the only way to write the first down
 * used to be to invent the second by opening a listing for it.
 */
export const saveKnownProperty = onCall(callableOptions(), async (request): Promise<{ property: KnownPropertyRecord }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = knownPropertyDraftSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Mülk bilgisi geçersiz.", parsed.error.flatten());

  const firestore = getFirestore();
  const contactRef = firestore.collection("contacts").doc(parsed.data.contactId);
  const propertyRef = parsed.data.propertyId
    ? firestore.collection("properties").doc(parsed.data.propertyId)
    : firestore.collection("properties").doc();
  const commandRef = firestore.collection("commands").doc(envelope.commandId!);

  return observeApiRequest("saveKnownProperty", envelope.requestId, async () => {
    // A replay must come back with the property the first call created, not with
    // the fresh reference this call happened to allocate for a document that was
    // never written.
    let savedPropertyId = propertyRef.id;
    await firestore.runTransaction(async (transaction) => {
      const [receipt, contactSnapshot, propertySnapshot] = await Promise.all([
        transaction.get(commandRef),
        transaction.get(contactRef),
        parsed.data.propertyId ? transaction.get(propertyRef) : Promise.resolve(null),
      ]);
      if (receipt.exists) {
        if (receipt.data()!.officeId !== claims.officeId || receipt.data()!.ownerUid !== claims.uid || receipt.data()!.type !== "saveKnownProperty") {
          throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        }
        savedPropertyId = receipt.data()!.propertyId as string;
        return;
      }
      const contact = contactSnapshot.data();
      if (!contactSnapshot.exists || !contact || !canManage(contact, claims) || contact.deletedAt !== null) {
        throw new HttpsError("not-found", "Contact was not found.");
      }
      const now = Date.now();
      const nowStamp = Timestamp.fromMillis(now);
      const property = createKnownProperty(parsed.data, { officeId: claims.officeId, ownerUid: claims.uid }, now);
      if (propertySnapshot) {
        const existing = propertySnapshot.data();
        if (!propertySnapshot.exists || !existing || !canManage(existing, claims) || existing.deletedAt !== null) {
          throw new HttpsError("not-found", "Mülk bulunamadı.");
        }
        // A correction keeps the record's own history; only what was typed moves.
        transaction.update(propertyRef, {
          address: property.address, regionSlug: property.regionSlug, type: property.type,
          roomCount: property.roomCount, areaM2: property.areaM2, features: property.features,
          note: property.note, updatedAt: nowStamp,
        });
      } else {
        transaction.create(propertyRef, { ...property, createdAt: nowStamp, updatedAt: nowStamp, deletedAt: null });
      }
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "saveKnownProperty", contactId: parsed.data.contactId, propertyId: propertyRef.id, createdAt: nowStamp });
    });
    const saved = await firestore.collection("properties").doc(savedPropertyId).get();
    const data = saved.data();
    if (!saved.exists || !data) throw new HttpsError("not-found", "Mülk bulunamadı.");
    // Whether a mandate exists is read rather than assumed, so a correction to a
    // property already in the portfolio does not come back claiming otherwise.
    const listings = await firestore.collection("listings")
      .where("officeId", "==", claims.officeId)
      .where("propertyId", "==", savedPropertyId)
      .limit(1)
      .get();
    const hasListing = listings.docs.some((item) => item.data().deletedAt === null);
    return { property: toKnownPropertyRecord(saved.id, data, hasListing) };
  });
});

export const archiveKnownProperty = onCall(callableOptions(), async (request): Promise<{ propertyId: string }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<{ propertyId?: unknown }>(request.data, { command: true });
  const propertyId = parseDocumentId(envelope.data?.propertyId, "propertyId");
  const firestore = getFirestore();
  const reference = firestore.collection("properties").doc(propertyId);
  const commandRef = firestore.collection("commands").doc(envelope.commandId!);

  return observeApiRequest("archiveKnownProperty", envelope.requestId, async () => {
    await firestore.runTransaction(async (transaction) => {
      const [receipt, snapshot] = await Promise.all([transaction.get(commandRef), transaction.get(reference)]);
      if (receipt.exists) return;
      const data = snapshot.data();
      if (!snapshot.exists || !data || !canManage(data, claims) || data.deletedAt !== null) throw new HttpsError("not-found", "Mülk bulunamadı.");
      // A property carrying a mandate is inventory, and removing it here would
      // leave the listing pointing at nothing. That removal belongs on the
      // portfolio screen, where the mandate itself can be closed.
      const listings = await transaction.get(firestore.collection("listings").where("officeId", "==", claims.officeId).where("propertyId", "==", propertyId).limit(1));
      if (listings.docs.some((item) => item.data().deletedAt === null)) {
        throw new HttpsError("failed-precondition", "Bu mülkün yetkili portföyü var. Önce portföy ekranından kaldır.");
      }
      const now = Timestamp.now();
      transaction.update(reference, { deletedAt: now, updatedAt: now });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "archiveKnownProperty", propertyId, createdAt: now });
    });
    return { propertyId };
  });
});
