import { createCommandId, type ManualInteractionDraft } from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";

export async function saveManualInteraction(
  session: WorkspaceSession,
  interaction: ManualInteractionDraft,
): Promise<string> {
  const response = await apiClient.command<ManualInteractionDraft, { interactionId: string }>(
    "recordInteraction", interaction, createCommandId(session.uid),
  );
  return response.interactionId;
}
