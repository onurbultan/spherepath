"use client";

import { useState, type FormEvent } from "react";
import { Building2, Plus, RefreshCw, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiQueryKeys, authorizationTypeLabels, authorizationTypes, currencyCodes, listingDraftSchema, listingStatusLabels,
  listingTransitionSchema, nextListingStatuses, propertyFeatureLabels, propertyFeatures, propertyTypeLabels, propertyTypes,
  type AuthorizationType, type CurrencyCode, type ListingStatus, type PropertyFeature, type PropertyType,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listOpportunities } from "@/features/opportunities/resources/opportunities";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { listListings, moveListing, saveListing, type ListingRecord } from "../resources/listings";
import { ClosingSection } from "@/features/closing/views/ClosingSection";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Portföy işlemi tamamlanamadı.";
const money = (amount: number, currency: CurrencyCode) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

export function ListingsView() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const listingsQuery = useQuery({ queryKey: apiQueryKeys.listings, queryFn: listListings });
  const opportunitiesQuery = useQuery({ queryKey: apiQueryKeys.opportunities, queryFn: listOpportunities });
  const listings = listingsQuery.data ?? [];
  const candidates = (opportunitiesQuery.data ?? []).filter((item) => item.stage === "won" && !item.propertyId && ["seller_listing", "landlord_listing"].includes(item.type));
  const [createOpen, setCreateOpen] = useState(false);
  const [moving, setMoving] = useState<ListingRecord | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState("");
  const [address, setAddress] = useState("");
  const [regionSlug, setRegionSlug] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("apartment");
  const [roomCount, setRoomCount] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [features, setFeatures] = useState<PropertyFeature[]>([]);
  const [authorizationType, setAuthorizationType] = useState<AuthorizationType>("exclusive");
  const [askingPrice, setAskingPrice] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("TRY");
  const [targetStatus, setTargetStatus] = useState<ListingStatus>("active");
  const [reason, setReason] = useState("");
  const selectedOpportunityId = opportunityId || candidates[0]?.id || "";

  async function invalidate() { await Promise.all([queryClient.invalidateQueries({ queryKey: apiQueryKeys.listings }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunities }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview })]); }
  function toggleFeature(feature: PropertyFeature) { setFeatures((current) => current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature]); }

  async function create(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    const parsed = listingDraftSchema.safeParse({ opportunityId: selectedOpportunityId, address, regionSlug, propertyType, roomCount: roomCount ? Number(roomCount) : null, areaM2: areaM2 ? Number(areaM2) : null, features, authorizationType, askingPrice: Number(askingPrice), currency, expiresAt: null });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Portföy bilgilerini kontrol et.");
    setPending(true); setError(null);
    try { await saveListing(session, parsed.data); setCreateOpen(false); setAddress(""); setRegionSlug(""); setAskingPrice(""); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  function openMove(listing: ListingRecord) { const next = nextListingStatuses(listing.status)[0]; if (!next) return; setMoving(listing); setTargetStatus(next); setReason(""); setError(null); }
  async function move(event: FormEvent) {
    event.preventDefault(); if (!session || !moving) return;
    const parsed = listingTransitionSchema.safeParse({ listingId: moving.id, toStatus: targetStatus, reason: reason.trim() || null });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Durum bilgisini kontrol et.");
    setPending(true); setError(null);
    try { await moveListing(session, parsed.data); setMoving(null); await invalidate(); }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  return <AppShell><header className="page-header contacts-header"><div><p className="eyebrow">AKTİF ENVANTER</p><h1>Portföy</h1><p className="context-sentence">Kazanılan fırsatı mülk ve yetki kaydına dönüştür, yaşam döngüsünü takip et.</p></div><button className="primary-action inline-action" disabled={!candidates.length} onClick={() => { setCreateOpen(true); setError(null); }} type="button"><Plus size={18} /> Portföy ekle</button></header>
  {error && !createOpen && !moving ? <p className="form-error notice">{error}</p> : null}
  {listingsQuery.isPending ? <div className="content-state"><RefreshCw className="spin" size={22} /> Portföyler yükleniyor…</div> : listingsQuery.error ? <p className="form-error notice">{messageFrom(listingsQuery.error)}</p> : listings.length === 0 ? <SpCard className="empty-state"><div className="card-icon secondary"><Building2 size={20} /></div><h2>Henüz portföy yok</h2><p>Bir satıcı veya kiraya veren fırsatını “Kazanıldı” aşamasına getirerek portföye dönüştür.</p></SpCard> : <section className="opportunity-grid" aria-label="Portföyler">{listings.map((listing) => <SpCard className="opportunity-card" key={listing.id}><div className="opportunity-top"><span className={`stage-badge stage-${listing.status}`}>{listingStatusLabels[listing.status]}</span><span>{authorizationTypeLabels[listing.authorizationType]}</span></div><h2>{listing.propertySummary.address}</h2><p>{listing.ownerContactName} · {propertyTypeLabels[listing.propertySummary.type]}{listing.propertySummary.roomCount !== null ? ` · ${listing.propertySummary.roomCount} oda` : ""}</p><strong>{money(listing.askingPrice, listing.currency)}</strong>{nextListingStatuses(listing.status).length ? <button className="secondary-action" onClick={() => openMove(listing)} type="button">Durumu güncelle</button> : null}</SpCard>)}</section>}
  {listings.length ? <ClosingSection listings={listings} /> : null}
  {createOpen ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setCreateOpen(false); }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">YENİ PORTFÖY</p><h2>Mülk ve yetki bilgileri</h2></div><button className="icon-action" aria-label="Kapat" onClick={() => setCreateOpen(false)} type="button"><X size={20} /></button></div><form className="form-stack" onSubmit={create}><label>Kazanılan fırsat<select value={selectedOpportunityId} onChange={(event) => setOpportunityId(event.target.value)}>{candidates.map((item) => <option key={item.id} value={item.id}>{item.subjectContactName}</option>)}</select></label><label>Adres<input value={address} onChange={(event) => setAddress(event.target.value)} /></label><label>Bölge<input placeholder="Örn. Şişli Merkez" value={regionSlug} onChange={(event) => setRegionSlug(event.target.value)} /></label><div className="form-row"><label>Mülk türü<select value={propertyType} onChange={(event) => setPropertyType(event.target.value as PropertyType)}>{propertyTypes.map((item) => <option value={item} key={item}>{propertyTypeLabels[item]}</option>)}</select></label><label>Oda sayısı<input min="0" step="0.5" type="number" value={roomCount} onChange={(event) => setRoomCount(event.target.value)} /></label><label>m²<input min="1" type="number" value={areaM2} onChange={(event) => setAreaM2(event.target.value)} /></label></div><fieldset><legend>Özellikler</legend><div className="chip-row">{propertyFeatures.map((item) => <button className={`choice-chip ${features.includes(item) ? "selected" : ""}`} key={item} onClick={() => toggleFeature(item)} type="button">{propertyFeatureLabels[item]}</button>)}</div></fieldset><div className="form-row"><label>Yetki<select value={authorizationType} onChange={(event) => setAuthorizationType(event.target.value as AuthorizationType)}>{authorizationTypes.map((item) => <option value={item} key={item}>{authorizationTypeLabels[item]}</option>)}</select></label><label>Fiyat<input min="1" type="number" value={askingPrice} onChange={(event) => setAskingPrice(event.target.value)} /></label><label>Para birimi<select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>{currencyCodes.map((item) => <option value={item} key={item}>{item}</option>)}</select></label></div>{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Kaydediliyor…" : "Portföyü oluştur"}</button></form></section></div> : null}
  {moving ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setMoving(null); }}><section className="form-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">PORTFÖY DURUMU</p><h2>{moving.propertySummary.address}</h2></div><button className="icon-action" aria-label="Kapat" onClick={() => setMoving(null)} type="button"><X size={20} /></button></div><form className="form-stack" onSubmit={move}><label>Yeni durum<select value={targetStatus} onChange={(event) => setTargetStatus(event.target.value as ListingStatus)}>{nextListingStatuses(moving.status).map((item) => <option value={item} key={item}>{listingStatusLabels[item]}</option>)}</select></label><label>Not <span className="optional">isteğe bağlı</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Güncelleniyor…" : "Durumu kaydet"}</button></form></section></div> : null}
  </AppShell>;
}
