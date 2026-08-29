import { createCommandId, type Contact, type ContactDraft, type ContactPrivacyDraft, type Interaction } from "@spherepath/shared";
import { apiClient } from "@/shared/api/client";
import type { WorkspaceSession } from "@/features/auth/resources/session";

export interface ContactRecord extends Contact {
  id: string;
}

export interface ContactInteractionRecord extends Interaction {
  id: string;
}

export async function listContacts(): Promise<ContactRecord[]> {
  return (await apiClient.query<undefined, { contacts: ContactRecord[] }>("listContacts", undefined)).contacts;
}

export async function listContactInteractions(contactId: string): Promise<ContactInteractionRecord[]> {
  return (await apiClient.query<{ contactId: string }, { interactions: ContactInteractionRecord[] }>(
    "listContactInteractions", { contactId },
  )).interactions;
}

export async function saveContact(
  _session: WorkspaceSession,
  draft: ContactDraft,
  existing?: ContactRecord,
): Promise<ContactRecord> {
  if (existing) {
    return (await apiClient.command<{ contactId: string; draft: ContactDraft }, { contact: ContactRecord }>(
      "updateContact", { contactId: existing.id, draft }, createCommandId(_session.uid),
    )).contact;
  }

  return (await apiClient.command<ContactDraft, { contact: ContactRecord }>(
    "createContact", draft, createCommandId(_session.uid),
  )).contact;
}

export async function archiveContact(session: WorkspaceSession, contactId: string): Promise<void> {
  await apiClient.command<{ contactId: string }, { contactId: string }>(
    "archiveContact", { contactId }, createCommandId(session.uid),
  );
}

export async function saveContactPrivacy(session: WorkspaceSession, draft: ContactPrivacyDraft): Promise<ContactRecord> {
  return (await apiClient.command<ContactPrivacyDraft, { contact: ContactRecord }>("updateContactPrivacy", draft, createCommandId(session.uid))).contact;
}
