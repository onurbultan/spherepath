import {
  createCommandId,
  type ConfirmVoiceNoteInput,
  type DiscardVoiceNoteInput,
  type ManualInteractionDraft,
  type OpportunityDraft,
  type RegisterInteractionTextInput,
  type RegisterVoiceNoteInput,
  type RegisterVoiceTextTestInput,
  type VoiceInsights,
  type VoiceNoteView,
} from "@spherepath/shared";
import { ref, uploadBytes } from "firebase/storage";
import { apiClient } from "@/shared/api/client";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { firebaseServices } from "@/shared/firebase/client";

export async function saveManualInteraction(
  session: WorkspaceSession,
  interaction: ManualInteractionDraft,
) {
  const response = await apiClient.command<ManualInteractionDraft, { interactionId: string }>(
    "recordInteraction", interaction, createCommandId(session.uid),
  );
  return response.interactionId;
}

export async function uploadAndRegisterVoiceNote(
  session: WorkspaceSession,
  contactId: string,
  audio: Blob,
  durationMs: number,
): Promise<string> {
  const commandId = createCommandId(session.uid);
  const mimeType = audio.type.split(";")[0] || "audio/webm";
  const extension = mimeType === "audio/mp4" || mimeType === "audio/m4a" ? "m4a" : mimeType.includes("wav") ? "wav" : "webm";
  const fileId = commandId.replace(/[^A-Za-z0-9_-]/gu, "-");
  const storagePath = `offices/${session.officeId}/voice/${session.uid}/${fileId}.${extension}`;
  await uploadBytes(ref(firebaseServices().storage, storagePath), audio, {
    contentType: mimeType,
    customMetadata: { contactId, durationMs: String(durationMs) },
  });
  const input: RegisterVoiceNoteInput = {
    contactId,
    storagePath,
    durationMs,
    mimeType: mimeType as RegisterVoiceNoteInput["mimeType"],
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
