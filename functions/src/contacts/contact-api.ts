import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  contactDraftSchema,
  contactMemorySchema,
  contactPrivacyDraftSchema,
  createContact as createContactEntity,
  type Contact,
  type ContactDraft,
  type ContactPrivacyDraft,
  type Interaction,
} from "../../../packages/shared/src/index";
import { requireSpherepathClaims, type SpherepathClaims } from "../auth/claims.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";

interface ContactRecord extends Contact {
  id: string;
}

interface ContactInteractionRecord extends Interaction {
  id: string;
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
    metAt: millis(data.metAt) ?? 0,
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

function toStoredContact(contact: Contact) {
  return {
    ...contact,
    metAt: timestamp(contact.metAt),
    createdAt: timestamp(contact.createdAt),
    updatedAt: timestamp(contact.updatedAt),
    deletedAt: timestamp(contact.deletedAt),
    relationship: {
      ...contact.relationship,
      lastTouchAt: timestamp(contact.relationship.lastTouchAt),
      nextActionAt: timestamp(contact.relationship.nextActionAt),
    },
    memory: {
      ...contact.memory,
      updatedAt: timestamp(contact.memory.updatedAt),
    },
    privacy: {
      ...contact.privacy,
      purposes: Object.fromEntries(Object.entries(contact.privacy.purposes).map(([key, purpose]) => [key, { ...purpose, startedAt: Timestamp.fromMillis(purpose.startedAt) }])),
      noticeAt: timestamp(contact.privacy.noticeAt),
      marketingConsentAt: timestamp(contact.privacy.marketingConsentAt),
      marketingWithdrawnAt: timestamp(contact.privacy.marketingWithdrawnAt),
      iysCheckedAt: timestamp(contact.privacy.iysCheckedAt),
      deletionRequestedAt: timestamp(contact.privacy.deletionRequestedAt),
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
  if (typeof value !== "string" || value.length < 1 || value.length > 160) {
    throw new HttpsError("invalid-argument", "contactId is invalid.");
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

export const listContacts = onCall(callableOptions(), async (request): Promise<{ contacts: ContactRecord[] }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<undefined>(request.data);
  return observeApiRequest("listContacts", envelope.requestId, async () => {
    const firestore = getFirestore();
    let contactsQuery: FirebaseFirestore.Query = firestore.collection("contacts")
      .where("officeId", "==", claims.officeId);
    if (claims.role !== "broker") contactsQuery = contactsQuery.where("ownerUid", "==", claims.uid);

    const snapshot = await contactsQuery.limit(100).get();
    const contacts = snapshot.docs
      .map((item) => toContactRecord(item.id, item.data()))
      .filter((contact) => contact.deletedAt === null)
      .sort((left, right) => right.createdAt - left.createdAt);
    return { contacts };
  });
});

export const listContactInteractions = onCall(callableOptions(), async (request): Promise<{ interactions: ContactInteractionRecord[] }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<{ contactId?: unknown }>(request.data);
  const contactId = parseContactId(envelope.data?.contactId);
  return observeApiRequest("listContactInteractions", envelope.requestId, async () => {
    const firestore = getFirestore();
    const contactSnapshot = await firestore.collection("contacts").doc(contactId).get();
    if (!contactSnapshot.exists || !canManage(contactSnapshot.data()!, claims) || contactSnapshot.data()!.deletedAt !== null) {
      throw new HttpsError("not-found", "Contact was not found.");
    }
    const snapshot = await firestore.collection("interactions").where("contactId", "==", contactId).limit(100).get();
    const interactions = snapshot.docs
      .filter((item) => canManage(item.data(), claims))
      .map((item) => toInteractionRecord(item.id, item.data()))
      .sort((left, right) => right.occurredAt - left.occurredAt);
    return { interactions };
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
    const contact = createContactEntity(draft, { officeId: claims.officeId, ownerUid: claims.uid }, now);
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
      phone: draft.phone || null,
      phoneHash: null,
      metAtPlace: draft.metAtPlace || null,
      source: draft.source,
      roles: [draft.role],
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
