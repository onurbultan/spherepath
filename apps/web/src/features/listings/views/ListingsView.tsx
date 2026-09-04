"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, House, Landmark, MoreHorizontal, Network, Plus, RefreshCw, Store, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  parseMoneyInput,
  apiQueryKeys, authorizationTypeLabels, authorizationTypes, currencyCodes, existingListingDraftSchema, listingActivationIssues, listingAuthorizationUpdateSchema, listingDraftSchema, listingPriceUpdateSchema, listingReadiness, listingReadinessUpdateSchema, listingStatusLabels, listingVerificationStatusLabels, listingVerificationStatuses,
  listingPriceLabel, listingTransitionSchema, nextListingStatuses, opportunitySituation, propertyFeatureLabels, propertyFeatures, propertyTypeLabels, propertyTypes,
  type AuthorizationType, type CurrencyCode, type ListingReadinessEvidence, type ListingStatus, type ListingVerificationStatus, type OpportunityType, type PropertyFeature, type PropertyType } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listOpportunities } from "@/features/opportunities/resources/opportunities";
import { listContacts } from "@/features/contacts/resources/contacts";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
import { ContactCombobox } from "@/shared/ui/ContactCombobox";
import { listListings, moveListing, saveExistingListing, saveListing, updateListingAuthorization, updateListingPrice, updateListingReadiness, type ListingRecord } from "../resources/listings";
import { ClosingSection } from "@/features/closing/views/ClosingSection";
import { OfficePortfolioSection } from "@/features/matching/views/OfficePortfolioSection";
import { MoneyField } from "@/shared/ui/MaskedFields";
import { SpInput, SpSelect, SpTextarea } from "@/shared/ui/SpField";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Portföy işlemi tamamlanamadı.";
const money = (amount: number, currency: CurrencyCode) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
const nativeNow = Date.now;
const pendingEvidence = (listing: ListingRecord): ListingReadinessEvidence => listing.readinessEvidence ?? { mandate: "pending", eids: "pending", media: "pending", processingBasis: "pending" };

