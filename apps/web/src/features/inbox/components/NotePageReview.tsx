"use client";

import { useMemo, useState } from "react";
import { Building2, BriefcaseBusiness, CalendarPlus, CircleSlash, UserRoundPlus, X } from "lucide-react";
import {
  applyNoteSegmentsSchema,
  contactSourceLabels,
  contactSources,
  nextActionTypeLabels,
  nextActionTypes,
  opportunityTypeLabels,
  segmentContactName,
  type ApplyNoteSegmentsInput,
  type ContactDraft,
  type InboxItemKind,
  type InboxItemRecord,
  type NextActionType,
  type NoteSegmentDecision,
  type NoteSegmentReading,
  type OpportunityType,
  type SegmentContactRef,
} from "@spherepath/shared";
import { ContactCombobox } from "@/shared/ui/ContactCombobox";
import { PhoneField } from "@/shared/ui/MaskedFields";
import { QuickDateField } from "@/shared/ui/QuickDateField";
import { SpInput, SpSelect } from "@/shared/ui/SpField";
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
import type { ContactRecord } from "@/features/contacts/resources/contacts";

/** What a line can be turned into. "skip" leaves it on the page as written. */
type RowAction = "person" | "requirement" | "portfolio" | "follow_up" | "skip";

const actionLabels: Record<RowAction, string> = {
  person: "Kişi olarak ekle",
  requirement: "Talep aç",
  portfolio: "Ofis havuzuna ekle",
  follow_up: "Takip planla",
  skip: "Bu satırı atla",
};

const actionIcons: Record<RowAction, typeof UserRoundPlus> = {
  person: UserRoundPlus,
  requirement: BriefcaseBusiness,
  portfolio: Building2,
  follow_up: CalendarPlus,
  skip: CircleSlash,
};

interface RowState {
  action: RowAction;
  personName: string;
  personPhone: string;
  personSource: ContactDraft["source"];
  /** Empty means the line is about somebody created by another line on this page. */
  contactId: string;
  contactFromSegmentId: string;
  opportunityType: OpportunityType;
  nextActionType: NextActionType;
  nextActionAt: string;
}

