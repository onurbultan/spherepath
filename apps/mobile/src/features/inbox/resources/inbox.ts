import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { ApiError, classifyInboxText, createCommandId, type AnalyzeInboxItemInput, type CreateInboxItemInput, type InboxItemAnalysis, type InboxItemRecord, type ProcessInboxItemInput, type UpdateInboxItemInput } from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";

const queueKey = "spherepath.inbox-queue.v1";
interface QueuedInboxItem { commandId: string; ownerUid: string; input: CreateInboxItemInput; local: InboxItemRecord }
async function readQueue(): Promise<QueuedInboxItem[]> { try { return JSON.parse((await AsyncStorage.getItem(queueKey)) ?? "[]") as QueuedInboxItem[]; } catch { return []; } }
async function writeQueue(items: QueuedInboxItem[]) { await AsyncStorage.setItem(queueKey, JSON.stringify(items)); }
const isOnline = async () => { const state = await NetInfo.fetch(); return state.isConnected !== false && state.isInternetReachable !== false; };
const networkFailure = (error: unknown) => error instanceof ApiError && error.category === "network";

function localRecord(session: WorkspaceSession, input: CreateInboxItemInput, commandId: string): InboxItemRecord {
  const result = classifyInboxText(input.text, input.requestedKind ?? null); const now = Date.now();
  return { id: `queued-${commandId}`, officeId: session.officeId, ownerUid: session.uid, source: input.source, safeText: result.safeText, summary: result.summary, kind: result.kind, status: "queued", confidence: result.confidence, linkedContactId: input.linkedContactId ?? null, sourceEntityId: null, appliedActions: [], pinned: false, needsLocation: result.needsLocation, errorCode: null, archivedAt: null, createdAt: now, updatedAt: now };
}

export async function listInboxItems(session?: WorkspaceSession): Promise<InboxItemRecord[]> {
  const local = session ? (await readQueue()).filter((item) => item.ownerUid === session.uid).map((item) => item.local) : [];
  if (!(await isOnline())) return local;
  const response = await apiClient.query<{ cursor: null; limit: number }, { items: InboxItemRecord[] }>("listInboxItems", { cursor: null, limit: 50 });
  return [...local, ...response.items];
}

export async function createInboxNote(session: WorkspaceSession, text: string, source: "typed" | "whatsapp" = "typed"): Promise<InboxItemRecord> {
  const input: CreateInboxItemInput = { source, text, linkedContactId: null, requestedKind: null };
  const commandId = createCommandId(session.uid); const local = localRecord(session, input, commandId);
  const queue = await readQueue(); await writeQueue([...queue, { commandId, ownerUid: session.uid, input, local }]);
  if (await isOnline()) {
    void apiClient.command<CreateInboxItemInput, { item: InboxItemRecord }>("createInboxItem", input, commandId)
      .then(async () => writeQueue((await readQueue()).filter((item) => item.commandId !== commandId)))
      .catch(async (error: unknown) => {
        if (networkFailure(error)) return;
        const current = await readQueue();
        await writeQueue(current.map((item) => item.commandId === commandId
          ? { ...item, local: { ...item.local, status: "failed", errorCode: "sync_failed", updatedAt: Date.now() } }
          : item));
      });
  }
  return local;
}

export async function flushInboxQueue(session: WorkspaceSession): Promise<number> {
  if (!(await isOnline())) return inboxQueueCount(session.uid);
  const queue = await readQueue(); const remaining: QueuedInboxItem[] = [];
  for (const item of queue) {
    if (item.ownerUid !== session.uid) { remaining.push(item); continue; }
    try { await apiClient.command<CreateInboxItemInput, { item: InboxItemRecord }>("createInboxItem", item.input, item.commandId); } catch { remaining.push(item); }
  }
  await writeQueue(remaining); return remaining.filter((item) => item.ownerUid === session.uid).length;
}
export async function inboxQueueCount(ownerUid?: string): Promise<number> { const queue = await readQueue(); return ownerUid ? queue.filter((item) => item.ownerUid === ownerUid).length : queue.length; }

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
