import { createCommandId, type CallRecordView, type Contact, type ContactDraft, type ContactPrivacyDraft, type Interaction } from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";

export interface ContactRecord extends Contact {
  id: string;
}

export async function listContacts(): Promise<ContactRecord[]> {
  return (await apiClient.query<undefined, { contacts: ContactRecord[] }>("listContacts", undefined)).contacts;
}

export interface ContactInteractionRecord extends Interaction {
  id: string;
}

export async function listContactInteractions(contactId: string): Promise<ContactInteractionRecord[]> {
  return (await apiClient.query<{ contactId: string }, { interactions: ContactInteractionRecord[] }>(
    "listContactInteractions", { contactId },
  )).interactions;
}

export async function listContactCalls(contactId: string): Promise<CallRecordView[]> {
  return (await apiClient.query<{ contactId: string }, { calls: CallRecordView[] }>(
    "listCalls", { contactId },
  )).calls;
}

export async function startContactCall(session: WorkspaceSession, contactId: string): Promise<string> {
  return (await apiClient.command<{ contactId: string }, { providerCallId: string }>(
    "startContactCall", { contactId }, createCommandId(session.uid),
  )).providerCallId;
}

export async function saveContact(
  _session: WorkspaceSession,
  draft: ContactDraft,
  existing?: ContactRecord,
): Promise<void> {
  if (existing) {
    await apiClient.command<{ contactId: string; draft: ContactDraft }, { contact: ContactRecord }>(
      "updateContact", { contactId: existing.id, draft }, createCommandId(_session.uid),
    );
    return;
  }

  await apiClient.command<ContactDraft, { contact: ContactRecord }>(
    "createContact", draft, createCommandId(_session.uid),
  );
}

export async function archiveContact(session: WorkspaceSession, contactId: string): Promise<void> {
  await apiClient.command<{ contactId: string }, { contactId: string }>(
    "archiveContact", { contactId }, createCommandId(session.uid),
  );
}

export async function saveContactPrivacy(session: WorkspaceSession, draft: ContactPrivacyDraft): Promise<ContactRecord> {
  return (await apiClient.command<ContactPrivacyDraft, { contact: ContactRecord }>("updateContactPrivacy", draft, createCommandId(session.uid))).contact;
}