function tomorrowMorning(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function localDateTime(value: number): string {
  return new Date(value - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** The action a line starts on, from what the reading made of it. */
function defaultAction(segment: NoteSegmentReading): RowAction {
  if (segment.kind === "person") return "person";
  if (segment.kind === "property") return segment.analysis?.portfolio ? "portfolio" : "skip";
  if (segment.kind === "requirement") return segment.matchedContactId ? "requirement" : "person";
  if (segment.kind === "follow_up") return segment.matchedContactId ? "follow_up" : "skip";
  return "skip";
}

function initialRow(segment: NoteSegmentReading): RowState {
  const analysis = segment.analysis;
  return {
    action: defaultAction(segment),
    personName: segmentContactName(segment) ?? "",
    personPhone: analysis?.insights.contactPhone?.trim() ?? "",
    personSource: segment.sectionIntent === "leads" ? "other" : "in_person",
    contactId: segment.matchedContactId ?? "",
    contactFromSegmentId: "",
    opportunityType: analysis?.opportunityType ?? "buyer_requirement",
    nextActionType: analysis?.nextActionType ?? "call",
    nextActionAt: analysis?.nextActionAt ? localDateTime(analysis.nextActionAt) : tomorrowMorning(),
  };
}

export function NotePageReview({
  item,
  contacts,
  pending,
  error,
  onClose,
  onApply,
}: {
  item: InboxItemRecord;
  contacts: readonly ContactRecord[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onApply: (input: ApplyNoteSegmentsInput) => void;
}) {
  const segments = useMemo(
    () => (item.segments ?? []).filter((segment) => segment.appliedAt === null),
    [item.segments],
  );
  const [rows, setRows] = useState<Record<string, RowState>>(
    () => Object.fromEntries(segments.map((segment) => [segment.id, initialRow(segment)])),
  );
  const [formError, setFormError] = useState<string | null>(null);
  useSheetDismiss(true, onClose);

  const update = (segmentId: string, change: Partial<RowState>) =>
    setRows((current) => ({ ...current, [segmentId]: { ...current[segmentId]!, ...change } }));

  /** People this page is about to create, offered to the lines that name them. */
  const peopleFromThisPage = segments
    .filter((segment) => rows[segment.id]?.action === "person" && rows[segment.id]!.personName.trim().length >= 2)
    .map((segment) => ({ segmentId: segment.id, name: rows[segment.id]!.personName.trim() }));

  const creating = segments.filter((segment) => rows[segment.id]?.action !== "skip").length;
  const skipping = segments.length - creating;

  function contactRefFor(row: RowState): SegmentContactRef | null {
    if (row.contactFromSegmentId) return { kind: "segment", segmentId: row.contactFromSegmentId };
    if (row.contactId) return { kind: "existing", contactId: row.contactId };
    return null;
  }

  function submit() {
    const decisions: NoteSegmentDecision[] = [];
    for (const segment of segments) {
      const row = rows[segment.id]!;
      if (row.action === "skip") {
        decisions.push({ segmentId: segment.id, action: "skip" });
        continue;
      }
      const nextActionAt = new Date(row.nextActionAt).getTime();
      if (row.action === "person") {
        if (row.personName.trim().length < 2) return setFormError(`“${segment.text.slice(0, 40)}” için ad soyad gerekli.`);
        decisions.push({
          segmentId: segment.id,
          action: "person",
          contact: {
            fullName: row.personName.trim(),
            phone: row.personPhone.trim(),
            metAtPlace: segment.heading ?? "Günlük not",
            source: row.personSource,
            role: "unknown",
            nextActionType: row.nextActionType,
            nextActionAt,
          },
          approvedInsights: segment.analysis?.insights,
          opportunityType: null,
          // A line under "portföy alma ihtimali olanlar" is somebody to go and
          // see. The server refuses to manufacture that conversation too.
          recordInteraction: segment.sectionIntent !== "leads",
        });
        continue;
      }
      const contactRef = contactRefFor(row);
      if (row.action === "portfolio") {
        const portfolio = segment.analysis?.portfolio;
        if (!portfolio) return setFormError(`“${segment.text.slice(0, 40)}” için mülk bilgisi okunamadı; bu satırı tek tek işleyebilirsin.`);
        decisions.push({ segmentId: segment.id, action: "portfolio", contactRef, portfolio });
        continue;
      }
      if (!contactRef) return setFormError(`“${segment.text.slice(0, 40)}” için kişi seç.`);
      if (row.action === "requirement") {
        if (!segment.analysis) return setFormError(`“${segment.text.slice(0, 40)}” için talep bilgisi okunamadı.`);
        decisions.push({
          segmentId: segment.id,
          action: "requirement",
          contactRef,
          opportunityType: row.opportunityType === "tenant_requirement" ? "tenant_requirement" : "buyer_requirement",
          nextActionType: row.nextActionType,
          nextActionAt,
          approvedInsights: segment.analysis.insights,
        });
        continue;
      }
      decisions.push({ segmentId: segment.id, action: "follow_up", contactRef, nextActionType: row.nextActionType, nextActionAt });
    }
    const parsed = applyNoteSegmentsSchema.safeParse({ inboxItemId: item.id, decisions });
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "Kararları kontrol et.");
    setFormError(null);
    onApply(parsed.data);
  }

  function contactField(segment: NoteSegmentReading, row: RowState) {
    const others = peopleFromThisPage.filter((person) => person.segmentId !== segment.id);
    return (
      <div className="note-page-contact">
        <ContactCombobox
          contacts={contacts}
          label="Kişi"
          required={false}
          value={row.contactFromSegmentId ? "" : row.contactId}
          onChange={(value) => update(segment.id, { contactId: value, contactFromSegmentId: "" })}
        />
        {others.length ? (
          <label>Ya da bu sayfadan
            <SpSelect
              value={row.contactFromSegmentId}
              onChange={(event) => update(segment.id, { contactFromSegmentId: event.target.value, contactId: "" })}
            >
              <option value="">Seçilmedi</option>
              {others.map((person) => <option key={person.segmentId} value={person.segmentId}>{person.name}</option>)}
            </SpSelect>
          </label>
        ) : null}
      </div>
    );
  }

  const pageDate = new Intl.DateTimeFormat("tr-TR", { dateStyle: "full" }).format(item.createdAt);
  /** A heading is printed once, above the first line that sits under it. */
  const startsSection = (position: number) =>
    segments[position]!.heading !== null && segments[position]!.heading !== (position === 0 ? null : segments[position - 1]!.heading);

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) onClose(); }}>
      <section className="form-sheet note-page-review" role="dialog" aria-modal="true" aria-labelledby="note-page-title">
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">GÜNLÜK NOT</p>
            <h2 id="note-page-title">{pageDate}</h2>
            <p className="privacy-copy">
              Sayfada {segments.length} satır var. {creating} tanesi kayda dönüşecek{skipping ? `, ${skipping} tanesi olduğu gibi kalacak` : ""}.
            </p>
          </div>
          <button className="icon-action" aria-label="Kapat" disabled={pending} onClick={onClose} type="button"><X size={20} /></button>
        </div>

        <div className="note-page-rows">
          {segments.map((segment, position) => {
            const row = rows[segment.id]!;
            const Icon = actionIcons[row.action];
            const showHeading = startsSection(position);
            return (
              <div key={segment.id}>
                {showHeading ? <p className="eyebrow note-page-section">{segment.heading}</p> : null}
                <article className={`note-page-row${row.action === "skip" ? " is-skipped" : ""}`}>
                  <p className="note-page-line">{segment.text}</p>
                  <label className="note-page-action">
                    <span className="note-page-action-icon"><Icon size={15} aria-hidden /></span>
                    <SpSelect
                      aria-label={`${segment.text.slice(0, 40)} için karar`}
                      value={row.action}
                      onChange={(event) => update(segment.id, { action: event.target.value as RowAction })}
                    >
                      {(Object.keys(actionLabels) as RowAction[]).map((action) => (
                        <option key={action} value={action}>{actionLabels[action]}</option>
                      ))}
                    </SpSelect>
                  </label>

                  {row.action === "person" ? (
                    <div className="note-page-fields">
                      <label>Ad soyad<SpInput value={row.personName} onChange={(event) => update(segment.id, { personName: event.target.value })} /></label>
                      <label>Telefon <span className="optional">isteğe bağlı</span><PhoneField value={row.personPhone} onChange={(phone) => update(segment.id, { personPhone: phone })} /></label>
                      <label>Kaynak<SpSelect value={row.personSource} onChange={(event) => update(segment.id, { personSource: event.target.value as ContactDraft["source"] })}>{contactSources.map((source) => <option key={source} value={source}>{contactSourceLabels[source]}</option>)}</SpSelect></label>
                    </div>
                  ) : null}

                  {row.action === "requirement" || row.action === "follow_up" || row.action === "portfolio" ? (
                    <div className="note-page-fields">{contactField(segment, row)}</div>
                  ) : null}

                  {row.action === "requirement" ? (
                    <div className="note-page-fields">
                      <label>Talep türü<SpSelect value={row.opportunityType} onChange={(event) => update(segment.id, { opportunityType: event.target.value as OpportunityType })}>
                        <option value="buyer_requirement">{opportunityTypeLabels.buyer_requirement}</option>
                        <option value="tenant_requirement">{opportunityTypeLabels.tenant_requirement}</option>
                      </SpSelect></label>
                    </div>
                  ) : null}

                  {row.action === "person" || row.action === "requirement" || row.action === "follow_up" ? (
                    <div className="note-page-fields">
                      <label>Sonraki adım<SpSelect value={row.nextActionType} onChange={(event) => update(segment.id, { nextActionType: event.target.value as NextActionType })}>{nextActionTypes.map((type) => <option key={type} value={type}>{nextActionTypeLabels[type]}</option>)}</SpSelect></label>
                      <QuickDateField label="Ne zaman" required value={row.nextActionAt} onChange={(value) => update(segment.id, { nextActionAt: value })} />
                    </div>
                  ) : null}

                  {row.action === "portfolio" && segment.analysis?.portfolio ? (
                    <p className="note-page-hint">{segment.analysis.portfolio.headline} · {segment.analysis.portfolio.location}</p>
                  ) : null}
                  {row.action === "portfolio" && !segment.analysis?.portfolio ? (
                    <p className="note-page-hint is-warning">Bu satırdan mülk bilgisi çıkarılamadı.</p>
                  ) : null}
                </article>
              </div>
            );
          })}
        </div>

        {formError ?? error ? <p className="form-error" role="alert">{formError ?? error}</p> : null}
        <div className="note-sheet-actions">
          <button className="secondary-action" disabled={pending} onClick={onClose} type="button">Vazgeç</button>
          <button className="primary-action" disabled={pending || creating === 0} onClick={submit} type="button">
            {pending ? "Oluşturuluyor…" : `${creating} kaydı oluştur`}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Kinds a page can hold, for the card that offers the review. */
export function notePageSummary(segments: readonly NoteSegmentReading[]): string {
  const waiting = segments.filter((segment) => segment.appliedAt === null);
  const counts = new Map<InboxItemKind, number>();
  for (const segment of waiting) counts.set(segment.kind, (counts.get(segment.kind) ?? 0) + 1);
  const labels: Partial<Record<InboxItemKind, string>> = { person: "kişi", property: "mülk", requirement: "talep", follow_up: "iş", note: "not" };
  const parts = [...counts.entries()].map(([kind, count]) => `${count} ${labels[kind] ?? "satır"}`);
  return parts.join(" · ");
}
