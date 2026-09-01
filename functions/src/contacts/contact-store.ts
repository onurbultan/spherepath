import { Timestamp } from "firebase-admin/firestore";
import type { Contact } from "../../../packages/shared/src/index";

function timestamp(value: number | null): Timestamp | null {
  return value === null ? null : Timestamp.fromMillis(value);
}

/**
 * The domain model carries instants as numbers; Firestore stores them as
 * timestamps. Every writer of a contact goes through here so a record created by
 * the switch is indistinguishable from one an advisor typed.
 */
export function toStoredContact(contact: Contact) {
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
      purposes: Object.fromEntries(
        Object.entries(contact.privacy.purposes).map(([key, purpose]) => [key, { ...purpose, startedAt: Timestamp.fromMillis(purpose.startedAt) }]),
      ),
      noticeAt: timestamp(contact.privacy.noticeAt),
      marketingConsentAt: timestamp(contact.privacy.marketingConsentAt),
      marketingWithdrawnAt: timestamp(contact.privacy.marketingWithdrawnAt),
      iysCheckedAt: timestamp(contact.privacy.iysCheckedAt),
      deletionRequestedAt: timestamp(contact.privacy.deletionRequestedAt),
    },
  };
}
