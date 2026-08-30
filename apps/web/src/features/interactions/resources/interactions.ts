import {
  createCommandId,
  type ConfirmVoiceNoteInput,
  type DiscardVoiceNoteInput,
  type ManualInteractionDraft,
  type OpportunityDraft,
  type RegisterInteractionTextInput,
  type RetryVoiceNoteProcessingInput,
  type RegisterVoiceTextTestInput,
  type VoiceInsights,
  type VoiceNoteView,
} from "@spherepath/shared";
import { apiClient } from "@/shared/api/client";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { saveOrQueueInteraction, saveOrQueueVoice } from "./captureQueue";

export async function saveManualInteraction(
  session: WorkspaceSession,
  interaction: ManualInteractionDraft,
) {
  return saveOrQueueInteraction(session, interaction);
}

export async function uploadAndRegisterVoiceNote(
  session: WorkspaceSession,
  contactId: string,
  audio: Blob,
  durationMs: number,
): Promise<string | null> {
  return saveOrQueueVoice(session, contactId, audio, durationMs);
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

export async function submitVoiceTextTest(
  session: WorkspaceSession,
  contactId: string,
  transcript: string,
): Promise<string> {
  const input: RegisterVoiceTextTestInput = { contactId, transcript };
  const response = await apiClient.command<RegisterVoiceTextTestInput, { voiceNoteId: string }>(
    "registerVoiceTextTest", input, createCommandId(session.uid),
  );
  return response.voiceNoteId;
}

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

export async function confirmVoiceNote(
  session: WorkspaceSession,
  voiceNoteId: string,
  interaction: ManualInteractionDraft,
  approvedInsights: VoiceInsights,
  opportunities: Array<Omit<OpportunityDraft, "subjectContactId">>,
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
