"use client";
import { useQuery } from "@tanstack/react-query";
import { advisorWorkflowCopy } from "@spherepath/shared";
import { portfolioMatchesQueryOptions } from "@/features/matching/resources/portfolio";
import { PortfolioMatchCard } from "@/features/matching/views/OfficePortfolioSection";
import type { OpportunityRecord } from "../resources/opportunities";
export function RequirementMatches({ opportunity }: { opportunity: OpportunityRecord }) {
  const query = useQuery(portfolioMatchesQueryOptions);
  const matches = [...(query.data?.matches ?? []), ...(query.data?.nearMisses ?? [])].filter((item) => item.opportunityId === opportunity.id);
  return <section className="form-stack"><h3>{advisorWorkflowCopy.requirementMatches}</h3>{query.isPending ? <p>Eşleşmeler aranıyor…</p> : query.error ? <><p role="alert">{advisorWorkflowCopy.matchError}</p><button type="button" className="secondary-action" onClick={() => void query.refetch()}>Yeniden dene</button></> : !opportunity.criteria ? <p>{advisorWorkflowCopy.missingCriteria}</p> : !matches.length ? <p>{query.data?.candidateCount === 0 ? "Eşleştirilecek portföy yok. Kendi portföyüne veya ofis havuzuna kayıt ekle." : advisorWorkflowCopy.noMatches}</p> : matches.map((match) => <PortfolioMatchCard key={match.portfolioItem.id} match={match} nearMiss={match.score < 60} />)}</section>;
}
