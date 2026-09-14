import { createCommandId, type Contact, type ContactDraft, type ContactPrivacyDraft, type ContactMemoryNotesInput, type ContributionRecord, type KnownPropertyDraft, type KnownPropertyRecord, type Interaction, type InteractionEdit } from "@spherepath/shared";
import { apiClient } from "@/shared/api/client";
import type { WorkspaceSession } from "@/features/auth/resources/session";

export interface ContactRecord extends Contact {
  nextActionSummary?: import("@spherepath/shared").ContactNextStep | null;
  id: string;
}

export interface ContactInteractionRecord extends Interaction {
  id: string;
}

export interface ContactTaskOutcomeRecord {
  id: string;
  taskId: string;
  status: "completed" | "skipped" | "rescheduled" | "contact_opt_out";
  note: string | null;
  rescheduledAt: number | null;
  resolvedAt: number;
}

export async function listContacts(): Promise<ContactRecord[]> {
  const contacts: ContactRecord[] = [];
  let cursor: string | null = null;
  do {
    const page: { contacts: ContactRecord[]; nextCursor?: string | null } = await apiClient.query<{ cursor?: string }, { contacts: ContactRecord[]; nextCursor?: string | null }>("listContacts", cursor ? { cursor } : {});
    contacts.push(...page.contacts);
    cursor = page.nextCursor ?? null;
  } while (cursor);
  return contacts.sort((left, right) => right.createdAt - left.createdAt);
}

export async function listContactInteractions(contactId: string): Promise<{ interactions: ContactInteractionRecord[]; taskOutcomes: ContactTaskOutcomeRecord[] }> {
  return apiClient.query<{ contactId: string }, { interactions: ContactInteractionRecord[]; taskOutcomes: ContactTaskOutcomeRecord[] }>(
    "listContactInteractions", { contactId },
  );
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

export async function updateContactInteraction(session: WorkspaceSession, edit: InteractionEdit): Promise<void> {
  await apiClient.command<InteractionEdit, { interactionId: string }>(
    "updateInteraction", edit, createCommandId(session.uid),
  );
}

export async function saveContactMemory(session: WorkspaceSession, input: ContactMemoryNotesInput): Promise<ContactRecord> {
  return (await apiClient.command<ContactMemoryNotesInput, { contact: ContactRecord }>(
    "updateContactMemory", input, createCommandId(session.uid),
  )).contact;
}

export async function listKnownProperties(contactId: string): Promise<KnownPropertyRecord[]> {
  return (await apiClient.query<{ contactId: string }, { properties: KnownPropertyRecord[] }>(
    "listKnownProperties", { contactId },
  )).properties;
}

export async function saveKnownProperty(session: WorkspaceSession, draft: KnownPropertyDraft): Promise<KnownPropertyRecord> {
  return (await apiClient.command<KnownPropertyDraft, { property: KnownPropertyRecord }>(
    "saveKnownProperty", draft, createCommandId(session.uid),
  )).property;
}

export async function archiveKnownProperty(session: WorkspaceSession, propertyId: string): Promise<void> {
  await apiClient.command<{ propertyId: string }, { propertyId: string }>(
    "archiveKnownProperty", { propertyId }, createCommandId(session.uid),
  );
}

export async function listContributions(contactId: string): Promise<ContributionRecord[]> {
  return (await apiClient.query<{ contactId: string }, { contributions: ContributionRecord[] }>(
    "listContributions", { contactId },
  )).contributions;
}
