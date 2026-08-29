import {
  createCommandId,
  type ConfirmVoiceNoteInput,
  type DiscardVoiceNoteInput,
  type ManualInteractionDraft,
  type OpportunityDraft,
  type RegisterVoiceNoteInput,
  type VoiceInsights,
  type VoiceNoteView,
} from "@spherepath/shared";
import { putFile, ref } from "@react-native-firebase/storage";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";
import { firebaseServices } from "@/shared/firebase/client";

export async function saveManualInteraction(
  session: WorkspaceSession,
  interaction: ManualInteractionDraft,
): Promise<string> {
  const response = await apiClient.command<ManualInteractionDraft, { interactionId: string }>(
    "recordInteraction", interaction, createCommandId(session.uid),
  );
  return response.interactionId;
}

export async function uploadAndRegisterVoiceNote(
  session: WorkspaceSession,
  contactId: string,
  localUri: string,
  durationMs: number,
): Promise<string> {
  const commandId = createCommandId(session.uid);
  const fileId = commandId.replace(/[^A-Za-z0-9_-]/gu, "-");
  const storagePath = `offices/${session.officeId}/voice/${session.uid}/${fileId}.m4a`;
  await putFile(ref(firebaseServices().storage, storagePath), localUri, {
    contentType: "audio/m4a",
    customMetadata: { contactId, durationMs: String(durationMs) },
  });
  const input: RegisterVoiceNoteInput = {
    contactId,
    storagePath,
    durationMs,
    mimeType: "audio/m4a",
    conversationEndedConfirmed: true,
  };
  const response = await apiClient.command<RegisterVoiceNoteInput, { voiceNoteId: string }>("registerVoiceNote", input, commandId);
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

export async function confirmVoiceNote(
  session: WorkspaceSession,
  voiceNoteId: string,
  interaction: ManualInteractionDraft,
  approvedInsights: VoiceInsights,
  opportunity: Omit<OpportunityDraft, "subjectContactId"> | null,
): Promise<{ interactionId: string; opportunityId: string | null }> {
  const input: ConfirmVoiceNoteInput = { voiceNoteId, interaction, approvedInsights, opportunity };
  return apiClient.command<ConfirmVoiceNoteInput, { interactionId: string; opportunityId: string | null }>(
    "confirmVoiceNote", input, createCommandId(session.uid),
  );
}

export async function discardVoiceNote(session: WorkspaceSession, voiceNoteId: string): Promise<void> {
  const input: DiscardVoiceNoteInput = { voiceNoteId };
  await apiClient.command<DiscardVoiceNoteInput, { voiceNoteId: string }>(
    "discardVoiceNote", input, createCommandId(session.uid),
  );
}
