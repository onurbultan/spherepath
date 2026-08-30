import { type PortfolioItemDraft } from "@spherepath/shared";
import { apiClient } from "@/shared/api/client";

export async function analyzePortfolioText(text: string): Promise<PortfolioItemDraft> {
  return (await apiClient.query<{ text: string; source: "manual" }, { draft: PortfolioItemDraft }>("extractPortfolioText", { text, source: "manual" })).draft;
}
