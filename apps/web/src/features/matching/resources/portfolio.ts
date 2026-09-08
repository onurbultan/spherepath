import {
  createCommandId,
  apiQueryKeys,
  type PortfolioItemDraft,
  type PortfolioItemRecord,
  type PortfolioMatchNotificationRecord,
  type PortfolioMatchRecord,
  type PortfolioSource,
  type MatchMessageDraft,
  type MatchMessageRequest,
} from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";

export async function listPortfolioItems(): Promise<PortfolioItemRecord[]> {
  return (await apiClient.query<undefined, { portfolioItems: PortfolioItemRecord[] }>("listPortfolioItems", undefined)).portfolioItems;
}

export interface PortfolioMatchResult { matches: PortfolioMatchRecord[]; nearMisses: PortfolioMatchRecord[]; candidateCount?: number; demandCount?: number }
export async function listPortfolioMatches(): Promise<PortfolioMatchResult> {
  const combined: PortfolioMatchResult = { matches: [], nearMisses: [] };
  let cursor: number | null = 0;
  do {
    const page: PortfolioMatchResult & { nextCursor?: number | null } = await apiClient.query("listPortfolioMatches", { cursor });
    combined.matches.push(...(page.matches ?? [])); combined.nearMisses.push(...(page.nearMisses ?? []));
    combined.candidateCount = page.candidateCount; combined.demandCount = page.demandCount;
    cursor = page.nextCursor ?? null;
  } while (cursor !== null);
  return combined;
}

export const portfolioMatchesQueryOptions = {
  queryKey: apiQueryKeys.portfolioMatches,
  queryFn: listPortfolioMatches,
  staleTime: 30_000,
};

export async function listMatchNotifications(): Promise<PortfolioMatchNotificationRecord[]> {
  return (await apiClient.query<undefined, { notifications: PortfolioMatchNotificationRecord[] }>("listMatchNotifications", undefined)).notifications;
}

export async function markMatchNotificationsRead(session: WorkspaceSession, notificationIds: string[]): Promise<void> {
  for (let index = 0; index < notificationIds.length; index += 100) {
    await apiClient.command<{ notificationIds: string[] }, { markedCount: number }>("markMatchNotificationsRead", { notificationIds: notificationIds.slice(index, index + 100) }, createCommandId(session.uid));
  }
}

export async function analyzePortfolioText(text: string, source: PortfolioSource): Promise<PortfolioItemDraft> {
  return (await apiClient.query<{ text: string; source: PortfolioSource }, { draft: PortfolioItemDraft }>("extractPortfolioText", { text, source })).draft;
}

export async function savePortfolioItem(session: WorkspaceSession, draft: PortfolioItemDraft): Promise<PortfolioItemRecord> {
  return (await apiClient.command<PortfolioItemDraft, { portfolioItem: PortfolioItemRecord }>("createPortfolioItemFromDraft", draft, createCommandId(session.uid))).portfolioItem;
}

export async function withdrawPortfolioItem(session: WorkspaceSession, portfolioItemId: string): Promise<void> {
  await apiClient.command<{ portfolioItemId: string }, { portfolioItemId: string }>("withdrawPortfolioItem", { portfolioItemId }, createCommandId(session.uid));
}

export async function draftMatchMessage(request: MatchMessageRequest): Promise<MatchMessageDraft> {
  return apiClient.query<MatchMessageRequest, MatchMessageDraft>("draftMatchMessage", request);
}
