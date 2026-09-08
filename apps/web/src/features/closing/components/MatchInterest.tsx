"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { advisorWorkflowCopy, apiQueryKeys, commercialQueryKeys, dealDraftSchema, nextActionTypeLabels, nextActionTypes, type NextActionType, type PortfolioMatchRecord } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { QuickDateField } from "@/shared/ui/QuickDateField";
import { SpSelect, SpTextarea } from "@/shared/ui/SpField";
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
  if (existing) return <div className="form-stack"><p>{advisorWorkflowCopy.interestSaved}</p><DealHistory deal={existing} /><p>{existing.nextActionType ? nextActionTypeLabels[existing.nextActionType] : ""}{existing.nextActionAt ? ` · ${new Date(existing.nextActionAt).toLocaleString("tr-TR")}` : ""}</p></div>;
  return <div className="form-stack">{open ? <><p>{advisorWorkflowCopy.interestHint}</p><label>{advisorWorkflowCopy.interestNote}<SpTextarea value={note} onChange={(event) => setNote(event.target.value)} /></label><label>Sonraki adım<SpSelect value={type} onChange={(event) => setType(event.target.value as NextActionType)}>{nextActionTypes.map((item) => <option key={item} value={item}>{nextActionTypeLabels[item]}</option>)}</SpSelect></label><QuickDateField label="İlgi takibi zamanı" value={at} onChange={setAt} /><button type="button" className="primary-action" disabled={pending} onClick={() => void save()}>İlgiyi ve takibi kaydet</button><button type="button" className="secondary-action" disabled={pending} onClick={() => setOpen(false)}>Vazgeç</button></> : <button type="button" className="secondary-action" disabled={query.isPending || Boolean(query.error)} onClick={() => setOpen(true)}>{advisorWorkflowCopy.recordInterest}</button>}{error ? <p role="alert" className="form-error">{error}</p> : null}</div>;
}
