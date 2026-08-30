"use client";

import { useState } from "react";
import { BriefcaseBusiness, Building2, CalendarPlus, Save, UserRoundPlus, X } from "lucide-react";
import {
  classifyInboxText,
  contactDraftSchema,
  inboxItemKinds,
  nextActionTypeLabels,
  nextActionTypes,
  opportunityTypeLabels,
  propertyTypeLabels,
  propertyTypes,
  type InboxItemKind,
  type InboxItemRecord,
  type NextActionType,
  type OpportunityType,
  type PortfolioItemDraft,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import type { ContactRecord } from "@/features/contacts/resources/contacts";
import { ContactCombobox } from "@/shared/ui/ContactCombobox";
import { QuickDateField } from "@/shared/ui/QuickDateField";
import { analyzePortfolioText } from "@/features/matching/resources/portfolio";
import { changeInboxItem, processInboxItem as processItem } from "../resources/inbox";

const kindLabels: Record<InboxItemKind, string> = { note: "Not", person: "Kişi", property: "Mülk", requirement: "Talep", follow_up: "Takip" };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Not işlenemedi.";

function tomorrowMorning(): string {
  const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(10, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function NoteProcessingSheet({ item, contacts, onClose, onChanged }: { item: InboxItemRecord; contacts: readonly ContactRecord[]; onClose(): void; onChanged(): Promise<void> | void }) {
  const { session } = useSession();
  const inferred = classifyInboxText(item.safeText);
  const [text, setText] = useState(item.safeText);
  const [kind, setKind] = useState<InboxItemKind>(item.kind);
  const [contactId, setContactId] = useState(item.linkedContactId ?? "");
  const [personName, setPersonName] = useState(inferred.explicitContact?.fullName ?? "");
  const [personPhone, setPersonPhone] = useState(inferred.explicitContact?.phone ?? "");
  const [opportunityType, setOpportunityType] = useState<Extract<OpportunityType, "buyer_requirement" | "tenant_requirement">>("buyer_requirement");
  const [actionType, setActionType] = useState<NextActionType>("call");
  const [actionAt, setActionAt] = useState(tomorrowMorning);
  const [portfolio, setPortfolio] = useState<PortfolioItemDraft | null>(null);
  const [pending, setPending] = useState<"save" | "analyze" | "process" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expectedAction = kind === "person" ? "contact_created" : kind === "property" ? "portfolio_created" : kind === "requirement" ? "opportunity_created" : kind === "follow_up" ? "follow_up_scheduled" : null;
  const alreadyProcessed = expectedAction !== null && item.appliedActions.some((action) => action.type === expectedAction && action.undoneAt === null);

  async function saveEdits(): Promise<void> {
    if (!session) return;
    await changeInboxItem(session, { inboxItemId: item.id, text, kind, linkedContactId: contactId || null });
    await onChanged();
  }

  async function save() {
    setPending("save"); setError(null);
    try { await saveEdits(); onClose(); } catch (next) { setError(messageFrom(next)); } finally { setPending(null); }
  }

  async function analyzeProperty() {
    if (text.trim().length < 10) return setError("Mülkü çözümlemek için biraz daha bilgi yaz.");
    setPending("analyze"); setError(null);
    try { await saveEdits(); setPortfolio(await analyzePortfolioText(text.trim(), "manual")); }
    catch (next) { setError(messageFrom(next)); }
    finally { setPending(null); }
  }

  async function process() {
    if (!session) return;
    setPending("process"); setError(null);
    try {
      await saveEdits();
      if (kind === "person") {
        const contact = contactDraftSchema.parse({ fullName: personName, phone: personPhone, metAtPlace: "Akış notu", source: "other", role: "unknown" });
        await processItem(session, { inboxItemId: item.id, action: "person", contact });
      } else if (kind === "requirement") {
        if (!contactId) throw new Error("Talebi oluşturmak için kişiyi seç.");
        await processItem(session, { inboxItemId: item.id, action: "requirement", contactId, opportunityType, nextActionType: actionType, nextActionAt: new Date(actionAt).getTime() });
      } else if (kind === "follow_up") {
        if (!contactId) throw new Error("Takibi oluşturmak için kişiyi seç.");
        await processItem(session, { inboxItemId: item.id, action: "follow_up", contactId, nextActionType: actionType, nextActionAt: new Date(actionAt).getTime() });
      } else if (kind === "property") {
        if (!portfolio) throw new Error("Önce notu çözümle ve çıkarılan bilgileri kontrol et.");
        await processItem(session, { inboxItemId: item.id, action: "portfolio", contactId: contactId || null, portfolio });
      }
      await onChanged(); onClose();
    } catch (next) { setError(messageFrom(next)); }
    finally { setPending(null); }
  }

  return <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="form-sheet note-processing-sheet" role="dialog" aria-modal="true" aria-labelledby="note-processing-title">
    <div className="sheet-heading"><div><p className="eyebrow">NOTU DÜZENLE VE İŞLE</p><h2 id="note-processing-title">Bu not neye dönüşsün?</h2><p className="privacy-copy">Önce metni ve türü düzelt; sonra gerçek kaydı oluştur.</p></div><button className="icon-action" aria-label="Kapat" onClick={onClose} type="button"><X size={20} /></button></div>
    <div className="form-stack">
      <label>Not metni<textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} /></label>
      <label>Not türü<select value={kind} onChange={(event) => { setKind(event.target.value as InboxItemKind); setPortfolio(null); }}>{inboxItemKinds.map((value) => <option key={value} value={value}>{kindLabels[value]}</option>)}</select></label>
      {kind !== "person" ? <ContactCombobox contacts={contacts} label={kind === "property" ? "İlgili kişi (isteğe bağlı)" : "İlgili kişi"} required={kind !== "property" && kind !== "note"} value={contactId} onChange={setContactId} /> : null}
      {kind === "person" ? <div className="form-row"><label>Adı<input value={personName} onChange={(event) => setPersonName(event.target.value)} /></label><label>Telefon <span className="optional">isteğe bağlı</span><input inputMode="tel" value={personPhone} onChange={(event) => setPersonPhone(event.target.value)} /></label></div> : null}
      {kind === "requirement" ? <label>Talep türü<select value={opportunityType} onChange={(event) => setOpportunityType(event.target.value as typeof opportunityType)}><option value="buyer_requirement">{opportunityTypeLabels.buyer_requirement}</option><option value="tenant_requirement">{opportunityTypeLabels.tenant_requirement}</option></select></label> : null}
      {kind === "requirement" || kind === "follow_up" ? <><label>Sonraki adım<select value={actionType} onChange={(event) => setActionType(event.target.value as NextActionType)}>{nextActionTypes.map((value) => <option key={value} value={value}>{nextActionTypeLabels[value]}</option>)}</select></label><QuickDateField value={actionAt} onChange={setActionAt} /></> : null}
      {kind === "property" ? portfolio ? <div className="note-extraction-review"><strong>Çıkarılan portföyü kontrol et</strong><label>Başlık<input value={portfolio.headline} onChange={(event) => setPortfolio({ ...portfolio, headline: event.target.value })} /></label><label>Konum<input value={portfolio.location} onChange={(event) => setPortfolio({ ...portfolio, location: event.target.value })} /></label><div className="form-row"><label>İşlem<select value={portfolio.transactionType} onChange={(event) => setPortfolio({ ...portfolio, transactionType: event.target.value as "sell" | "let" })}><option value="sell">Satılık</option><option value="let">Kiralık</option></select></label><label>Mülk türü<select value={portfolio.propertyType} onChange={(event) => setPortfolio({ ...portfolio, propertyType: event.target.value as PortfolioItemDraft["propertyType"] })}>{propertyTypes.map((value) => <option key={value} value={value}>{propertyTypeLabels[value]}</option>)}</select></label></div><label>Özet<textarea value={portfolio.summary} onChange={(event) => setPortfolio({ ...portfolio, summary: event.target.value })} /></label></div> : <button className="secondary-action note-process-action" disabled={pending !== null} onClick={() => void analyzeProperty()} type="button"><Building2 size={17} /> {pending === "analyze" ? "Çözümleniyor…" : "Mülk bilgilerini çıkar"}</button> : null}
      {alreadyProcessed ? <p className="success-notice">Bu not daha önce gerçek bir kayda dönüştürülmüş.</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="note-sheet-actions"><button className="secondary-action" disabled={pending !== null} onClick={() => void save()} type="button"><Save size={17} /> {pending === "save" ? "Kaydediliyor…" : "Yalnızca kaydet"}</button>{kind !== "note" ? <button className="primary-action" disabled={pending !== null || alreadyProcessed || (kind === "property" && !portfolio)} onClick={() => void process()} type="button">{kind === "person" ? <UserRoundPlus size={17} /> : kind === "property" ? <Building2 size={17} /> : kind === "requirement" ? <BriefcaseBusiness size={17} /> : <CalendarPlus size={17} />}{pending === "process" ? "İşleniyor…" : kind === "person" ? "Kişi oluştur" : kind === "property" ? "Ofis havuzuna ekle" : kind === "requirement" ? "Talep oluştur" : "Takibi oluştur"}</button> : null}</div>
    </div>
  </section></div>;
}
