import type { TodayOverview } from "@spherepath/shared";
import { apiClient } from "@/shared/api/client";

export async function loadTodayOverview(): Promise<TodayOverview> {
  return (await apiClient.query<undefined, { overview: TodayOverview }>("getTodayOverview", undefined)).overview;
}
