import { createCommandId, type Deal, type DealDraft, type DealTransition, type Presentation, type PresentationDraft, type PresentationTransition } from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";
export interface PresentationRecord extends Presentation { id: string; contactName: string; listingAddress: string }
export interface DealRecord extends Deal { id: string; buyerContactName: string | null; listingAddress: string }
export interface ClosingOverview { presentations: PresentationRecord[]; deals: DealRecord[] }
export async function getClosingOverview(): Promise<ClosingOverview> { return apiClient.query<undefined, ClosingOverview>("getClosingOverview", undefined); }
export async function savePresentation(session: WorkspaceSession, draft: PresentationDraft) { return apiClient.command<PresentationDraft, { presentationId: string }>("createPresentation", draft, createCommandId(session.uid)); }
export async function movePresentation(session: WorkspaceSession, transition: PresentationTransition) { return apiClient.command<PresentationTransition, { presentationId: string }>("advancePresentation", transition, createCommandId(session.uid)); }
export async function saveDeal(session: WorkspaceSession, draft: DealDraft) { return apiClient.command<DealDraft, { dealId: string }>("createDeal", draft, createCommandId(session.uid)); }
export async function moveDeal(session: WorkspaceSession, transition: DealTransition) { return apiClient.command<DealTransition, { dealId: string }>("advanceDeal", transition, createCommandId(session.uid)); }
