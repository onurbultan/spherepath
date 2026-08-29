import { createCommandId, type DailyTaskOutcome, type ReplaceDailyPlanItemInput, type ReportingPeriod, type TodayOverview } from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";

export async function loadTodayOverview(period: ReportingPeriod = "30d"): Promise<TodayOverview> {
  return (await apiClient.query<{ period: ReportingPeriod }, { overview: TodayOverview }>("getTodayOverview", { period })).overview;
}
export async function finishDailyTask(session: WorkspaceSession, outcome: DailyTaskOutcome): Promise<void> { await apiClient.command<DailyTaskOutcome, { taskId: string }>("completeDailyTask", outcome, createCommandId(session.uid)); }
export async function replaceDailyTask(session: WorkspaceSession, taskId: string): Promise<void> { const input: ReplaceDailyPlanItemInput = { taskId }; await apiClient.command<ReplaceDailyPlanItemInput, { taskIds: string[] }>("replaceDailyPlanItem", input, createCommandId(session.uid)); }
