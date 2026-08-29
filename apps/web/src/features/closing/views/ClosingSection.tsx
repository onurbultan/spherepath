"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { MessageSquareText, Plus, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiQueryKeys, canMarketOnChannel, contactPrivacyDraftSchema, dealDraftSchema, dealStageLabels, dealTransitionSchema, marketingChannelLabels, marketingChannels,
  nextDealStages, nextPresentationStatuses, presentationDraftSchema, presentationStatusLabels,
  type CurrencyCode, type DealStage, type MarketingChannel,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listContacts, saveContactPrivacy } from "@/features/contacts/resources/contacts";
import { SpCard } from "@/shared/ui/SpCard";
import { ContactCombobox } from "@/shared/ui/ContactCombobox";
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
import type { ListingRecord } from "@/features/listings/resources/listings";
import { getClosingOverview, moveDeal, movePresentation, saveDeal, savePresentation, type DealRecord } from "../resources/closing";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Kapama işlemi tamamlanamadı.";
const money = (amount: number, currency: CurrencyCode) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

function presentationMessage(listing: ListingRecord | undefined, contactName: string | null | undefined): string {
  if (!listing) return "";
  const property = listing.propertySummary;
  const details = [
    property.roomCount !== null ? `${property.roomCount} odalı` : null,
    property.areaM2 !== null ? `${property.areaM2} m²` : null,
  ].filter(Boolean).join(", ");
  const greeting = contactName ? `Merhaba ${contactName},` : "Merhaba,";
  return `${greeting}\n\n${property.address} adresindeki${details ? ` ${details}` : ""} ${property.type === "villa" ? "villa" : "portföy"} seçeneğimizi sizinle paylaşmak isterim. Liste fiyatı ${money(listing.askingPrice, listing.currency)}. Detayları incelemek veya bir gösterim planlamak ister misiniz?`;
}

