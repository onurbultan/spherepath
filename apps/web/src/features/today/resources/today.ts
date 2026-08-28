import { createCommandId, type DailyTaskOutcome, type TodayOverview } from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";

export async function loadTodayOverview(): Promise<TodayOverview> {
  return (await apiClient.query<undefined, { overview: TodayOverview }>("getTodayOverview", undefined)).overview;
}
export async function finishDailyTask(session: WorkspaceSession, outcome: DailyTaskOutcome): Promise<void> { await apiClient.command<DailyTaskOutcome, { taskId: string }>("completeDailyTask", outcome, createCommandId(session.uid)); }