export function ListingsView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedOwnerContactId = searchParams.get("action") === "add-listing" ? searchParams.get("ownerContactId") ?? "" : "";
  const requestedOpportunityId = searchParams.get("action") === "complete-won" ? searchParams.get("opportunityId") ?? "" : "";
  const portfolioView = searchParams.get("view") === "pool" ? "pool" : "own";
  const [referenceTime] = useState(nativeNow);
  const Date = { now: () => referenceTime };
  const { session } = useSession();
  const queryClient = useQueryClient();
  const listingsQuery = useQuery({ queryKey: apiQueryKeys.listings, queryFn: listListings });
  const opportunitiesQuery = useQuery({ queryKey: apiQueryKeys.opportunities, queryFn: listOpportunities });
  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts });
  const contacts = contactsQuery.data ?? [];
  const listings = listingsQuery.data ?? [];
  const candidates = (opportunitiesQuery.data ?? []).filter((item) => item.stage === "won" && !item.propertyId && ["seller_listing", "landlord_listing"].includes(item.type));
  const [createOpen, setCreateOpen] = useState(Boolean(requestedOpportunityId));
  const [importOpen, setImportOpen] = useState(Boolean(requestedOwnerContactId));
  const [poolOpenSignal, setPoolOpenSignal] = useState(0);
  const [moving, setMoving] = useState<ListingRecord | null>(null);
  const [detail, setDetail] = useState<ListingRecord | null>(null);
  const [pricing, setPricing] = useState<ListingRecord | null>(null);
  const [priceUpdateValue, setPriceUpdateValue] = useState("");
  const [priceUpdateCurrency, setPriceUpdateCurrency] = useState<CurrencyCode>("TRY");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState(requestedOpportunityId);
  const [ownerContactId, setOwnerContactId] = useState(requestedOwnerContactId);
  // The property is already in memory from the call that won the mandate, so the
  // form should not ask for it again; anything the advisor has typed wins.
  const ownerMemory = contacts.find((item) => item.id === ownerContactId)?.memory;
  const ownerSituation = ownerMemory ? opportunitySituation(ownerMemory, "seller_listing") : null;
  function prefillFromMemory() {
    if (!ownerSituation) return;
    const preferences = ownerSituation.propertyPreferences;
    if (!address && preferences.preferredLocations[0]) setAddress(preferences.preferredLocations[0]);
    if (!regionSlug && preferences.preferredLocations[0]) setRegionSlug(preferences.preferredLocations[0]);
    if (preferences.propertyTypes[0]) setPropertyType(preferences.propertyTypes[0]);
    if (!areaM2 && preferences.areaMinM2 !== null) setAreaM2(String(preferences.areaMinM2));
  }
  const [existingOpportunityType, setExistingOpportunityType] = useState<Extract<OpportunityType, "seller_listing" | "landlord_listing">>("seller_listing");
  const [address, setAddress] = useState("");
  const [regionSlug, setRegionSlug] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("apartment");
  const [roomCount, setRoomCount] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [features, setFeatures] = useState<PropertyFeature[]>([]);
  const [authorizationType, setAuthorizationType] = useState<AuthorizationType>("unknown");
  const [detailAuthorization, setDetailAuthorization] = useState<AuthorizationType>("unknown");
  const [detailEvidence, setDetailEvidence] = useState<ListingReadinessEvidence>({ mandate: "pending", eids: "pending", media: "pending", processingBasis: "pending" });
  const [askingPrice, setAskingPrice] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("TRY");
  const [targetStatus, setTargetStatus] = useState<ListingStatus>("active");
  const [reason, setReason] = useState("");
  const selectedOpportunityId = opportunityId || candidates[0]?.id || "";
  const totalTryValue = listings.filter((listing) => listing.currency === "TRY" && ["active", "reserved"].includes(listing.status)).reduce((sum, listing) => sum + (listing.askingPrice ?? 0), 0);
  const firstUnpricedListing = listings.find((listing) => listing.status === "preparing" && listing.askingPrice === null);

  function closeCreate() {
    setCreateOpen(false);
    if (requestedOpportunityId) router.replace("/listings", { scroll: false });
  }

  useSheetDismiss(createOpen, closeCreate);
  useSheetDismiss(importOpen, () => {
    setImportOpen(false);
    if (requestedOwnerContactId) router.replace("/listings", { scroll: false });
  });
  useSheetDismiss(Boolean(moving), () => setMoving(null));
  useSheetDismiss(Boolean(detail), () => setDetail(null));
  useSheetDismiss(Boolean(pricing), () => setPricing(null));

  async function invalidate() { await Promise.all([queryClient.invalidateQueries({ queryKey: apiQueryKeys.listings }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunities }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview })]); }
  function toggleFeature(feature: PropertyFeature) { setFeatures((current) => current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature]); }

  async function create(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    const parsed = listingDraftSchema.safeParse({ opportunityId: selectedOpportunityId, address, regionSlug, propertyType, roomCount: roomCount ? Number(roomCount) : null, areaM2: areaM2 ? Number(areaM2) : null, features, authorizationType, askingPrice: parseMoneyInput(askingPrice), currency, expiresAt: null });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Portföy bilgilerini kontrol et.");
    setPending(true); setError(null);
    try { await saveListing(session, parsed.data); closeCreate(); setAddress(""); setRegionSlug(""); setAskingPrice(""); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  async function createExisting(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    const parsed = existingListingDraftSchema.safeParse({ ownerContactId, opportunityType: existingOpportunityType, address, regionSlug, propertyType, roomCount: roomCount ? Number(roomCount) : null, areaM2: areaM2 ? Number(areaM2) : null, features, authorizationType, askingPrice: parseMoneyInput(askingPrice), currency, expiresAt: null });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Mevcut yetki bilgilerini kontrol et.");
    setPending(true); setError(null);
    try { await saveExistingListing(session, parsed.data); setImportOpen(false); if (requestedOwnerContactId) router.replace("/listings", { scroll: false }); setAddress(""); setRegionSlug(""); setAskingPrice(""); setOwnerContactId(""); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  function openMove(listing: ListingRecord) { const next = nextListingStatuses(listing.status)[0]; if (!next) return; setMoving(listing); setTargetStatus(next); setReason(""); setError(null); }
  function openDetail(listing: ListingRecord) { setDetail(listing); setDetailAuthorization(listing.authorizationType); setDetailEvidence(pendingEvidence(listing)); setError(null); }
  async function saveAuthorization() {
    if (!session || !detail) return;
    const parsed = listingAuthorizationUpdateSchema.safeParse({ listingId: detail.id, authorizationType: detailAuthorization });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Yetki bilgisini kontrol et.");
    setPending(true); setError(null);
    try { await updateListingAuthorization(session, parsed.data); setDetail({ ...detail, authorizationType: detailAuthorization }); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }
  async function saveReadiness() {
    if (!session || !detail) return;
    const parsed = listingReadinessUpdateSchema.safeParse({ listingId: detail.id, evidence: detailEvidence });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Yayın hazırlığını kontrol et.");
    setPending(true); setError(null);
    try { await updateListingReadiness(session, parsed.data); setDetail({ ...detail, readinessEvidence: parsed.data.evidence }); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }
  async function move(event: FormEvent) {
    event.preventDefault(); if (!session || !moving) return;
    const parsed = listingTransitionSchema.safeParse({ listingId: moving.id, toStatus: targetStatus, reason: reason.trim() || null });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Durum bilgisini kontrol et.");
    setPending(true); setError(null);
    try { await moveListing(session, parsed.data); setMoving(null); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  function openPricing(listing: ListingRecord) { setDetail(null); setPricing(listing); setPriceUpdateValue(listing.askingPrice === null ? "" : String(listing.askingPrice)); setPriceUpdateCurrency(listing.currency); setError(null); }
  async function savePrice(event: FormEvent) {
    event.preventDefault(); if (!session || !pricing) return;
    const parsed = listingPriceUpdateSchema.safeParse({ listingId: pricing.id, askingPrice: parseMoneyInput(priceUpdateValue), currency: priceUpdateCurrency });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Fiyat bilgisini kontrol et.");
    setPending(true); setError(null);
    try { await updateListingPrice(session, parsed.data); setPricing(null); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  return <AppShell><header className="page-header contacts-header"><div><p className="eyebrow">AKTİF ENVANTER</p><h1>Portföy</h1><p className="context-sentence">Yeni kazandığın veya zaten elinde olan yetkileri hızla kaydet; pazarlama ve kapamayı aynı yerden takip et.</p></div><div className="header-actions"><button className="secondary-action inline-action" onClick={() => { router.replace("/listings?view=pool", { scroll: false }); setPoolOpenSignal((value) => value + 1); }} type="button"><Network size={16} /> Havuza ekle</button><button className="secondary-action inline-action" disabled={!contacts.length} onClick={() => { setImportOpen(true); setError(null); }} type="button"><Plus size={18} /> Mevcut yetkiyi ekle</button><button className="primary-action inline-action" onClick={() => { setCreateOpen(true); setError(null); }} type="button"><Plus size={18} /> Kazanılan fırsattan ekle</button></div></header>
  <div className="contact-segments" role="tablist" aria-label="Portföy görünümü"><button aria-selected={portfolioView === "own"} className={portfolioView === "own" ? "active" : ""} onClick={() => router.replace("/listings?view=own", { scroll: false })} role="tab" type="button">Portföyüm <span>{listings.length}</span></button><button aria-selected={portfolioView === "pool"} className={portfolioView === "pool" ? "active" : ""} onClick={() => router.replace("/listings?view=pool", { scroll: false })} role="tab" type="button">Ofis havuzu</button></div>
  {portfolioView === "pool" ? <OfficePortfolioSection openSignal={poolOpenSignal} /> : null}
  {portfolioView === "own" ? <>
  {candidates.length ? <SpCard className="listing-completion-notice"><div className="listing-completion-icon"><Building2 size={19} /></div><div><strong>{candidates.length === 1 ? `${candidates[0]!.subjectContactName} için kazanılan yetki bekliyor` : `${candidates.length} kazanılan yetki tamamlanmayı bekliyor`}</strong><p>Portföyde görünmesi için adres, fiyat ve mülk bilgilerini tamamla.</p></div><button className="primary-action inline-action" onClick={() => { setOpportunityId(candidates[0]!.id); setCreateOpen(true); setError(null); }} type="button">Portföyü tamamla</button></SpCard> : null}
  {firstUnpricedListing ? <SpCard className="listing-completion-notice"><div className="listing-completion-icon"><Building2 size={19} /></div><div><strong>{firstUnpricedListing.propertySummary.address} için fiyat bekleniyor</strong><p>Değerleme sonucunu gir; günlük plandaki eksik portföy işi otomatik kapansın.</p></div><button className="primary-action inline-action" onClick={() => openPricing(firstUnpricedListing)} type="button">Fiyatı tamamla</button></SpCard> : null}
  {error && !createOpen && !moving ? <p className="form-error notice">{error}</p> : null}
  {listingsQuery.isPending ? <div className="content-state"><RefreshCw className="spin" size={22} /> Portföyler yükleniyor…</div> : listingsQuery.error ? <p className="form-error notice">{messageFrom(listingsQuery.error)}</p> : listings.length === 0 ? <SpCard className="empty-state"><div className="card-icon secondary"><Building2 size={20} /></div><h2>Henüz portföy yok</h2><p>Elindeki mevcut yetkiyi kişiyle ilişkilendirerek doğrudan ekleyebilir veya kazanılan bir fırsatı portföye dönüştürebilirsin.</p><button className="secondary-action" disabled={!contacts.length} onClick={() => setImportOpen(true)} type="button">Mevcut yetkiyi ekle</button></SpCard> : <section className="own-listings-section" aria-labelledby="own-listings-title"><div className="inline-section-heading"><div><h2 id="own-listings-title">Kendi portföyün</h2><span>yetkiye bağlanmış, sende kayıtlı mülkler</span></div><span className="listing-total">Aktif envanter değeri <strong>{money(totalTryValue, "TRY")}</strong></span></div><div className="listing-table"><div className="listing-table-head"><span>Mülk</span><span>Mülk sahibi</span><span>Yetki</span><span>Liste fiyatı</span><span>Durum</span><span>Yayında</span><span /></div>{listings.map((listing) => { const PropertyIcon = listing.propertySummary.type === "villa" || listing.propertySummary.type === "detached_house" ? House : listing.propertySummary.type === "land" ? Landmark : listing.propertySummary.type === "commercial" ? Store : Building2; return <button key={listing.id} onClick={() => openDetail(listing)} type="button"><span className="listing-property"><span className="listing-property-icon"><PropertyIcon size={16} /></span><span><strong>{listing.propertySummary.address}</strong><small>{propertyTypeLabels[listing.propertySummary.type]}{listing.propertySummary.roomCount !== null ? ` · ${listing.propertySummary.roomCount} oda` : ""}{listing.propertySummary.areaM2 !== null ? ` · ${listing.propertySummary.areaM2} m²` : ""}{listing.propertySummary.features.length ? ` · ${listing.propertySummary.features.slice(0, 3).map((item) => propertyFeatureLabels[item]).join(", ")}` : ""}</small></span></span><span>{listing.ownerContactName}</span><span>{authorizationTypeLabels[listing.authorizationType]}</span><strong>{listingPriceLabel(listing.askingPrice, listing.currency)}</strong><span><span className={`stage-badge stage-${listing.status}`}>{listingStatusLabels[listing.status]}</span></span><span>{listing.status === "preparing" ? "—" : `${Math.max(0, Math.floor((Date.now() - listing.acquiredAt) / 86_400_000))} gün`}</span><span className="listing-more" aria-hidden><MoreHorizontal size={17} /></span></button>; })}</div></section>}
  {listings.length ? <div id="closing"><ClosingSection listings={listings} /></div> : null}
  </> : null}
  {detail ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) setDetail(null); }}><section className="form-sheet" role="dialog" aria-modal="true" aria-labelledby="listing-detail-title"><div className="sheet-heading"><div><p className="eyebrow">PORTFÖY DETAYI</p><h2 id="listing-detail-title">{detail.propertySummary.address}</h2><p className="privacy-copy">{detail.ownerContactName} · {listingStatusLabels[detail.status]}</p></div><button className="icon-action" aria-label="Kapat" disabled={pending} onClick={() => setDetail(null)} type="button"><X size={20} /></button></div><div className="form-stack"><div className="note-extraction-review"><strong>Yayına hazırlık {listingReadiness(detail).filter((item) => item.ready).length}/{listingReadiness(detail).length}</strong>{listingReadiness(detail).map((item) => <p key={item.key}>{item.ready ? "✓" : "○"} {item.label}</p>)}</div><label>Yetki türü<SpSelect value={detailAuthorization} onChange={(event) => setDetailAuthorization(event.target.value as AuthorizationType)}>{authorizationTypes.map((item) => <option value={item} key={item}>{authorizationTypeLabels[item]}</option>)}</SpSelect></label><button className="secondary-action" disabled={pending || detailAuthorization === detail.authorizationType} onClick={() => void saveAuthorization()} type="button">Yetkiyi güncelle</button><label>Yetki sözleşmesi / dayanağı<SpSelect value={detailEvidence.mandate} onChange={(event) => setDetailEvidence((current) => ({ ...current, mandate: event.target.value as ListingVerificationStatus }))}>{listingVerificationStatuses.map((item) => <option value={item} key={item}>{listingVerificationStatusLabels[item]}</option>)}</SpSelect></label><label>EİDS<SpSelect value={detailEvidence.eids} onChange={(event) => setDetailEvidence((current) => ({ ...current, eids: event.target.value as ListingVerificationStatus }))}>{listingVerificationStatuses.map((item) => <option value={item} key={item}>{listingVerificationStatusLabels[item]}</option>)}</SpSelect></label><label>Fotoğraf ve medya<SpSelect value={detailEvidence.media} onChange={(event) => setDetailEvidence((current) => ({ ...current, media: event.target.value as ListingReadinessEvidence["media"] }))}><option value="pending">Bekliyor</option><option value="ready">Yayına hazır</option></SpSelect></label><label>İşleme dayanağı<SpSelect value={detailEvidence.processingBasis} onChange={(event) => setDetailEvidence((current) => ({ ...current, processingBasis: event.target.value as ListingReadinessEvidence["processingBasis"] }))}><option value="pending">Bekliyor</option><option value="verified">Doğrulandı</option></SpSelect></label><button className="secondary-action" disabled={pending || JSON.stringify(detailEvidence) === JSON.stringify(pendingEvidence(detail))} onClick={() => void saveReadiness()} type="button">Yayın hazırlığını kaydet</button><button className="secondary-action" disabled={pending} onClick={() => openPricing(detail)} type="button">{detail.askingPrice === null ? "Liste fiyatını ekle" : "Liste fiyatını güncelle"}</button>{listingActivationIssues(detail).length ? <p className="privacy-hint compliance-warning">Yayına alma blokları: {listingActivationIssues(detail).join(" · ")}</p> : null}{nextListingStatuses(detail.status).length ? <button className="primary-action" disabled={pending || (nextListingStatuses(detail.status)[0] === "active" && listingActivationIssues(detail).length > 0)} onClick={() => { const selected = detail; setDetail(null); openMove(selected); }} type="button">Durumu güncelle</button> : null}{error ? <p className="form-error">{error}</p> : null}</div></section></div> : null}
  {pricing ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) setPricing(null); }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">DEĞERLEME SONUCU</p><h2>{pricing.propertySummary.address}</h2><p className="privacy-copy">Doğrulanmış liste fiyatını gir. Bu değer eşleşme ve sunumlarda kullanılır.</p></div><button className="icon-action" aria-label="Kapat" disabled={pending} onClick={() => setPricing(null)} type="button"><X size={20} /></button></div><form className="form-stack" onSubmit={savePrice}><label>Liste fiyatı<MoneyField currency={priceUpdateCurrency} value={priceUpdateValue} onChange={setPriceUpdateValue} /></label><label>Para birimi<SpSelect value={priceUpdateCurrency} onChange={(event) => setPriceUpdateCurrency(event.target.value as CurrencyCode)}>{currencyCodes.map((item) => <option value={item} key={item}>{item}</option>)}</SpSelect></label>{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Kaydediliyor…" : "Fiyatı kaydet"}</button></form></section></div> : null}
  {importOpen ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setImportOpen(false); }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">MEVCUT YETKİ</p><h2>Portföyü doğrudan ekle</h2><p className="privacy-copy">Fırsat geçmişi ve denetim kaydı otomatik oluşturulur.</p></div><button className="icon-action" aria-label="Kapat" onClick={() => setImportOpen(false)} type="button"><X size={20} /></button></div><form className="form-stack" onSubmit={createExisting}><ContactCombobox contacts={contacts} label="Mülk sahibi" value={ownerContactId} onChange={setOwnerContactId} /><label>Portföy amacı<SpSelect value={existingOpportunityType} onChange={(event) => setExistingOpportunityType(event.target.value as typeof existingOpportunityType)}><option value="seller_listing">Satılık</option><option value="landlord_listing">Kiralık</option></SpSelect></label>{ownerSituation ? <p className="privacy-hint">Bu kişi hakkında bilinen mülk: {ownerSituation.summary} <button className="text-button" onClick={prefillFromMemory} type="button">Bilinenleri doldur</button></p> : null}<label>Adres<SpInput required value={address} onChange={(event) => setAddress(event.target.value)} /></label><label>Bölge<SpInput required placeholder="Örn. Şişli Merkez" value={regionSlug} onChange={(event) => setRegionSlug(event.target.value)} /></label><div className="form-row"><label>Mülk türü<SpSelect value={propertyType} onChange={(event) => setPropertyType(event.target.value as PropertyType)}>{propertyTypes.map((item) => <option value={item} key={item}>{propertyTypeLabels[item]}</option>)}</SpSelect></label><label>Oda<SpInput min="0" step="0.5" type="number" value={roomCount} onChange={(event) => setRoomCount(event.target.value)} /></label><label>m²<SpInput min="1" type="number" value={areaM2} onChange={(event) => setAreaM2(event.target.value)} /></label></div><fieldset><legend>Özellikler</legend><div className="chip-row">{propertyFeatures.map((item) => <button className={`choice-chip ${features.includes(item) ? "selected" : ""}`} key={item} onClick={() => toggleFeature(item)} type="button">{propertyFeatureLabels[item]}</button>)}</div></fieldset><div className="form-row"><label>Yetki<SpSelect value={authorizationType} onChange={(event) => setAuthorizationType(event.target.value as AuthorizationType)}>{authorizationTypes.map((item) => <option value={item} key={item}>{authorizationTypeLabels[item]}</option>)}</SpSelect></label><label>Fiyat<small>değerlemeden sonra girilebilir</small><MoneyField currency={currency} value={askingPrice} onChange={setAskingPrice} /></label><label>Para birimi<SpSelect value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>{currencyCodes.map((item) => <option value={item} key={item}>{item}</option>)}</SpSelect></label></div>{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending || !ownerContactId} type="submit">{pending ? "Kaydediliyor…" : "Yetkiyi ve portföyü oluştur"}</button></form></section></div> : null}
  {createOpen ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) closeCreate(); }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">YENİ PORTFÖY</p><h2>{candidates.length ? "Mülk ve yetki bilgileri" : "Önce fırsatı kazan"}</h2></div><button className="icon-action" aria-label="Kapat" onClick={closeCreate} type="button"><X size={20} /></button></div>{candidates.length ? <form className="form-stack" onSubmit={create}><label>Kazanılan fırsat<SpSelect value={selectedOpportunityId} onChange={(event) => setOpportunityId(event.target.value)}>{candidates.map((item) => <option key={item.id} value={item.id}>{item.subjectContactName}</option>)}</SpSelect></label><p className="privacy-hint">Yetki kazanıldı. Aşağıdaki bilgiler tamamlanınca kayıt kendi portföyünde görünür.</p><label>Adres<SpInput required value={address} onChange={(event) => setAddress(event.target.value)} /></label><label>Bölge<SpInput required placeholder="Örn. Şişli Merkez" value={regionSlug} onChange={(event) => setRegionSlug(event.target.value)} /></label><div className="form-row"><label>Mülk türü<SpSelect value={propertyType} onChange={(event) => setPropertyType(event.target.value as PropertyType)}>{propertyTypes.map((item) => <option value={item} key={item}>{propertyTypeLabels[item]}</option>)}</SpSelect></label><label>Oda sayısı<SpInput min="0" step="0.5" type="number" value={roomCount} onChange={(event) => setRoomCount(event.target.value)} /></label><label>m²<SpInput min="1" type="number" value={areaM2} onChange={(event) => setAreaM2(event.target.value)} /></label></div><fieldset><legend>Özellikler</legend><div className="chip-row">{propertyFeatures.map((item) => <button className={`choice-chip ${features.includes(item) ? "selected" : ""}`} key={item} onClick={() => toggleFeature(item)} type="button">{propertyFeatureLabels[item]}</button>)}</div></fieldset><div className="form-row"><label>Yetki<SpSelect value={authorizationType} onChange={(event) => setAuthorizationType(event.target.value as AuthorizationType)}>{authorizationTypes.map((item) => <option value={item} key={item}>{authorizationTypeLabels[item]}</option>)}</SpSelect></label><label>Fiyat<MoneyField currency={currency} value={askingPrice} onChange={setAskingPrice} /></label><label>Para birimi<SpSelect value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>{currencyCodes.map((item) => <option value={item} key={item}>{item}</option>)}</SpSelect></label></div>{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Kaydediliyor…" : "Portföyü oluştur"}</button></form> : <div className="empty-guidance"><Building2 size={22} /><h3>Portföye dönüşecek hazır kayıt yok</h3><p>Yalnızca satıcı veya kiraya veren fırsatları portföye dönüşür. Alıcı ve kiracı talepleri “kazanıldığında” portföy oluşturmaz.</p><Link className="primary-action inline-link" href="/opportunities">Fırsatlara git</Link></div>}</section></div> : null}
  {moving ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setMoving(null); }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">PORTFÖY DURUMU</p><h2>{moving.propertySummary.address}</h2></div><button className="icon-action" aria-label="Kapat" onClick={() => setMoving(null)} type="button"><X size={20} /></button></div><form className="form-stack" onSubmit={move}><label>Yeni durum<SpSelect value={targetStatus} onChange={(event) => setTargetStatus(event.target.value as ListingStatus)}>{nextListingStatuses(moving.status).map((item) => <option value={item} key={item}>{listingStatusLabels[item]}</option>)}</SpSelect></label><label>Not <span className="optional">isteğe bağlı</span><SpTextarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Güncelleniyor…" : "Durumu kaydet"}</button></form></section></div> : null}
  </AppShell>;
}