export function ClosingSection({ listings, showHeading = true }: { listings: ListingRecord[]; showHeading?: boolean }) {
  const { session } = useSession(); const queryClient = useQueryClient();
  const closingQuery = useQuery({ queryKey: apiQueryKeys.closing, queryFn: getClosingOverview });
  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts });
  const contacts = contactsQuery.data ?? []; const marketableListings = listings.filter((item) => item.status === "active" || item.status === "reserved");
  const [presentationOpen, setPresentationOpen] = useState(false); const [dealOpen, setDealOpen] = useState(false); const [movingDeal, setMovingDeal] = useState<DealRecord | null>(null); const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const [listingId, setListingId] = useState(""); const [contactId, setContactId] = useState(""); const [channel, setChannel] = useState<MarketingChannel>("whatsapp"); const [message, setMessage] = useState(""); const [dealStage, setDealStage] = useState<DealStage>("viewing"); const [offerAmount, setOfferAmount] = useState(""); const [actualAmount, setActualAmount] = useState(""); const [commissionAmount, setCommissionAmount] = useState(""); const [currency, setCurrency] = useState<CurrencyCode>("TRY"); const [lostReason, setLostReason] = useState("");
  const [noticeConfirmed, setNoticeConfirmed] = useState(false); const [consentConfirmed, setConsentConfirmed] = useState(false); const [iysChoice, setIysChoice] = useState<"approved" | "exempt">("approved");
  const selectedListingId = listingId || marketableListings[0]?.id || ""; const selectedContactId = contactId;
  const selectedContact = contacts.find((item) => item.id === selectedContactId);
  const marketingEligibility = selectedContact ? canMarketOnChannel(selectedContact.privacy, channel) : { allowed: false, reason: "İlgili kişi seçilmedi." };
  useSheetDismiss(presentationOpen, () => setPresentationOpen(false));
  useSheetDismiss(dealOpen, () => setDealOpen(false));
  useSheetDismiss(Boolean(movingDeal), () => setMovingDeal(null));

  async function refresh() { await Promise.all([queryClient.invalidateQueries({ queryKey: apiQueryKeys.closing }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview })]); }
  function openPresentation() {
    const listing = marketableListings.find((item) => item.id === selectedListingId) ?? marketableListings[0];
    const contact = contacts.find((item) => item.id === selectedContactId);
    setMessage(presentationMessage(listing, contact?.fullName ?? contact?.label));
    setPresentationOpen(true);
    setError(null);
  }
  function selectContact(value: string) {
    setContactId(value);
    setNoticeConfirmed(false); setConsentConfirmed(false);
    setError(null);
    if (!presentationOpen) return;
    const listing = marketableListings.find((item) => item.id === selectedListingId) ?? marketableListings[0];
    const contact = contacts.find((item) => item.id === value);
    setMessage(presentationMessage(listing, contact?.fullName ?? contact?.label));
  }

  async function quickCompletePrivacy() {
    if (!session || !selectedContact) return;
    const parsed = contactPrivacyDraftSchema.safeParse({ contactId: selectedContact.id, coreCrmLegalBasis: selectedContact.privacy.purposes?.core_crm?.legalBasis ?? "legitimate_interest", noticeStatus: "completed", noticeMethod: "verbal", noticeVersion: "v1", marketingConsent: "granted", marketingChannels: Array.from(new Set([...selectedContact.privacy.marketingChannels, channel])), iysStatus: iysChoice, profilingObjection: selectedContact.privacy.profilingObjection });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "İzin bilgilerini kontrol et.");
    setPending(true); setError(null);
    try { await saveContactPrivacy(session, parsed.data); await queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }); setNoticeConfirmed(false); setConsentConfirmed(false); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }
  function selectListing(value: string) {
    setListingId(value);
    setError(null);
    if (!presentationOpen) return;
    const listing = marketableListings.find((item) => item.id === value);
    const contact = contacts.find((item) => item.id === selectedContactId);
    setMessage(presentationMessage(listing, contact?.fullName ?? contact?.label));
  }

  async function createPresentation(event: FormEvent) { event.preventDefault(); if (!session) return; const parsed = presentationDraftSchema.safeParse({ listingId: selectedListingId, contactId: selectedContactId, channel, message }); if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Sunum bilgilerini kontrol et."); setPending(true); setError(null); try { await savePresentation(session, parsed.data); setPresentationOpen(false); setMessage(""); await refresh(); } catch (nextError) { setError(messageFrom(nextError)); } finally { setPending(false); } }
  async function createDeal(event: FormEvent) { event.preventDefault(); if (!session) return; const parsed = dealDraftSchema.safeParse({ listingId: selectedListingId, buyerContactId: selectedContactId || null }); if (!parsed.success) return setError("İşlem bilgilerini kontrol et."); setPending(true); setError(null); try { await saveDeal(session, parsed.data); setDealOpen(false); await refresh(); } catch (nextError) { setError(messageFrom(nextError)); } finally { setPending(false); } }
  async function advancePresentation(id: string, status: Parameters<typeof nextPresentationStatuses>[0]) { if (!session) return; const next = nextPresentationStatuses(status)[0]; if (!next) return; setPending(true); setError(null); try { await movePresentation(session, { presentationId: id, toStatus: next }); await refresh(); } catch (nextError) { setError(messageFrom(nextError)); } finally { setPending(false); } }
  function openDealMove(deal: DealRecord) { const next = nextDealStages(deal.stage)[0]; if (!next) return; setMovingDeal(deal); setDealStage(next); setOfferAmount(deal.offerAmount?.toString() ?? ""); setActualAmount(deal.actualAmount?.toString() ?? deal.offerAmount?.toString() ?? ""); setCommissionAmount(deal.commissionAmount?.toString() ?? ""); setCurrency(deal.currency ?? "TRY"); setLostReason(""); setError(null); }
  async function advanceDeal(event: FormEvent) { event.preventDefault(); if (!session || !movingDeal) return; const parsed = dealTransitionSchema.safeParse({ dealId: movingDeal.id, toStage: dealStage, offerAmount: dealStage === "offer" ? Number(offerAmount) : null, actualAmount: dealStage === "closed" ? Number(actualAmount) : null, commissionAmount: dealStage === "closed" ? Number(commissionAmount) : null, currency: dealStage === "offer" || dealStage === "closed" ? currency : null, lostReason: dealStage === "lost" ? lostReason.trim() || null : null }); if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "İşlem aşamasını kontrol et."); setPending(true); setError(null); try { await moveDeal(session, parsed.data); setMovingDeal(null); await refresh(); } catch (nextError) { setError(messageFrom(nextError)); } finally { setPending(false); } }

  return <section className="closing-section"><div className="section-heading"><div>{showHeading ? <><p className="eyebrow">PAZARLAMA VE KAPAMA</p><h2>Sunumlar ve işlemler</h2></> : null}</div><div className="opportunity-actions"><button className="secondary-action inline-action" disabled={!marketableListings.length || !contacts.length} onClick={openPresentation} type="button"><MessageSquareText size={16} /> Sunum taslağı</button><button className="secondary-action inline-action" disabled={!marketableListings.length} onClick={() => { setDealOpen(true); setError(null); }} type="button"><Plus size={16} /> İşlem başlat</button></div></div>{error && !presentationOpen && !dealOpen && !movingDeal ? <p className="form-error">{error}</p> : null}<div className="closing-grid"><div><h3>Sunumlar</h3>{(closingQuery.data?.presentations.length ?? 0) === 0 ? <SpCard className="closing-empty">Henüz sunum yok.</SpCard> : closingQuery.data?.presentations.map((item) => <SpCard key={item.id} className="closing-card"><div><strong>{item.contactName}</strong><span>{item.listingAddress}</span></div><span className="stage-badge">{presentationStatusLabels[item.status]}</span>{nextPresentationStatuses(item.status).length ? <button disabled={pending} onClick={() => void advancePresentation(item.id, item.status)} type="button">{presentationStatusLabels[nextPresentationStatuses(item.status)[0]!]}</button> : null}</SpCard>)}</div><div><h3>İşlemler</h3>{(closingQuery.data?.deals.length ?? 0) === 0 ? <SpCard className="closing-empty">Henüz işlem yok.</SpCard> : closingQuery.data?.deals.map((item) => <SpCard key={item.id} className="closing-card"><div><strong>{item.buyerContactName ?? "Alıcı daha sonra"}</strong><span>{item.listingAddress}</span>{item.offerAmount && item.currency ? <small className="closing-offer">Teklif: {money(item.offerAmount, item.currency)}</small> : null}{item.actualAmount !== null && item.currency ? <small className="closing-offer">Gerçekleşen: {money(item.actualAmount, item.currency)} · Komisyon: {money(item.commissionAmount ?? 0, item.currency)}</small> : null}</div><span className="stage-badge">{dealStageLabels[item.stage]}</span>{nextDealStages(item.stage).length ? <button onClick={() => openDealMove(item)} type="button">Aşamayı ilerlet</button> : null}</SpCard>)}</div></div>
  {presentationOpen ? <Sheet title="Sunum taslağı" close={() => setPresentationOpen(false)}><form className="form-stack" onSubmit={createPresentation}><CommonFields contacts={contacts} contactId={selectedContactId} listings={marketableListings} listingId={selectedListingId} setContactId={selectContact} setListingId={selectListing} /><label>Kanal<select value={channel} onChange={(event) => { setChannel(event.target.value as MarketingChannel); setConsentConfirmed(false); setError(null); }}>{marketingChannels.map((item) => <option key={item} value={item}>{marketingChannelLabels[item]}</option>)}</select></label><label>Düzenlenebilir mesaj<textarea required value={message} onChange={(event) => setMessage(event.target.value)} /></label>{marketingEligibility.allowed ? <p className="privacy-hint">Taslak dış uygulamaya taşınsa bile gönderilmiş sayılmaz. Onay ve gönderim ayrıca kaydedilir.</p> : selectedContact ? <div className="quick-compliance"><p className="privacy-hint compliance-warning">{marketingEligibility.reason}</p><label className="check-label"><input checked={noticeConfirmed} type="checkbox" onChange={(event) => setNoticeConfirmed(event.target.checked)} /> Aydınlatmayı sözlü olarak tamamladım.</label><label className="check-label"><input checked={consentConfirmed} type="checkbox" onChange={(event) => setConsentConfirmed(event.target.checked)} /> {marketingChannelLabels[channel]} için pazarlama izni verildi.</label><label>İYS<select value={iysChoice} onChange={(event) => setIysChoice(event.target.value as "approved" | "exempt")}><option value="approved">Onaylı</option><option value="exempt">Muaf</option></select></label><button className="secondary-action" disabled={pending || !noticeConfirmed || !consentConfirmed} onClick={() => void quickCompletePrivacy()} type="button">İzni kaydet ve devam et</button><Link href={`/contacts?contactId=${encodeURIComponent(selectedContactId)}`}>Tüm uyum ayrıntılarını aç</Link></div> : <p className="privacy-hint compliance-warning">{marketingEligibility.reason}</p>}{error && marketingEligibility.allowed ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending || !marketingEligibility.allowed}>Taslağı kaydet</button></form></Sheet> : null}
  {dealOpen ? <Sheet title="İşlem başlat" close={() => setDealOpen(false)}><form className="form-stack" onSubmit={createDeal}><CommonFields contacts={contacts} contactId={selectedContactId} listings={marketableListings} listingId={selectedListingId} setContactId={selectContact} setListingId={selectListing} />{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending}>İşlemi oluştur</button></form></Sheet> : null}
  {movingDeal ? <Sheet title="İşlem aşaması" close={() => setMovingDeal(null)}><form className="form-stack" onSubmit={advanceDeal}><label>Yeni aşama<select value={dealStage} onChange={(event) => setDealStage(event.target.value as DealStage)}>{nextDealStages(movingDeal.stage).map((item) => <option key={item} value={item}>{dealStageLabels[item]}</option>)}</select></label>{dealStage === "offer" ? <div className="form-row"><label>Teklif<input type="number" min="1" value={offerAmount} onChange={(event) => setOfferAmount(event.target.value)} /></label><label>Para birimi<select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>{(["TRY", "GBP", "USD", "EUR"] as const).map((item) => <option key={item}>{item}</option>)}</select></label></div> : null}{dealStage === "closed" ? <div className="form-stack"><div className="form-row"><label>Gerçekleşen bedel<input required type="number" min="1" value={actualAmount} onChange={(event) => setActualAmount(event.target.value)} /></label><label>Komisyon<input required type="number" min="0" value={commissionAmount} onChange={(event) => setCommissionAmount(event.target.value)} /></label><label>Para birimi<select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>{(["TRY", "GBP", "USD", "EUR"] as const).map((item) => <option key={item}>{item}</option>)}</select></label></div><p className="privacy-hint">Kapama bedeli ve komisyon performans raporlarına kaynak olur.</p></div> : null}{dealStage === "lost" ? <label>Kayıp nedeni<textarea value={lostReason} onChange={(event) => setLostReason(event.target.value)} /></label> : null}{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending}>Aşamayı kaydet</button></form></Sheet> : null}</section>;
}

function CommonFields({ contacts, contactId, listings, listingId, setContactId, setListingId }: { contacts: Awaited<ReturnType<typeof listContacts>>; contactId: string; listings: ListingRecord[]; listingId: string; setContactId(value: string): void; setListingId(value: string): void }) { return <><label>Portföy<select value={listingId} onChange={(event) => setListingId(event.target.value)}>{listings.map((item) => <option key={item.id} value={item.id}>{item.propertySummary.address}</option>)}</select></label><ContactCombobox contacts={contacts} label="Alıcı / ilgili kişi" value={contactId} onChange={setContactId} /></>; }
function Sheet({ title, close, children }: { title: string; close(): void; children: ReactNode }) { return <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}><section aria-modal="true" className="form-sheet" role="dialog"><div className="sheet-heading"><div><p className="eyebrow">KAPAMA AKIŞI</p><h2>{title}</h2></div><button className="icon-action" aria-label="Kapat" onClick={close} type="button"><X size={20} /></button></div>{children}</section></div>; }
