import { createCommandId, type ManualInteractionDraft } from "@spherepath/shared";
import { apiClient } from "@/shared/api/client";
import type { WorkspaceSession } from "@/features/auth/resources/session";

export async function saveManualInteraction(
  session: WorkspaceSession,
  interaction: ManualInteractionDraft,
) {
  const response = await apiClient.command<ManualInteractionDraft, { interactionId: string }>(
    "recordInteraction", interaction, createCommandId(session.uid),
  );
  return response.interactionId;
}
