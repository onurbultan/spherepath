import {
  createCommandId,
  type PortfolioItemDraft,
  type PortfolioItemRecord,
  type PortfolioMatchRecord,
  type PortfolioSource,
} from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";

export async function listPortfolioItems(): Promise<PortfolioItemRecord[]> {
  return (await apiClient.query<undefined, { portfolioItems: PortfolioItemRecord[] }>("listPortfolioItems", undefined)).portfolioItems;
}

export async function listPortfolioMatches(): Promise<PortfolioMatchRecord[]> {
  return (await apiClient.query<undefined, { matches: PortfolioMatchRecord[] }>("listPortfolioMatches", undefined)).matches;
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
