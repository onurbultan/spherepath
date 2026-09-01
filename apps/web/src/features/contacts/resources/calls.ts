import { createCommandId, type CallRecordView } from "@spherepath/shared";
import { apiClient } from "@/shared/api/client";
import type { WorkspaceSession } from "@/features/auth/resources/session";

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
