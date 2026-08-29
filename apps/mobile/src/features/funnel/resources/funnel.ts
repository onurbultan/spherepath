import type { FunnelOverview, ReportingPeriod } from "@spherepath/shared";
import { apiClient } from "@/shared/api/client";

export async function loadFunnelOverview(period: ReportingPeriod): Promise<FunnelOverview> {
  return (await apiClient.query<{ period: ReportingPeriod }, { overview: FunnelOverview }>("getFunnelOverview", { period })).overview;
}
