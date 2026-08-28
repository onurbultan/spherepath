import { createContact, type Contact, type ContactDraft } from "@spherepath/shared";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
  type DocumentData,
} from "@react-native-firebase/firestore";
import { firebaseServices } from "@/shared/firebase/client";
import type { WorkspaceSession } from "@/features/auth/resources/session";

export interface ContactRecord extends Contact {
  id: string;
}

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function fromSnapshot(id: string, data: DocumentData): ContactRecord {
  const relationship = data.relationship as DocumentData;
  const privacy = data.privacy as Contact["privacy"];
  return {
    ...(data as Contact),
    id,
    metAt: millis(data.metAt) ?? Date.now(),
    createdAt: millis(data.createdAt) ?? Date.now(),
    updatedAt: millis(data.updatedAt) ?? Date.now(),
    deletedAt: millis(data.deletedAt),
    relationship: {
      ...(relationship as Contact["relationship"]),
      lastTouchAt: millis(relationship.lastTouchAt),
      nextActionAt: millis(relationship.nextActionAt),
    },
    privacy: {
      ...privacy,
      noticeAt: millis(privacy.noticeAt),
      deletionRequestedAt: millis(privacy.deletionRequestedAt),
    },
  };
}

function timestamp(value: number | null): Timestamp | null {
  return value === null ? null : Timestamp.fromMillis(value);
}

function firestoreContact(contact: Contact) {
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

export async function listContacts(session: WorkspaceSession): Promise<ContactRecord[]> {
  const snapshot = await getDocs(query(
    collection(firebaseServices().firestore, "contacts"),
    where("officeId", "==", session.officeId),
    where("ownerUid", "==", session.uid),
    limit(100),
  ));
  return snapshot.docs
    .map((item) => fromSnapshot(item.id, item.data()))
    .filter((contact) => contact.deletedAt === null)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function saveContact(session: WorkspaceSession, draft: ContactDraft, existing?: ContactRecord) {
  const firestore = firebaseServices().firestore;
  if (!existing) {
    const contact = createContact(draft, { officeId: session.officeId, ownerUid: session.uid }, Date.now());
    await addDoc(collection(firestore, "contacts"), firestoreContact(contact));
    return;
  }

  await updateDoc(doc(firestore, "contacts", existing.id), {
    fullName: draft.fullName.trim(),
    phone: draft.phone.trim() || null,
    phoneHash: null,
    metAtPlace: draft.metAtPlace.trim() || null,
    source: draft.source,
    roles: [draft.role],
    updatedAt: Timestamp.now(),
  });
}

export async function archiveContact(contactId: string) {
  const now = Timestamp.now();
  await updateDoc(doc(firebaseServices().firestore, "contacts", contactId), { deletedAt: now, updatedAt: now });
}
