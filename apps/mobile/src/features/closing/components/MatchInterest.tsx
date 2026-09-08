import { useState } from "react";
import { View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { advisorWorkflowCopy, apiQueryKeys, commercialQueryKeys, dealDraftSchema, nextActionTypeLabels, nextActionTypes, type NextActionType, type PortfolioMatchRecord } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpDateField } from "@/shared/ui/SpDateField";
import { SpButton, SpField, SpInput } from "@/shared/ui/SpField";
import { SpText } from "@/shared/ui/SpText";
import { getClosingOverview, saveDeal } from "../resources/closing";
import { DealHistory } from "./DealHistory";

export function MatchInterest({ match }: { match: PortfolioMatchRecord }) {
  const { session } = useSession(); const client = useQueryClient();
  const query = useQuery({ queryKey: apiQueryKeys.closing, queryFn: getClosingOverview });
  const [open, setOpen] = useState(false); const [note, setNote] = useState("");
  const [type, setType] = useState<NextActionType>("appointment"); const [at, setAt] = useState("");
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const existing = query.data?.deals.find((deal) => deal.listingId === match.portfolioItem.sourceListingId && deal.buyerOpportunityId === match.opportunityId && deal.stage !== "lost" && deal.stage !== "closed");
  if (!match.portfolioItem.sourceListingId || !match.opportunityId) return null;
  async function save() {
    if (!session) return;
    const draft = dealDraftSchema.safeParse({ listingId: match.portfolioItem.sourceListingId, buyerContactId: match.contactId, buyerOpportunityId: match.opportunityId, source: "direct_inquiry", sourceNote: note, nextActionType: type, nextActionAt: at ? new Date(at).getTime() : null });
    if (!draft.success) { setError(draft.error.issues[0]?.message ?? "İlgi ve takip bilgilerini kontrol et."); return; }
    setPending(true); setError(null);
    try { await saveDeal(session, draft.data); await Promise.all(commercialQueryKeys.map((queryKey) => client.invalidateQueries({ queryKey }))); setOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "İlgi kaydedilemedi."); } finally { setPending(false); }
  }
  if (existing) return <View><SpText>{advisorWorkflowCopy.interestSaved}</SpText><DealHistory deal={existing} /><SpText>{existing.nextActionType ? nextActionTypeLabels[existing.nextActionType] : ""}{existing.nextActionAt ? ` · ${new Date(existing.nextActionAt).toLocaleString("tr-TR")}` : ""}</SpText></View>;
  return <View>{open ? <><SpText>{advisorWorkflowCopy.interestHint}</SpText><SpField label={advisorWorkflowCopy.interestNote}><SpInput multiline value={note} onChangeText={setNote} /></SpField><SpText>Sonraki adım: {nextActionTypeLabels[type]}</SpText>{nextActionTypes.map((item) => <SpButton key={item} label={nextActionTypeLabels[item]} onPress={() => setType(item)} />)}<SpDateField label="İlgi takibi zamanı" value={at} onChange={setAt} /><SpButton label="İlgiyi ve takibi kaydet" disabled={pending} onPress={() => void save()} /><SpButton label="Vazgeç" disabled={pending} onPress={() => setOpen(false)} /></> : <SpButton label={advisorWorkflowCopy.recordInterest} disabled={query.isPending || Boolean(query.error)} onPress={() => setOpen(true)} />}{error ? <SpText>{error}</SpText> : null}</View>;
}
