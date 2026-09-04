import { ApiError, classifyInboxText, createCommandId, type AnalyzeInboxItemInput, type CreateInboxItemInput, type InboxItemAnalysis, type InboxItemRecord, type ProcessInboxItemInput, type UpdateInboxItemInput } from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";

const queueKey = "spherepath.web-inbox-queue.v1";
interface QueuedInboxItem { commandId: string; ownerUid: string; input: CreateInboxItemInput; local: InboxItemRecord }
function readQueue(): QueuedInboxItem[] { if (typeof window === "undefined") return []; try { return JSON.parse(window.localStorage.getItem(queueKey) ?? "[]") as QueuedInboxItem[]; } catch { return []; } }
function writeQueue(items: QueuedInboxItem[]) { window.localStorage.setItem(queueKey, JSON.stringify(items)); window.dispatchEvent(new Event("spherepath-offline-queue")); }
const isOnline = () => typeof navigator === "undefined" || navigator.onLine;
const networkFailure = (error: unknown) => !isOnline() || (error instanceof ApiError && error.category === "network");

function localRecord(session: WorkspaceSession, input: CreateInboxItemInput, commandId: string): InboxItemRecord {
  const result = classifyInboxText(input.text, input.requestedKind ?? null); const now = Date.now();
  return { id: `queued-${commandId}`, officeId: session.officeId, ownerUid: session.uid, source: input.source, safeText: result.safeText, summary: result.summary, kind: result.kind, status: "queued", confidence: result.confidence, linkedContactId: input.linkedContactId ?? null, sourceEntityId: null, appliedActions: [], pinned: false, needsLocation: result.needsLocation, errorCode: null, archivedAt: null, analysis: null, analysisStatus: "pending", createdAt: now, updatedAt: now };
}

export async function listInboxItems(session?: WorkspaceSession): Promise<InboxItemRecord[]> {
  const local = session ? readQueue().filter((item) => item.ownerUid === session.uid).map((item) => item.local) : [];
  if (!isOnline()) return local;
  const remote = (await apiClient.query<{ cursor: null; limit: number }, { items: InboxItemRecord[] }>("listInboxItems", { cursor: null, limit: 50 })).items;
  return [...local, ...remote];
}
export async function createInboxNote(session: WorkspaceSession, text: string): Promise<InboxItemRecord> {
  const input: CreateInboxItemInput = { source: "typed", text, linkedContactId: null, requestedKind: null };
  const commandId = createCommandId(session.uid); const local = localRecord(session, input, commandId);
  if (isOnline()) {
    try {
      return (await apiClient.command<CreateInboxItemInput, { item: InboxItemRecord }>("createInboxItem", input, commandId)).item;
    } catch (error) {
      if (!networkFailure(error)) throw error;
    }
  }
  writeQueue([...readQueue().filter((item) => item.commandId !== commandId), { commandId, ownerUid: session.uid, input, local }]);
  return local;
}
export async function flushInboxQueue(session: WorkspaceSession): Promise<number> {
  if (!isOnline()) return inboxQueueCount(session.uid); const remaining: QueuedInboxItem[] = [];
  for (const item of readQueue()) { if (item.ownerUid !== session.uid) { remaining.push(item); continue; } try { await apiClient.command<CreateInboxItemInput, { item: InboxItemRecord }>("createInboxItem", item.input, item.commandId); } catch { remaining.push(item); } }
  writeQueue(remaining); return remaining.filter((item) => item.ownerUid === session.uid).length;
}
export function inboxQueueCount(ownerUid?: string): number { const queue = readQueue(); return ownerUid ? queue.filter((item) => item.ownerUid === ownerUid).length : queue.length; }
export async function changeInboxItem(session: WorkspaceSession, input: UpdateInboxItemInput): Promise<InboxItemRecord> {
  return (await apiClient.command<UpdateInboxItemInput, { item: InboxItemRecord }>("updateInboxItem", input, createCommandId(session.uid))).item;
}
export async function processInboxItem(session: WorkspaceSession, input: ProcessInboxItemInput): Promise<{ item: InboxItemRecord; entityId: string }> {
  return apiClient.command<ProcessInboxItemInput, { item: InboxItemRecord; entityId: string }>("processInboxItem", input, createCommandId(session.uid));
}
export async function analyzeInboxItem(input: AnalyzeInboxItemInput): Promise<InboxItemAnalysis> {
  return (await apiClient.query<AnalyzeInboxItemInput, { analysis: InboxItemAnalysis }>("analyzeInboxItem", input)).analysis;
}
export async function undoInboxItem(session: WorkspaceSession, inboxItemId: string): Promise<InboxItemRecord> {
  return (await apiClient.command<{ inboxItemId: string }, { item: InboxItemRecord }>("undoInboxApplication", { inboxItemId }, createCommandId(session.uid))).item;
}
export async function retryInboxItem(session: WorkspaceSession, inboxItemId: string): Promise<InboxItemRecord> {
  return (await apiClient.command<{ inboxItemId: string }, { item: InboxItemRecord }>("retryInboxItem", { inboxItemId }, createCommandId(session.uid))).item;
}
