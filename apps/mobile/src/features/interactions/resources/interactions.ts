import {
  createCommandId,
  type ConfirmVoiceNoteInput,
  type ManualInteractionDraft,
  type RegisterVoiceNoteInput,
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

export async function confirmVoiceNote(
  session: WorkspaceSession,
  voiceNoteId: string,
  interaction: ManualInteractionDraft,
): Promise<string> {
  const input: ConfirmVoiceNoteInput = { voiceNoteId, interaction };
  const response = await apiClient.command<ConfirmVoiceNoteInput, { interactionId: string }>(
    "confirmVoiceNote", input, createCommandId(session.uid),
  );
  return response.interactionId;
}
