import {
  createCommandId,
  type Opportunity,
  type OpportunityDraft,
  type OpportunityStage,
  type OpportunityTransition,
  type StageEvent,
} from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";

export interface OpportunityRecord extends Opportunity {
  id: string;
  subjectContactName: string;
}

export interface OpportunityStageEventRecord extends StageEvent { id: string }
export interface OpportunityDetail { opportunity: OpportunityRecord; stageEvents: OpportunityStageEventRecord[] }

export async function listOpportunities(): Promise<OpportunityRecord[]> {
  return (await apiClient.query<undefined, { opportunities: OpportunityRecord[] }>("listOpportunities", undefined)).opportunities;
}

export async function getOpportunityDetail(opportunityId: string): Promise<OpportunityDetail> {
  return apiClient.query<{ opportunityId: string }, OpportunityDetail>("getOpportunityDetail", { opportunityId });
}

export async function saveOpportunity(session: WorkspaceSession, draft: OpportunityDraft): Promise<OpportunityRecord> {
  return (await apiClient.command<OpportunityDraft, { opportunity: OpportunityRecord }>(
    "createOpportunity", draft, createCommandId(session.uid),
  )).opportunity;
}

export async function moveOpportunity(session: WorkspaceSession, transition: OpportunityTransition): Promise<{ opportunityId: string; toStage: OpportunityStage; eventId: string }> {
  return apiClient.command<OpportunityTransition, { opportunityId: string; toStage: OpportunityStage; eventId: string }>(
    "advanceOpportunity", transition, createCommandId(session.uid),
  );
}
