export interface DailyTaskCandidate {
  id: string;
  overdueDays: number;
  bottleneckImpact: number;
  estimatedValueImpact: number;
  ageDays: number;
  complianceBlocked: boolean;
}

export function rankDailyTaskCandidates(
  candidates: readonly DailyTaskCandidate[],
  limit = 5,
): DailyTaskCandidate[] {
  const safeLimit = Math.max(0, Math.min(5, Math.floor(limit)));

  return [...candidates]
    .filter((candidate) => !candidate.complianceBlocked)
    .sort((left, right) => scoreDailyTaskCandidate(right) - scoreDailyTaskCandidate(left) || left.id.localeCompare(right.id))
    .slice(0, safeLimit);
}

/** Exported so a caller can order candidates itself without duplicating the weights. */
export function scoreDailyTaskCandidate(candidate: DailyTaskCandidate): number {
  return (
    Math.max(0, candidate.overdueDays) * 100 +
    Math.max(0, candidate.bottleneckImpact) * 20 +
    Math.max(0, candidate.estimatedValueImpact) * 5 +
    Math.max(0, candidate.ageDays)
  );
}
