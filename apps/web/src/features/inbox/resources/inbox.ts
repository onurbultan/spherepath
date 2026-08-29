import { createCommandId, type CreateInboxItemInput, type InboxItemRecord, type UpdateInboxItemInput } from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";

export async function listInboxItems(): Promise<InboxItemRecord[]> {
  return (await apiClient.query<{ cursor: null; limit: number }, { items: InboxItemRecord[] }>("listInboxItems", { cursor: null, limit: 50 })).items;
}
export async function createInboxNote(session: WorkspaceSession, text: string): Promise<InboxItemRecord> {
  const input: CreateInboxItemInput = { source: "typed", text, linkedContactId: null, requestedKind: null };
  return (await apiClient.command<CreateInboxItemInput, { item: InboxItemRecord }>("createInboxItem", input, createCommandId(session.uid))).item;
}
export async function changeInboxItem(session: WorkspaceSession, input: UpdateInboxItemInput): Promise<InboxItemRecord> {
  return (await apiClient.command<UpdateInboxItemInput, { item: InboxItemRecord }>("updateInboxItem", input, createCommandId(session.uid))).item;
}
export async function undoInboxItem(session: WorkspaceSession, inboxItemId: string): Promise<InboxItemRecord> {
  return (await apiClient.command<{ inboxItemId: string }, { item: InboxItemRecord }>("undoInboxApplication", { inboxItemId }, createCommandId(session.uid))).item;
}
