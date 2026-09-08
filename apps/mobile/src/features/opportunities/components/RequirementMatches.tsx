import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { advisorWorkflowCopy } from "@spherepath/shared";
import { SpText } from "@/shared/ui/SpText";
import { SpButton } from "@/shared/ui/SpField";
import { portfolioMatchesQueryOptions } from "@/features/matching/resources/portfolio";
import { MatchCard } from "@/features/matching/views/OfficePortfolioSection";
import type { OpportunityRecord } from "../resources/opportunities";
export function RequirementMatches({ opportunity }: { opportunity: OpportunityRecord }) {
  const query = useQuery(portfolioMatchesQueryOptions);
  const matches = [...(query.data?.matches ?? []), ...(query.data?.nearMisses ?? [])].filter((item) => item.opportunityId === opportunity.id);
  return <View><SpText variant="title">{advisorWorkflowCopy.requirementMatches}</SpText>{query.isPending ? <SpText>Eşleşmeler aranıyor…</SpText> : query.error ? <><SpText>{advisorWorkflowCopy.matchError}</SpText><SpButton label="Yeniden dene" onPress={() => void query.refetch()} /></> : !opportunity.criteria ? <SpText>{advisorWorkflowCopy.missingCriteria}</SpText> : !matches.length ? <SpText>{query.data?.candidateCount === 0 ? "Eşleştirilecek portföy yok. Kendi portföyüne veya ofis havuzuna kayıt ekle." : advisorWorkflowCopy.noMatches}</SpText> : matches.map((match) => <MatchCard key={match.portfolioItem.id} match={match} nearMiss={match.score < 60} />)}</View>;
}
