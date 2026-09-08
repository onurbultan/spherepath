"use client";

import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, House, X } from "lucide-react";
import { isOpenRequirement, opportunityMatchIndicator, requirementMatchAccessibleLabel, requirementMatchCopy, type OpportunityMatchSummary } from "@spherepath/shared";
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
import type { OpportunityRecord } from "../resources/opportunities";
import { RequirementMatches } from "./RequirementMatches";

export function RequirementMatchIndicator({ opportunity, summary, status }: {
  opportunity: OpportunityRecord;
  summary?: OpportunityMatchSummary;
  status: "pending" | "error" | "success";
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  useSheetDismiss(open, () => setOpen(false));
  if (!isOpenRequirement(opportunity)) return null;
  const indicator = opportunityMatchIndicator(summary);
  if (status === "pending" && !open) return <small className="requirement-match-loading" role="status">{requirementMatchCopy.loading}</small>;
  if (!indicator && status !== "error" && !open) return null;
  const label = status === "error" ? requirementMatchCopy.error : indicator?.label ?? requirementMatchCopy.loading;
  const hint = status === "success" ? indicator?.hint : null;
  return <>
    {indicator || status === "error" ? <button className={`secondary-action compact-action requirement-match-indicator${indicator?.review || status === "error" ? " is-review" : ""}`} type="button"
      aria-label={requirementMatchAccessibleLabel(opportunity.subjectContactName, [label, hint].filter(Boolean).join(" · "))}
      aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <House size={14} aria-hidden /><span>{label}{hint ? <span className="requirement-match-hint"> · {hint}</span> : null}</span><ArrowRight size={14} aria-hidden />
    </button> : null}
    {open ? createPortal(<div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section className="form-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-heading"><div><p className="eyebrow">{requirementMatchCopy.eyebrow}</p><h2 id={titleId}>{opportunity.subjectContactName}</h2></div>
          <button className="icon-action" type="button" aria-label={requirementMatchCopy.close} onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <RequirementMatches opportunity={opportunity} />
      </section>
    </div>, document.body) : null}
  </>;
}
