"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Copy, ExternalLink, Link as LinkIcon, Network, RefreshCw, Sparkles, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  moneyInputValue,
  parseMoneyInput,
  apiQueryKeys, buildMatchMessageFallback, currencyCodes, portfolioAuthorizationLabels, portfolioAuthorizationTypes, portfolioItemDraftSchema,
  portfolioSourceLabels, propertyTypeLabels, propertyTypes, titleDeedTypeLabels, titleDeedTypes,
  type CurrencyCode, type PortfolioAuthorizationType, type PortfolioItemDraft, type PortfolioSource,
  type MatchMessageDraft, type PortfolioMatchRecord, type PropertyType, type TitleDeedType,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
import { analyzePortfolioText, draftMatchMessage, listPortfolioItems, listPortfolioMatches, savePortfolioItem, withdrawPortfolioItem } from "../resources/portfolio";
import { MoneyField } from "@/shared/ui/MaskedFields";
import { SpInput, SpSelect, SpTextarea } from "@/shared/ui/SpField";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Ofis havuzu işlemi tamamlanamadı.";
const money = (amount: number, currency: CurrencyCode) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
const numberOrNull = (value: string) => value.trim() ? Number(value) : null;

function splitPortfolioMessages(raw: string): string[] {
  const normalized = raw.replace(/\r\n?/gu, "\n").trim();
  if (!normalized) return [];
  const whatsappHeader = /^(?:\[?\d{1,2}[./]\d{1,2}[./]\d{2,4}[,\s]+\d{1,2}:\d{2}(?::\d{2})?\]?\s*[-–]?\s*)[^:\n]{1,80}:\s*/u;
  const lines = normalized.split("\n");
  const groups: string[] = [];
  let current: string[] = [];
  let foundHeader = false;
  for (const line of lines) {
    if (whatsappHeader.test(line)) {
      foundHeader = true;
      if (current.join("\n").trim().length >= 10) groups.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.join("\n").trim().length >= 10) groups.push(current.join("\n").trim());
  if (foundHeader) return groups.slice(0, 10);
  return normalized.split(/\n\s*\n+/u).map((item) => item.trim()).filter((item) => item.length >= 10).slice(0, 10);
}

const matchMessageSubject = (match: PortfolioMatchRecord) => ({
  contactName: match.contactName,
  headline: match.portfolioItem.headline,
  location: match.portfolioItem.location,
  askingPrice: match.portfolioItem.askingPrice,
  listingUrl: match.portfolioItem.listingUrl,
});

function PortfolioMatchCard({ match, nearMiss = false }: { match: PortfolioMatchRecord; nearMiss?: boolean }) {
  const [copyState, setCopyState] = useState<"idle" | "drafting" | "copied" | "failed">("idle");
  const [draftText, setDraftText] = useState<string | null>(null);
  const [usedTemplate, setUsedTemplate] = useState(false);

  async function copyMessage() {
    setCopyState("drafting");
    setDraftText(null);
    // The personalised draft is a nicety; a failure must never cost the advisor the message.
    let draft: MatchMessageDraft = { message: buildMatchMessageFallback(matchMessageSubject(match)), source: "template" };
    try {
      draft = await draftMatchMessage({ contactId: match.contactId, portfolioItemId: match.portfolioItem.id });
    } catch {
      // keep the template
    }
    setUsedTemplate(draft.source === "template");
    // Shown before it is copied: this text goes to a customer over the advisor's
    // own name, and a clipboard that refuses used to take the whole draft with it.
    setDraftText(draft.message);
    setCopyState("idle");
    try {
      await navigator.clipboard.writeText(draft.message);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("failed");
    }
  }

  async function copyDraft() {
    if (!draftText) return;
    try {
      await navigator.clipboard.writeText(draftText);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("failed");
    }
  }

  const shownReasons = nearMiss
    ? [...match.reasons.filter((reason) => reason.status === "mismatch"), ...match.reasons.filter((reason) => reason.status === "match")].slice(0, 3)
    : match.reasons.filter((reason) => reason.status !== "mismatch").slice(0, 3);

  return <SpCard className={nearMiss ? "match-card is-near-miss" : "match-card"}>
    <div className="match-score"><strong>%{match.score}</strong><span>uyum</span><div className="match-progress" aria-label={`Eşleşme puanı yüzde ${match.score}`}><i style={{ width: `${match.score}%` }} /></div><em>%{match.coverage} veri</em></div>
    <h3>{match.contactName} ↔ {match.portfolioItem.headline}</h3>
    {match.situationSummary ? <p className="match-situation">Bu talebi için: {match.situationSummary}</p> : null}
    <ul>{shownReasons.map((reason) => <li className={`match-reason-${reason.status}`} key={reason.key}>{reason.status === "unknown" ? "Doğrulanmalı: " : ""}{reason.detail}</li>)}</ul>
    {draftText !== null ? <div className="match-draft">
      <label>Müşteriye gidecek mesaj<textarea className="sp-control" onChange={(event) => setDraftText(event.target.value)} rows={5} value={draftText} /></label>
      <div className="match-draft-actions">
        <button className="secondary-action compact-action" onClick={() => void copyDraft()} type="button"><Copy size={15} /> {copyState === "copied" ? "Kopyalandı" : "Kopyala"}</button>
        <button className="text-button" onClick={() => { setDraftText(null); setCopyState("idle"); }} type="button">Kapat</button>
      </div>
    </div> : null}
    {copyState === "failed" ? <p className="form-error compact-error">Panoya kopyalanamadı; metni yukarıdan seçip alabilirsiniz.</p> : null}
    {copyState === "copied" && usedTemplate ? <p className="compact-error">Kişiye özel taslak üretilemedi; standart metin kopyalandı.</p> : null}
    <div className="match-card-actions">
      <button className="secondary-action compact-action" disabled={copyState === "drafting"} onClick={() => void copyMessage()} type="button">{copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}{copyState === "drafting" ? "Taslak hazırlanıyor…" : copyState === "copied" ? "Kopyalandı" : "Mesaj taslağı"}</button>
      <Link className="secondary-action compact-action" href={`/capture?contactId=${encodeURIComponent(match.contactId)}`}>Teması kaydet</Link>
      {match.portfolioItem.listingUrl ? <a className="text-link" href={match.portfolioItem.listingUrl} rel="noreferrer" target="_blank">İlanı aç <ExternalLink size={14} /></a> : null}
    </div>
  </SpCard>;
}

export function OfficePortfolioSection({ openSignal = 0 }: { openSignal?: number }) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const itemsQuery = useQuery({ queryKey: apiQueryKeys.portfolioItems, queryFn: listPortfolioItems });
  const matchesQuery = useQuery({ queryKey: apiQueryKeys.portfolioMatches, queryFn: listPortfolioMatches });
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<PortfolioSource>("whatsapp_group");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<PortfolioItemDraft | null>(null);
  const [draftQueue, setDraftQueue] = useState<PortfolioItemDraft[]>([]);
  const [savedBatchCount, setSavedBatchCount] = useState(0);
  const [attributes, setAttributes] = useState("");
  const [pending, setPending] = useState<"analyze" | "save" | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPool, setShowPool] = useState(false);
  const previousOpenSignal = useRef(openSignal);
  const items = itemsQuery.data ?? [];
  const matches = matchesQuery.data?.matches ?? []; const nearMisses = matchesQuery.data?.nearMisses ?? [];
  const detectedMessageCount = source === "whatsapp_group" ? splitPortfolioMessages(text).length : text.trim().length >= 10 ? 1 : 0;
  const batchTotal = savedBatchCount + draftQueue.length + (draft ? 1 : 0);

  useEffect(() => {
    if (openSignal !== previousOpenSignal.current) {
      previousOpenSignal.current = openSignal;
      setOpen(true);
      setError(null);
    }
  }, [openSignal]);

  useSheetDismiss(open, () => { if (!pending) { setOpen(false); setDraft(null); setDraftQueue([]); setSavedBatchCount(0); setText(""); setAttributes(""); setError(null); } });

  function close() { if (pending) return; setOpen(false); setDraft(null); setDraftQueue([]); setSavedBatchCount(0); setText(""); setAttributes(""); setError(null); }
  function update<K extends keyof PortfolioItemDraft>(key: K, value: PortfolioItemDraft[K]) { setDraft((current) => current ? { ...current, [key]: value } : current); }

  async function analyze() {
    if (text.trim().length < 10) return setError("Portföyü anlatan en az birkaç cümle yazın.");
    setPending("analyze"); setError(null);
    try {
      const messages = source === "whatsapp_group" ? splitPortfolioMessages(text) : [text.trim()];
      const results = await Promise.all(messages.map((message) => analyzePortfolioText(message, source)));
      const [first, ...remaining] = results;
      if (!first) throw new Error("Çözümlenecek bir portföy mesajı bulunamadı.");
      setDraft(first); setDraftQueue(remaining); setSavedBatchCount(0); setAttributes(first.attributes.join(", "));
    }
    catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(null); }
  }

  async function save(event: FormEvent) {
    event.preventDefault(); if (!session || !draft) return;
    const parsed = portfolioItemDraftSchema.safeParse({ ...draft, attributes: attributes.split(",").map((item) => item.trim()).filter(Boolean) });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Portföy bilgilerini kontrol edin.");
    setPending("save"); setError(null);
    try {
      await savePortfolioItem(session, parsed.data);
      await Promise.all([queryClient.invalidateQueries({ queryKey: apiQueryKeys.portfolioItems }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.portfolioMatches })]);
      const [next, ...remaining] = draftQueue;
      if (next) {
        setDraft(next); setDraftQueue(remaining); setSavedBatchCount((count) => count + 1); setAttributes(next.attributes.join(", ")); setPending(null);
      } else {
        setOpen(false); setDraft(null); setDraftQueue([]); setSavedBatchCount(0); setText(""); setAttributes(""); setError(null); setPending(null);
      }
    } catch (nextError) { setError(messageFrom(nextError)); setPending(null); }
  }

  async function withdraw(portfolioItemId: string) {
    if (!session) return;
    setWithdrawingId(portfolioItemId); setError(null);
    try {
      await withdrawPortfolioItem(session, portfolioItemId);
      await Promise.all([queryClient.invalidateQueries({ queryKey: apiQueryKeys.portfolioItems }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.portfolioMatches })]);
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setWithdrawingId(null); }
  }

  return <section className="office-pool-section" id="office-pool" aria-labelledby="office-pool-title">
    <div className="inline-section-heading"><div><h2 id="office-pool-title">Ofis havuzu eşleşmeleri</h2><span>kayıtlı alıcı taleplerinle ortak havuzun açıklanabilir kesişimi</span></div><div className="office-pool-heading-actions"><button className="text-button" disabled={!items.length} onClick={() => setShowPool((current) => !current)} type="button">{showPool ? "Eşleşmelere dön" : `Tüm havuzu gör · ${items.length}`}</button></div></div>
    {!showPool && matches.length ? <div className="match-strip" aria-label="Uygun eşleşmeler">{matches.slice(0, 3).map((match) => <PortfolioMatchCard key={`${match.contactId}-${match.portfolioItem.id}`} match={match} />)}</div> : null}
    {!showPool && nearMisses.length ? <div className="near-miss-block"><div className="near-miss-heading"><p className="eyebrow">YAKIN AMA TAM DEĞİL</p><p className="context-sentence">Tek bir kriterde kaçırıyor. Göstermeye değer mi, kararı sende.</p></div><div className="match-strip" aria-label="Yakın eşleşmeler">{nearMisses.slice(0, 3).map((match) => <PortfolioMatchCard key={`near-${match.contactId}-${match.portfolioItem.id}`} match={match} nearMiss />)}</div></div> : null}
    {!showPool && !matches.length && items.length && !matchesQuery.isPending ? <SpCard className="office-pool-empty"><Network size={22} /><div><strong>Henüz uygun eşleşme yok</strong><p>Havuzdaki portföyler kayıtlı alıcı talepleriyle karşılaştırıldı.</p></div></SpCard> : null}
    {error && !open ? <p className="form-error notice">{error}</p> : null}{itemsQuery.isPending || matchesQuery.isPending ? <div className="content-state compact"><RefreshCw className="spin" size={20} /> Ofis havuzu taranıyor…</div> : itemsQuery.error || matchesQuery.error ? <p className="form-error notice">{messageFrom(itemsQuery.error ?? matchesQuery.error)}</p> : items.length === 0 ? <SpCard className="office-pool-empty"><Network size={22} /><div><strong>Ortak havuz henüz boş</strong><p>Bir WhatsApp portföy mesajını yapıştırarak ilk kaydı oluşturabilirsiniz.</p></div></SpCard> : null}
    {showPool && items.length ? <div className="portfolio-pool-grid">{items.slice(0, 12).map((item) => <SpCard className="pool-item-card" key={item.id}><div className="opportunity-top"><span className="stage-badge">{portfolioSourceLabels[item.source]}</span><span>{portfolioAuthorizationLabels[item.authorizationType]}</span></div><h3>{item.headline}</h3><p>{item.location} · {propertyTypeLabels[item.propertyType]}</p><strong>{item.askingPrice ? money(item.askingPrice.amount, item.askingPrice.currency) : "Fiyat belirtilmedi"}</strong><small>{item.sourceAuthorName || item.sharedByName} tarafından paylaşıldı</small><div className="pool-card-actions">{item.listingUrl ? <a className="text-link" href={item.listingUrl} rel="noreferrer" target="_blank">İlanı aç <ExternalLink size={14} /></a> : null}{session && (session.role === "broker" || session.uid === item.ownerUid) ? <button className="text-button danger" disabled={withdrawingId === item.id} onClick={() => void withdraw(item.id)} type="button">{withdrawingId === item.id ? "Kaldırılıyor…" : "Havuzdan kaldır"}</button> : null}</div></SpCard>)}</div> : null}
    {open ? <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}><section className="form-sheet wide-sheet" role="dialog" aria-modal="true"><div className="sheet-heading"><div><p className="eyebrow">ORTAK PORTFÖY</p><h2>{draft && batchTotal > 1 ? `Portföyleri incele · ${savedBatchCount + 1}/${batchTotal}` : "Mesajdan portföy oluştur"}</h2></div><button className="icon-action" aria-label="Kapat" onClick={close} type="button"><X size={20} /></button></div>
      {!draft ? <div className="form-stack"><label>Kaynak<SpSelect value={source} onChange={(event) => setSource(event.target.value as PortfolioSource)}><option value="whatsapp_group">WhatsApp grubu</option><option value="manual">Manuel not</option><option value="listing">İlan metni</option></SpSelect></label><label>{source === "whatsapp_group" ? "Portföy mesajları" : "Portföy notu"}<SpTextarea className="portfolio-note-input" placeholder="WhatsApp dışa aktarımından bir veya birden çok portföy mesajını yapıştırın. Mesajlar tarih/saat başlıklarına ya da boş satırlara göre ayrılır." value={text} onChange={(event) => setText(event.target.value)} /></label>{detectedMessageCount > 1 ? <p className="batch-detection"><Check size={15} /> {detectedMessageCount} ayrı portföy mesajı algılandı; her biri kaydetmeden önce tek tek onaylanacak.</p> : null}<p className="privacy-hint">En fazla 10 mesaj tek seferde işlenir. Orijinal mesaj saklanmaz; yalnız onayladığınız yapılandırılmış bilgiler ofis havuzuna eklenir.</p>{error ? <p className="form-error">{error}</p> : null}<button className="primary-action auth-submit" disabled={pending === "analyze" || detectedMessageCount === 0} onClick={() => void analyze()} type="button"><Sparkles size={18} /> {pending === "analyze" ? `${detectedMessageCount || 1} mesaj çözümleniyor…` : detectedMessageCount > 1 ? `${detectedMessageCount} mesajı çözümle` : "Mesajı çözümle"}</button></div>
      : <form className="form-stack" onSubmit={save}><div className="review-banner"><Sparkles size={18} /><div><strong>Yapay zekâ taslağı hazır</strong><p>Kaydetmeden önce bilgileri kontrol edip düzeltebilirsiniz.</p></div></div><label>Başlık<SpInput value={draft.headline} onChange={(event) => update("headline", event.target.value)} /></label><label>Güvenli özet<SpTextarea value={draft.summary} onChange={(event) => update("summary", event.target.value)} /></label><div className="form-row"><label>İşlem<SpSelect value={draft.transactionType} onChange={(event) => update("transactionType", event.target.value as "sell" | "let")}><option value="sell">Satılık</option><option value="let">Kiralık</option></SpSelect></label><label>Gayrimenkul türü<SpSelect value={draft.propertyType} onChange={(event) => update("propertyType", event.target.value as PropertyType)}>{propertyTypes.map((item) => <option key={item} value={item}>{propertyTypeLabels[item]}</option>)}</SpSelect></label></div><label>Konum<SpInput value={draft.location} onChange={(event) => update("location", event.target.value)} /></label><div className="form-row"><label>Fiyat<MoneyField currency={draft.askingPrice?.currency ?? "TRY"} value={moneyInputValue(draft.askingPrice?.amount)} onChange={(value) => { const amount = parseMoneyInput(value); update("askingPrice", amount === null ? null : { amount, currency: draft.askingPrice?.currency ?? "TRY" }); }} /></label><label>Para birimi<SpSelect value={draft.askingPrice?.currency ?? "TRY"} onChange={(event) => update("askingPrice", draft.askingPrice ? { ...draft.askingPrice, currency: event.target.value as CurrencyCode } : null)}>{currencyCodes.map((item) => <option key={item} value={item}>{item}</option>)}</SpSelect></label><label>Alan m²<SpInput min="0" type="number" value={(draft.propertyType === "land" ? draft.landAreaM2 : draft.areaM2) ?? ""} onChange={(event) => draft.propertyType === "land" ? update("landAreaM2", numberOrNull(event.target.value)) : update("areaM2", numberOrNull(event.target.value))} /></label></div>{draft.propertyType !== "land" ? <div className="form-row"><label>Oda<SpInput min="0" type="number" value={draft.bedroomCount ?? ""} onChange={(event) => update("bedroomCount", numberOrNull(event.target.value))} /></label><label>Salon<SpInput min="0" type="number" value={draft.livingRoomCount ?? ""} onChange={(event) => update("livingRoomCount", numberOrNull(event.target.value))} /></label></div> : null}<div className="form-row"><label>Yetki<SpSelect value={draft.authorizationType} onChange={(event) => update("authorizationType", event.target.value as PortfolioAuthorizationType)}>{portfolioAuthorizationTypes.map((item) => <option key={item} value={item}>{portfolioAuthorizationLabels[item]}</option>)}</SpSelect></label><label>Tapu<SpSelect value={draft.titleDeedType} onChange={(event) => update("titleDeedType", event.target.value as TitleDeedType)}>{titleDeedTypes.map((item) => <option key={item} value={item}>{titleDeedTypeLabels[item]}</option>)}</SpSelect></label><label>Yapılaşma<SpSelect value={draft.constructionAllowed === null ? "unknown" : String(draft.constructionAllowed)} onChange={(event) => update("constructionAllowed", event.target.value === "unknown" ? null : event.target.value === "true")}><option value="unknown">Belirsiz</option><option value="true">Uygun</option><option value="false">Uygun değil</option></SpSelect></label></div><label>Diğer özellikler<SpInput value={attributes} onChange={(event) => setAttributes(event.target.value)} placeholder="Virgülle ayırın" /></label><label>İlan bağlantısı <span className="optional">isteğe bağlı</span><div className="input-with-icon"><LinkIcon size={16} /><SpInput value={draft.listingUrl ?? ""} onChange={(event) => update("listingUrl", event.target.value.trim() || null)} /></div></label>{error ? <p className="form-error">{error}</p> : null}<div className="review-actions"><button className="secondary-action" disabled={pending !== null} onClick={() => setDraft(null)} type="button">Metne dön</button><button className="primary-action" disabled={pending === "save"} type="submit">{pending === "save" ? "Kaydediliyor…" : "Onayla ve havuza ekle"}</button></div></form>}
    </section></div> : null}
  </section>;
}
