import { contactPhoneFields } from "./phone-index.js";
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
/**
 * Every path that writes a contact goes through here, and the lookup key is
 * derived here rather than by each caller: three of the four writers remembered
 * it and the note-to-contact path did not, so a contact created from a note
 * could be dialled but an incoming call from them matched nobody.
 */
export function toStoredContact(contact: Contact) {
  return {
    ...contact,
    ...contactPhoneFields(contact.phone),
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
