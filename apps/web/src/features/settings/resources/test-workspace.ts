import { createCommandId, type TestWorkspaceResetPreview } from "@spherepath/shared";
import { apiClient } from "@/shared/api/client";
import type { WorkspaceSession } from "@/features/auth/resources/session";
export function previewTestWorkspaceReset(): Promise<TestWorkspaceResetPreview> { return apiClient.query("previewTestWorkspaceReset", undefined); }
export function resetTestWorkspace(session: WorkspaceSession, snapshotToken: string): Promise<{ deletedCount: number }> { return apiClient.command("resetTestWorkspace", { snapshotToken }, createCommandId(session.uid)); }
