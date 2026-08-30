import {
  createCommandId,
  type PortfolioItemDraft,
  type PortfolioItemRecord,
  type PortfolioMatchNotificationRecord,
  type PortfolioMatchRecord,
  type PortfolioSource,
} from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";

export async function listPortfolioItems(): Promise<PortfolioItemRecord[]> {
  return (await apiClient.query<undefined, { portfolioItems: PortfolioItemRecord[] }>("listPortfolioItems", undefined)).portfolioItems;
}

export interface PortfolioMatchResult { matches: PortfolioMatchRecord[]; nearMisses: PortfolioMatchRecord[] }
export async function listPortfolioMatches(): Promise<PortfolioMatchResult> {
  const result = await apiClient.query<undefined, PortfolioMatchResult>("listPortfolioMatches", undefined);
  return { matches: result.matches ?? [], nearMisses: result.nearMisses ?? [] };
}

export async function listMatchNotifications(): Promise<PortfolioMatchNotificationRecord[]> {
  return (await apiClient.query<undefined, { notifications: PortfolioMatchNotificationRecord[] }>("listMatchNotifications", undefined)).notifications;
}

export async function markMatchNotificationsRead(session: WorkspaceSession, notificationIds: string[]): Promise<void> {
  await apiClient.command<{ notificationIds: string[] }, { markedCount: number }>(
    "markMatchNotificationsRead", { notificationIds }, createCommandId(session.uid),
  );
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
