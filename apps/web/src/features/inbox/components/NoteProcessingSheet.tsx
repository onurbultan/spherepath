"use client";

import { useState } from "react";
import { BriefcaseBusiness, Building2, CalendarPlus, Save, UserRoundPlus, X } from "lucide-react";
import {
  moneyInputValue,
  parseMoneyInput,
  classifyInboxText,
  contactDraftSchema,
  existingListingDraftSchema,
  inboxItemKinds,
  emptyVoiceInsights,
  nextActionTypeLabels,
  nextActionTypes,
  opportunityTypeLabels,
  portfolioAuthorizationLabels,
  portfolioAuthorizationTypes,
  propertyTypeLabels,
  propertyTypes,
  titleDeedTypeLabels,
  titleDeedTypes,
  type InboxItemAnalysis,
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
import { saveExistingListing } from "@/features/listings/resources/listings";
import { analyzeInboxItem, changeInboxItem, processInboxItem as processItem } from "../resources/inbox";
import { MoneyField, PhoneField } from "@/shared/ui/MaskedFields";
import { SpInput, SpSelect, SpTextarea } from "@/shared/ui/SpField";

const kindLabels: Record<InboxItemKind, string> = { note: "Not", person: "Kişi", property: "Mülk", requirement: "Talep", follow_up: "Takip" };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Not işlenemedi.";

function tomorrowMorning(): string {
  const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(10, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function localDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const numberOrNull = (value: string): number | null => value ? Number(value) : null;

export function NoteProcessingSheet({ item, contacts, onClose, onChanged }: { item: InboxItemRecord; contacts: readonly ContactRecord[]; onClose(): void; onChanged(updatedItem?: InboxItemRecord): Promise<void> | void }) {
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
  const [analysis, setAnalysis] = useState<InboxItemAnalysis | null>(null);
  const [pending, setPending] = useState<"save" | "analyze" | "process" | "listing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expectedAction = kind === "person" ? "contact_created" : kind === "property" ? "portfolio_created" : kind === "requirement" ? "opportunity_created" : kind === "follow_up" ? "follow_up_scheduled" : null;
  const alreadyProcessed = expectedAction !== null && item.appliedActions.some((action) => action.type === expectedAction && action.undoneAt === null);
  const listingAlreadyCreated = item.appliedActions.some((action) => action.type === "listing_created" && action.undoneAt === null);

  async function saveEdits(): Promise<InboxItemRecord | null> {
    if (!session) return null;
    const updatedItem = await changeInboxItem(session, { inboxItemId: item.id, text, kind, linkedContactId: contactId || null });
    await onChanged(updatedItem);
    return updatedItem;
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

  async function analyzeRequirement() {
    if (text.trim().length < 10) return setError("Talebi çözümlemek için biraz daha bilgi yaz.");
    setPending("analyze"); setError(null);
    try {
      await saveEdits();
      const result = await analyzeInboxItem({ inboxItemId: item.id });
      setAnalysis(result);
      setOpportunityType(result.opportunityType);
      if (result.nextActionType) setActionType(result.nextActionType);
      if (result.nextActionAt) setActionAt(localDateTime(result.nextActionAt));
    } catch (next) { setError(messageFrom(next)); }
    finally { setPending(null); }
  }

  async function process() {
    if (!session) return;
    setPending("process"); setError(null);
    try {
      await saveEdits();
      let processedItem: InboxItemRecord | null = null;
      if (kind === "person") {
        const contact = contactDraftSchema.parse({ fullName: personName, phone: personPhone, metAtPlace: "Akış notu", source: "other", role: "unknown" });
        processedItem = (await processItem(session, { inboxItemId: item.id, action: "person", contact })).item;
      } else if (kind === "requirement") {
        if (!contactId) throw new Error("Talebi oluşturmak için kişiyi seç.");
        if (!analysis) throw new Error("Önce talep bilgilerini ve tarihi çıkarıp kontrol et.");
        processedItem = (await processItem(session, { inboxItemId: item.id, action: "requirement", contactId, opportunityType, nextActionType: actionType, nextActionAt: new Date(actionAt).getTime(), approvedInsights: analysis?.insights ?? emptyVoiceInsights })).item;
      } else if (kind === "follow_up") {
        if (!contactId) throw new Error("Takibi oluşturmak için kişiyi seç.");
        processedItem = (await processItem(session, { inboxItemId: item.id, action: "follow_up", contactId, nextActionType: actionType, nextActionAt: new Date(actionAt).getTime() })).item;
      } else if (kind === "property") {
        if (!portfolio) throw new Error("Önce notu çözümle ve çıkarılan bilgileri kontrol et.");
        processedItem = (await processItem(session, { inboxItemId: item.id, action: "portfolio", contactId: contactId || null, portfolio })).item;
      }
      await onChanged(processedItem ?? undefined); onClose();
    } catch (next) { setError(messageFrom(next)); }
    finally { setPending(null); }
  }

  async function createAuthorizedListing() {
    if (!session || !portfolio) return;
    setPending("listing"); setError(null);
    try {
      await saveEdits();
      if (!contactId) throw new Error("Yetkili portföy için mülk sahibini seç.");
      if (portfolio.authorizationType === "none") throw new Error("Yetkili portföy için geçerli bir yetki türü seç.");
      const parsed = existingListingDraftSchema.safeParse({
        ownerContactId: contactId,
        opportunityType: portfolio.transactionType === "sell" ? "seller_listing" : "landlord_listing",
        address: portfolio.location.length >= 3 ? portfolio.location : portfolio.headline,
        regionSlug: portfolio.location,
        propertyType: portfolio.propertyType,
        roomCount: portfolio.bedroomCount,
        areaM2: portfolio.propertyType === "land" ? portfolio.landAreaM2 : portfolio.areaM2,
        features: portfolio.features,
        authorizationType: portfolio.authorizationType,
        // A mandate is given before the valuation; the price arrives later.
        askingPrice: portfolio.askingPrice?.amount ?? null,
        currency: portfolio.askingPrice?.currency ?? "TRY",
        expiresAt: null,
        sourceInboxItemId: item.id,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Yetkili portföy bilgilerini kontrol et.");
      await saveExistingListing(session, parsed.data);
      await onChanged(); onClose();
    } catch (next) { setError(messageFrom(next)); }
    finally { setPending(null); }
  }

  return <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="form-sheet note-processing-sheet" role="dialog" aria-modal="true" aria-labelledby="note-processing-title">
    <div className="sheet-heading"><div><p className="eyebrow">NOTU DÜZENLE VE İŞLE</p><h2 id="note-processing-title">Bu not neye dönüşsün?</h2><p className="privacy-copy">Önce metni ve türü düzelt; sonra gerçek kaydı oluştur.</p></div><button className="icon-action" aria-label="Kapat" onClick={onClose} type="button"><X size={20} /></button></div>
    <div className="form-stack">
      <label>Not metni<SpTextarea autoFocus value={text} onChange={(event) => setText(event.target.value)} /></label>
      <label>Not türü<SpSelect value={kind} onChange={(event) => { setKind(event.target.value as InboxItemKind); setPortfolio(null); }}>{inboxItemKinds.map((value) => <option key={value} value={value}>{kindLabels[value]}</option>)}</SpSelect></label>
      {kind !== "person" ? <ContactCombobox contacts={contacts} label={kind === "property" ? "Mülk sahibi / ilgili kişi" : "İlgili kişi"} required={kind !== "property" && kind !== "note"} value={contactId} onChange={setContactId} /> : null}
      {kind === "person" ? <div className="form-row"><label>Adı<SpInput value={personName} onChange={(event) => setPersonName(event.target.value)} /></label><label>Telefon <span className="optional">isteğe bağlı</span><PhoneField value={personPhone} onChange={setPersonPhone} /></label></div> : null}
      {kind === "requirement" ? <>{analysis ? <div className="note-extraction-review"><div className="review-banner"><BriefcaseBusiness size={18} /><div><strong>Talep bilgileri çıkarıldı</strong><p>Onayladığınız bilgiler kişi hafızasına ve eşleştirmeye aktarılır.</p></div></div><label>Aranan bölgeler<SpInput value={analysis.insights.propertyPreferences.preferredLocations.join(", ")} onChange={(event) => setAnalysis({ ...analysis, insights: { ...analysis.insights, propertyPreferences: { ...analysis.insights.propertyPreferences, preferredLocations: event.target.value.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 8) } } })} placeholder="Urla, Kuşçular" /></label><div className="form-row"><label>Azami bütçe<SpInput min="0" type="number" value={analysis.insights.propertyPreferences.budgetRange?.max ?? ""} onChange={(event) => setAnalysis({ ...analysis, insights: { ...analysis.insights, propertyPreferences: { ...analysis.insights.propertyPreferences, budgetRange: event.target.value ? { min: analysis.insights.propertyPreferences.budgetRange?.min ?? null, max: Number(event.target.value), currency: analysis.insights.propertyPreferences.budgetRange?.currency ?? "TRY" } : null } } })} /></label><label>Oda<SpInput min="0" type="number" value={analysis.insights.propertyPreferences.bedroomCountMin ?? ""} onChange={(event) => setAnalysis({ ...analysis, insights: { ...analysis.insights, propertyPreferences: { ...analysis.insights.propertyPreferences, bedroomCountMin: numberOrNull(event.target.value) } } })} /></label><label>Salon<SpInput min="0" type="number" value={analysis.insights.propertyPreferences.livingRoomCountMin ?? ""} onChange={(event) => setAnalysis({ ...analysis, insights: { ...analysis.insights, propertyPreferences: { ...analysis.insights.propertyPreferences, livingRoomCountMin: numberOrNull(event.target.value) } } })} /></label></div><label>Olmazsa olmazlar<SpInput value={analysis.insights.propertyPreferences.mustHaves.join(", ")} onChange={(event) => setAnalysis({ ...analysis, insights: { ...analysis.insights, propertyPreferences: { ...analysis.insights.propertyPreferences, mustHaves: event.target.value.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 8) } } })} placeholder="Bahçe, denize yürüme mesafesi" /></label><label>Hatırlanacaklar<SpInput value={analysis.insights.keyThingsToRemember.join(", ")} onChange={(event) => setAnalysis({ ...analysis, insights: { ...analysis.insights, keyThingsToRemember: event.target.value.split(",").map((value) => value.trim()).filter((value) => value.length > 1).slice(0, 8) } })} /></label></div> : <button className="secondary-action note-process-action" disabled={pending !== null} onClick={() => void analyzeRequirement()} type="button"><BriefcaseBusiness size={17} /> {pending === "analyze" ? "Talep çözümleniyor…" : "Talep bilgilerini ve tarihi çıkar"}</button>}<label>Talep türü<SpSelect value={opportunityType} onChange={(event) => setOpportunityType(event.target.value as typeof opportunityType)}><option value="buyer_requirement">{opportunityTypeLabels.buyer_requirement}</option><option value="tenant_requirement">{opportunityTypeLabels.tenant_requirement}</option></SpSelect></label></> : null}
      {kind === "requirement" || kind === "follow_up" ? <><label>Sonraki adım<SpSelect value={actionType} onChange={(event) => setActionType(event.target.value as NextActionType)}>{nextActionTypes.map((value) => <option key={value} value={value}>{nextActionTypeLabels[value]}</option>)}</SpSelect></label><QuickDateField value={actionAt} onChange={setActionAt} /></> : null}
      {kind === "property" ? portfolio ? <div className="note-extraction-review"><strong>Çıkarılan portföyü kontrol et</strong><label>Başlık<SpInput value={portfolio.headline} onChange={(event) => setPortfolio({ ...portfolio, headline: event.target.value })} /></label><label>Konum<SpInput value={portfolio.location} onChange={(event) => setPortfolio({ ...portfolio, location: event.target.value })} /></label><div className="form-row"><label>İşlem<SpSelect value={portfolio.transactionType} onChange={(event) => setPortfolio({ ...portfolio, transactionType: event.target.value as "sell" | "let" })}><option value="sell">Satılık</option><option value="let">Kiralık</option></SpSelect></label><label>Mülk türü<SpSelect value={portfolio.propertyType} onChange={(event) => setPortfolio({ ...portfolio, propertyType: event.target.value as PortfolioItemDraft["propertyType"] })}>{propertyTypes.map((value) => <option key={value} value={value}>{propertyTypeLabels[value]}</option>)}</SpSelect></label></div><label>Özet<SpTextarea value={portfolio.summary} onChange={(event) => setPortfolio({ ...portfolio, summary: event.target.value })} /></label><div className="form-row"><label>Fiyat<MoneyField currency={portfolio.askingPrice?.currency ?? "TRY"} value={moneyInputValue(portfolio.askingPrice?.amount)} onChange={(value) => { const amount = parseMoneyInput(value); setPortfolio({ ...portfolio, askingPrice: amount === null ? null : { amount, currency: portfolio.askingPrice?.currency ?? "TRY" } }); }} /></label><label>Alan m²<SpInput min="0" type="number" value={(portfolio.propertyType === "land" ? portfolio.landAreaM2 : portfolio.areaM2) ?? ""} onChange={(event) => setPortfolio({ ...portfolio, [portfolio.propertyType === "land" ? "landAreaM2" : "areaM2"]: numberOrNull(event.target.value) })} /></label></div>{portfolio.propertyType !== "land" ? <div className="form-row"><label>Oda<SpInput min="0" type="number" value={portfolio.bedroomCount ?? ""} onChange={(event) => setPortfolio({ ...portfolio, bedroomCount: numberOrNull(event.target.value) })} /></label><label>Salon<SpInput min="0" type="number" value={portfolio.livingRoomCount ?? ""} onChange={(event) => setPortfolio({ ...portfolio, livingRoomCount: numberOrNull(event.target.value) })} /></label></div> : null}<div className="form-row"><label>Yetki<SpSelect value={portfolio.authorizationType} onChange={(event) => setPortfolio({ ...portfolio, authorizationType: event.target.value as PortfolioItemDraft["authorizationType"] })}>{portfolioAuthorizationTypes.map((value) => <option key={value} value={value}>{portfolioAuthorizationLabels[value]}</option>)}</SpSelect></label><label>Tapu<SpSelect value={portfolio.titleDeedType} onChange={(event) => setPortfolio({ ...portfolio, titleDeedType: event.target.value as PortfolioItemDraft["titleDeedType"] })}>{titleDeedTypes.map((value) => <option key={value} value={value}>{titleDeedTypeLabels[value]}</option>)}</SpSelect></label><label>Yapılaşma<SpSelect value={portfolio.constructionAllowed === null ? "unknown" : String(portfolio.constructionAllowed)} onChange={(event) => setPortfolio({ ...portfolio, constructionAllowed: event.target.value === "unknown" ? null : event.target.value === "true" })}><option value="unknown">Belirsiz</option><option value="true">Uygun</option><option value="false">Uygun değil</option></SpSelect></label></div><label>Diğer özellikler<SpInput value={portfolio.attributes.join(", ")} onChange={(event) => setPortfolio({ ...portfolio, attributes: event.target.value.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 20) })} /></label></div> : <button className="secondary-action note-process-action" disabled={pending !== null} onClick={() => void analyzeProperty()} type="button"><Building2 size={17} /> {pending === "analyze" ? "Çözümleniyor…" : "Mülk bilgilerini çıkar"}</button> : null}
      {alreadyProcessed ? <p className="success-notice">Bu not daha önce {kind === "property" ? "ofis havuzuna" : "gerçek bir kayda"} dönüştürülmüş.</p> : null}
      {listingAlreadyCreated ? <p className="success-notice">Bu not daha önce yetkili portföye dönüştürülmüş.</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="note-sheet-actions"><button className="secondary-action" disabled={pending !== null} onClick={() => void save()} type="button"><Save size={17} /> {pending === "save" ? "Kaydediliyor…" : "Yalnızca kaydet"}</button>{kind === "property" ? <><button className="secondary-action" disabled={pending !== null || alreadyProcessed || !portfolio} onClick={() => void process()} type="button"><Building2 size={17} />{pending === "process" ? "Ekleniyor…" : "Ofis havuzuna ekle"}</button><button className="primary-action" disabled={pending !== null || listingAlreadyCreated || !portfolio} onClick={() => void createAuthorizedListing()} type="button"><Building2 size={17} />{pending === "listing" ? "Portföy oluşturuluyor…" : "Yetkili portföye dönüştür"}</button></> : kind !== "note" ? <button className="primary-action" disabled={pending !== null || alreadyProcessed} onClick={() => void process()} type="button">{kind === "person" ? <UserRoundPlus size={17} /> : kind === "requirement" ? <BriefcaseBusiness size={17} /> : <CalendarPlus size={17} />}{pending === "process" ? "İşleniyor…" : kind === "person" ? "Kişi oluştur" : kind === "requirement" ? "Talep oluştur" : "Takibi oluştur"}</button> : null}</div>
    </div>
  </section></div>;
}
