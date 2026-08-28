import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  contactDraftSchema,
  createContact as createContactEntity,
  type Contact,
  type ContactDraft,
} from "../../../packages/shared/src/index";
import { requireSpherepathClaims, type SpherepathClaims } from "../auth/claims.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";

interface ContactRecord extends Contact {
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
    privacy: {
      ...(privacy as Contact["privacy"]),
      noticeAt: millis(privacy.noticeAt),
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
    privacy: {
      ...contact.privacy,
      noticeAt: timestamp(contact.privacy.noticeAt),
      deletionRequestedAt: timestamp(contact.privacy.deletionRequestedAt),
    },
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
