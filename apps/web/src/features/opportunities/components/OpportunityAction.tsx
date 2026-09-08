"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { advisorWorkflowCopy, dailyTaskQueryKeys, nextActionTypeLabels, type DailyTaskOutcome, type TodayTask } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { TaskResolutionSheet } from "@/features/today/components/TaskResolutionSheet";
import { finishDailyTask } from "@/features/today/resources/today";
import type { OpportunityRecord } from "../resources/opportunities";
export function OpportunityAction({ opportunity, compact = false }: { opportunity: OpportunityRecord; compact?: boolean }) {
  const { session } = useSession(); const client = useQueryClient();
  const [open, setOpen] = useState(false); const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  if (!opportunity.nextActionType || opportunity.stage === "won" || opportunity.stage === "lost") return null;
  const task: TodayTask = { id: `opportunity-action-${opportunity.id}`, opportunityId: opportunity.id, contactId: opportunity.subjectContactId, title: opportunity.subjectContactName, reason: nextActionTypeLabels[opportunity.nextActionType], actionType: opportunity.nextActionType, dueAt: opportunity.nextActionAt, type: "next_action", priority: "bottleneck" };
  async function save(outcome: DailyTaskOutcome) {
    if (!session) return; setPending(true); setError(null);
    try { await finishDailyTask(session, outcome); await Promise.all(dailyTaskQueryKeys.map((queryKey) => client.invalidateQueries({ queryKey }))); setOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Aksiyon güncellenemedi."); } finally { setPending(false); }
  }
  return <><button className={compact ? "secondary-action compact-action" : "secondary-action"} aria-label={advisorWorkflowCopy.editAction} title={compact ? advisorWorkflowCopy.editAction : undefined} type="button" onClick={() => setOpen(true)}>{compact ? advisorWorkflowCopy.editActionShort : advisorWorkflowCopy.editAction}</button>{open ? <TaskResolutionSheet initialStatus="rescheduled" task={task} pending={pending} error={error} onClose={() => setOpen(false)} onResolve={(outcome) => void save(outcome)} /> : null}</>;
}
