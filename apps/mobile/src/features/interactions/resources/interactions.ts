import {
  ApiError,
  createCommandId,
  type ConfirmVoiceNoteInput,
  type DiscardVoiceNoteInput,
  type ManualInteractionDraft,
  type OpportunityDraft,
  type RegisterInteractionTextInput,
  type RegisterVoiceNoteInput,
  type RetryVoiceNoteProcessingInput,
  type VoiceInsights,
  type VoiceNoteView,
} from "@spherepath/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { putFile, ref } from "@react-native-firebase/storage";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";
import { firebaseServices } from "@/shared/firebase/client";

const queueKey = "spherepath.capture-queue.v1";
type CaptureQueueItem = { id: string; ownerUid: string; kind: "interaction"; commandId: string; interaction: ManualInteractionDraft } | { id: string; ownerUid: string; kind: "voice"; commandId: string; contactId: string; localUri: string; durationMs: number };
async function readQueue(): Promise<CaptureQueueItem[]> { try { return JSON.parse((await AsyncStorage.getItem(queueKey)) ?? "[]") as CaptureQueueItem[]; } catch { return []; } }
async function writeQueue(items: CaptureQueueItem[]) { await AsyncStorage.setItem(queueKey, JSON.stringify(items)); }
async function enqueue(item: CaptureQueueItem) { const items = await readQueue(); if (!items.some((queued) => queued.id === item.id)) await writeQueue([...items, item]); }
async function online(): Promise<boolean> { const state = await NetInfo.fetch(); return state.isConnected !== false && state.isInternetReachable !== false; }
const networkFailure = (error: unknown) => error instanceof ApiError && error.category === "network";

async function sendVoice(session: WorkspaceSession, contactId: string, localUri: string, durationMs: number, commandId: string): Promise<string> {
  const fileId = commandId.replace(/[^A-Za-z0-9_-]/gu, "-");
  const storagePath = `offices/${session.officeId}/voice/${session.uid}/${fileId}.m4a`;
  await putFile(ref(firebaseServices().storage, storagePath), localUri, { contentType: "audio/m4a", customMetadata: { contactId, durationMs: String(durationMs) } });
  const input: RegisterVoiceNoteInput = { contactId, storagePath, durationMs, mimeType: "audio/m4a", conversationEndedConfirmed: true };
  return (await apiClient.command<RegisterVoiceNoteInput, { voiceNoteId: string }>("registerVoiceNote", input, commandId)).voiceNoteId;
}

export async function captureQueueCount(ownerUid?: string): Promise<number> { const items = await readQueue(); return ownerUid ? items.filter((item) => item.ownerUid === ownerUid).length : items.length; }
export async function flushCaptureQueue(session: WorkspaceSession): Promise<number> {
  if (!(await online())) return captureQueueCount(session.uid);
  const items = await readQueue(); const remaining: CaptureQueueItem[] = [];
  for (const item of items) {
    if (item.ownerUid !== session.uid) { remaining.push(item); continue; }
    try {
      if (item.kind === "interaction") await apiClient.command<ManualInteractionDraft, { interactionId: string }>("recordInteraction", item.interaction, item.commandId);
      else await sendVoice(session, item.contactId, item.localUri, item.durationMs, item.commandId);
    } catch { remaining.push(item); }
  }
  await writeQueue(remaining); return remaining.filter((item) => item.ownerUid === session.uid).length;
}

export async function saveManualInteraction(
  session: WorkspaceSession,
  interaction: ManualInteractionDraft,
): Promise<string> {
  const commandId = createCommandId(session.uid);
  if (!(await online())) { await enqueue({ id: commandId, ownerUid: session.uid, kind: "interaction", commandId, interaction }); return `queued-${commandId}`; }
  try { return (await apiClient.command<ManualInteractionDraft, { interactionId: string }>("recordInteraction", interaction, commandId)).interactionId; }
  catch (error) { if (!networkFailure(error)) throw error; await enqueue({ id: commandId, ownerUid: session.uid, kind: "interaction", commandId, interaction }); return `queued-${commandId}`; }
}

export async function uploadAndRegisterVoiceNote(
  session: WorkspaceSession,
  contactId: string,
  localUri: string,
  durationMs: number,
): Promise<string | null> {
  const commandId = createCommandId(session.uid);
  if (!(await online())) { await enqueue({ id: commandId, ownerUid: session.uid, kind: "voice", commandId, contactId, localUri, durationMs }); return null; }
  try { return await sendVoice(session, contactId, localUri, durationMs, commandId); }
  catch (error) { if (!networkFailure(error)) throw error; await enqueue({ id: commandId, ownerUid: session.uid, kind: "voice", commandId, contactId, localUri, durationMs }); return null; }
}

/**
 * A note typed rather than spoken. It runs the same masking, extraction and
 * review path as a recording, so an advisor who cannot talk -- in a meeting, in
 * noise -- is not shut out of the feature entirely.
 */
export async function submitInteractionText(
  session: WorkspaceSession,
  contactId: string,
  transcript: string,
): Promise<string> {
  const input: RegisterInteractionTextInput = { contactId, transcript };
  const response = await apiClient.command<RegisterInteractionTextInput, { voiceNoteId: string }>(
    "registerInteractionText", input, createCommandId(session.uid),
  );
  return response.voiceNoteId;
}

export async function getVoiceNote(voiceNoteId: string): Promise<VoiceNoteView> {
  const response = await apiClient.query<{ voiceNoteId: string }, { voiceNote: VoiceNoteView }>("getVoiceNote", { voiceNoteId });
  return response.voiceNote;
}

export async function getLatestReviewableVoiceNote(): Promise<VoiceNoteView | null> {
  const response = await apiClient.query<undefined, { voiceNote: VoiceNoteView | null }>("getLatestReviewableVoiceNote", undefined);
  return response.voiceNote;
}

export async function retryVoiceNoteProcessing(session: WorkspaceSession, voiceNoteId: string): Promise<void> {
  const input: RetryVoiceNoteProcessingInput = { voiceNoteId };
  await apiClient.command<RetryVoiceNoteProcessingInput, { voiceNoteId: string }>(
    "retryVoiceNoteProcessing", input, createCommandId(session.uid),
  );
}

export async function confirmVoiceNote(
  session: WorkspaceSession,
  voiceNoteId: string,
  interaction: ManualInteractionDraft,
  approvedInsights: VoiceInsights,
  opportunities: Omit<OpportunityDraft, "subjectContactId">[],
): Promise<{ interactionId: string; opportunityId: string | null; opportunityIds: string[] }> {
  const input: ConfirmVoiceNoteInput = { voiceNoteId, interaction, approvedInsights, opportunity: null, opportunities };
  return apiClient.command<ConfirmVoiceNoteInput, { interactionId: string; opportunityId: string | null; opportunityIds: string[] }>(
    "confirmVoiceNote", input, createCommandId(session.uid),
  );
}

export async function discardVoiceNote(session: WorkspaceSession, voiceNoteId: string): Promise<void> {
  const input: DiscardVoiceNoteInput = { voiceNoteId };
  await apiClient.command<DiscardVoiceNoteInput, { voiceNoteId: string }>(
    "discardVoiceNote", input, createCommandId(session.uid),
  );
}
