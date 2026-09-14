"use client";

import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  apiQueryKeys,
  contributionKindLabels,
  contributionSummaryLine,
  summariseContributions,
  firstSpecialCategoryRefusal,
  knownPropertyDraftSchema,
  knownPropertySummary,
  propertyFeatureLabels,
  propertyFeatures,
  propertyTypeLabels,
  propertyTypes,
  specialCategoryRefusal,
  type ContactMemory,
  type KnownPropertyRecord,
  type PropertyFeature,
  type PropertyType,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { SpInput, SpSelect, SpTextarea, handleFormKeyDown } from "@/shared/ui/SpField";
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
import {
  archiveKnownProperty,
  listContributions,
  listKnownProperties,
  saveContactMemory,
  saveKnownProperty,
} from "../resources/contacts";

const numberOrNull = (value: string): number | null => value.trim() ? Number(value) : null;

/** Land has no rooms, and a form that asks for them invites a number nobody meant. */
const featuresForType = (type: PropertyType): readonly PropertyFeature[] =>
  type === "land" ? ["garden", "gated_community"] : propertyFeatures;

interface PropertyForm {
  propertyId: string | null;
  address: string;
  regionSlug: string;
  propertyType: PropertyType;
  roomCount: string;
  areaM2: string;
  features: PropertyFeature[];
  note: string;
}

const emptyProperty: PropertyForm = {
  propertyId: null, address: "", regionSlug: "", propertyType: "apartment",
  roomCount: "", areaM2: "", features: [], note: "",
};

function formFor(property: KnownPropertyRecord): PropertyForm {
  return {
    propertyId: property.id,
    address: property.address,
    regionSlug: property.regionSlug.replace(/-/gu, " "),
    propertyType: property.type,
    roomCount: property.roomCount === null ? "" : String(property.roomCount),
    areaM2: property.areaM2 === null ? "" : String(property.areaM2),
    features: property.features,
    note: property.note ?? "",
  };
}

/**
 * What the advisor knows about this person, and what they own. Both used to be
 * writable only by an approved reading of a note, which meant a fact the
 * advisor simply knew -- that somebody teaches sailing, that somebody has a
 * field in Bodrum -- had nowhere to go without inventing a conversation or a
 * mandate to carry it.
 */
export function ContactKnowledgePanel({ contactId, memory }: { contactId: string; memory: ContactMemory }) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const propertiesQuery = useQuery({
    queryKey: apiQueryKeys.knownProperties(contactId),
    queryFn: () => listKnownProperties(contactId),
  });
  const contributionsQuery = useQuery({
    queryKey: apiQueryKeys.contributions(contactId),
    queryFn: () => listContributions(contactId),
  });

  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [propertyForm, setPropertyForm] = useState<PropertyForm | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSheetDismiss(notesOpen, () => setNotesOpen(false));
  useSheetDismiss(propertyForm !== null, () => setPropertyForm(null));

  function openNotes() {
    setNotes(memory.keyThingsToRemember.join("\n"));
    setError(null);
    setNotesOpen(true);
  }

  async function submitNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const lines = notes.split("\n").map((line) => line.trim()).filter((line) => line.length >= 2).slice(0, 20);
    const refusal = firstSpecialCategoryRefusal(lines);
    if (refusal) return setError(refusal);
    setPending(true); setError(null);
    try {
      await saveContactMemory(session, { contactId, keyThingsToRemember: lines });
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts });
      setNotesOpen(false);
    } catch (next) { setError(next instanceof Error ? next.message : "Hafıza kaydedilemedi."); }
    finally { setPending(false); }
  }

  async function submitProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !propertyForm) return;
    const parsed = knownPropertyDraftSchema.safeParse({
      contactId,
      propertyId: propertyForm.propertyId,
      address: propertyForm.address,
      regionSlug: propertyForm.regionSlug,
      propertyType: propertyForm.propertyType,
      roomCount: numberOrNull(propertyForm.roomCount),
      areaM2: numberOrNull(propertyForm.areaM2),
      features: propertyForm.features,
      note: propertyForm.note,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Mülk bilgilerini kontrol et.");
    setPending(true); setError(null);
    try {
      await saveKnownProperty(session, parsed.data);
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.knownProperties(contactId) });
      setPropertyForm(null);
    } catch (next) { setError(next instanceof Error ? next.message : "Mülk kaydedilemedi."); }
    finally { setPending(false); }
  }

  async function removeProperty(property: KnownPropertyRecord) {
    if (!session) return;
    setPending(true); setError(null);
    try {
      await archiveKnownProperty(session, property.id);
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.knownProperties(contactId) });
    } catch (next) { setError(next instanceof Error ? next.message : "Mülk kaldırılamadı."); }
    finally { setPending(false); }
  }

  const properties = propertiesQuery.data ?? [];
  const noteRefusal = specialCategoryRefusal(propertyForm?.note ?? "");

  const contributions = contributionsQuery.data ?? [];
  const ledger = summariseContributions(contributions);
  const ledgerLine = contributionSummaryLine(ledger);

  return (
    <>
      {/* Who actually brings work is the question that decides who gets called
          back, and the count for it lived in the database and nowhere else. */}
      <SpCard className="contact-workspace-panel">
        <div className="knowledge-heading">
          <h2>Sana kazandırdıkları</h2>
          {ledgerLine ? <strong className="contribution-total">{ledgerLine}</strong> : null}
        </div>
        {contributions.length ? (
          <ul className="contribution-list">
            {contributions.slice(0, 8).map((entry) => (
              <li key={entry.id}>
                <span className="contribution-kind">{contributionKindLabels[entry.kind]}</span>
                <span>{entry.note}</span>
                <time>{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(entry.occurredAt)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="privacy-copy">Günlük notta bu kişiyi @ ile etiketlediğinde, kazandırdığı portföy ve müşteriler burada birikir.</p>
        )}
      </SpCard>

      <SpCard className="contact-workspace-panel">
        <div className="knowledge-heading">
          <h2>Hatırlanacaklar</h2>
          <button className="text-button" onClick={openNotes} type="button"><Pencil size={14} /> Düzenle</button>
        </div>
        {memory.keyThingsToRemember.length
          ? <ul>{memory.keyThingsToRemember.map((item) => <li key={item}>{item}</li>)}</ul>
          : <p className="privacy-copy">Bu kişi hakkında bildiklerini buraya yazabilirsin — mesleği, ilgi alanı, sana ne dediği.</p>}
      </SpCard>

      <SpCard className="contact-workspace-panel">
        <div className="knowledge-heading">
          <h2>Bildiğin gayrimenkuller</h2>
          <button className="text-button" onClick={() => { setError(null); setPropertyForm(emptyProperty); }} type="button"><Plus size={14} /> Mülk ekle</button>
        </div>
        <p className="privacy-copy">Bu kayıtlar yetki anlamına gelmez. Yetki aldığında portföy ekranından portföye dönüştürürsün.</p>
        {propertiesQuery.isPending ? <p>Yükleniyor…</p> : properties.length ? (
          <ul className="known-property-list">
            {properties.map((property) => (
              <li key={property.id}>
                <span className="known-property-icon"><Building2 size={16} aria-hidden /></span>
                <span>
                  <strong>{property.address}</strong>
                  <small>{knownPropertySummary(property, propertyTypeLabels)}</small>
                  {property.note ? <small>{property.note}</small> : null}
                  {property.hasListing ? <small className="known-property-listed">Yetkili portföyü var</small> : null}
                </span>
                <span className="known-property-actions">
                  <button aria-label={`${property.address} bilgisini düzenle`} className="icon-action" disabled={pending} onClick={() => { setError(null); setPropertyForm(formFor(property)); }} type="button"><Pencil size={15} /></button>
                  {property.hasListing ? null : <button aria-label={`${property.address} kaydını kaldır`} className="icon-action" disabled={pending} onClick={() => void removeProperty(property)} type="button"><Trash2 size={15} /></button>}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="privacy-copy">Henüz kayıtlı mülk yok.</p>}
        {error && !notesOpen && !propertyForm ? <p className="form-error" role="alert">{error}</p> : null}
      </SpCard>

      {notesOpen ? (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) setNotesOpen(false); }}>
          <section className="form-sheet" role="dialog" aria-modal="true" aria-labelledby="memory-notes-title">
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">KİŞİ HAFIZASI</p>
                <h2 id="memory-notes-title">Bu kişi hakkında bildiklerin</h2>
                <p className="privacy-copy">Her satır ayrı bir bilgi. Sağlık, inanç, köken, siyasi görüş ve sendika bilgisi kaydedilemez.</p>
              </div>
              <button className="icon-action" aria-label="Kapat" disabled={pending} onClick={() => setNotesOpen(false)} type="button"><X size={20} /></button>
            </div>
            <form onKeyDown={handleFormKeyDown} className="form-stack" onSubmit={submitNotes}>
              <label>Hatırlanacaklar<SpTextarea rows={8} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={"Mühendis, üç boyutlu printer'ı var\nKite sörf malzemesi satıyor\nYat konusunda mutlaka sor dedi"} /></label>
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Kaydediliyor…" : "Kaydet"}</button>
            </form>
          </section>
        </div>
      ) : null}

      {propertyForm ? (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) setPropertyForm(null); }}>
          <section className="form-sheet" role="dialog" aria-modal="true" aria-labelledby="known-property-title">
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">BİLİNEN GAYRİMENKUL</p>
                <h2 id="known-property-title">{propertyForm.propertyId ? "Mülk bilgisini düzelt" : "Bu kişinin sahip olduğu bir mülk"}</h2>
                <p className="privacy-copy">Yetki anlamına gelmez; sadece bildiğini kaydeder.</p>
              </div>
              <button className="icon-action" aria-label="Kapat" disabled={pending} onClick={() => setPropertyForm(null)} type="button"><X size={20} /></button>
            </div>
            <form onKeyDown={handleFormKeyDown} className="form-stack" onSubmit={submitProperty}>
              <label>Adres veya tanım<SpInput required value={propertyForm.address} onChange={(event) => setPropertyForm({ ...propertyForm, address: event.target.value })} placeholder="Örn. Kadıovacık mevkii, 4 dönüm tarla" /></label>
              <label>Bölge<SpInput required value={propertyForm.regionSlug} onChange={(event) => setPropertyForm({ ...propertyForm, regionSlug: event.target.value })} placeholder="Örn. Çeşme Altı" /></label>
              <div className="form-row">
                <label>Mülk türü<SpSelect value={propertyForm.propertyType} onChange={(event) => setPropertyForm({ ...propertyForm, propertyType: event.target.value as PropertyType, features: [] })}>{propertyTypes.map((type) => <option key={type} value={type}>{propertyTypeLabels[type]}</option>)}</SpSelect></label>
                {propertyForm.propertyType !== "land" ? <label>Oda<SpInput min="0" step="0.5" type="number" value={propertyForm.roomCount} onChange={(event) => setPropertyForm({ ...propertyForm, roomCount: event.target.value })} /></label> : null}
                <label>{propertyForm.propertyType === "land" ? "Arsa alanı m²" : "m²"}<SpInput min="1" type="number" value={propertyForm.areaM2} onChange={(event) => setPropertyForm({ ...propertyForm, areaM2: event.target.value })} /></label>
              </div>
              <fieldset>
                <legend>Özellikler</legend>
                <div className="chip-row">
                  {featuresForType(propertyForm.propertyType).map((feature) => (
                    <button className={`choice-chip ${propertyForm.features.includes(feature) ? "selected" : ""}`} key={feature} type="button"
                      onClick={() => setPropertyForm({ ...propertyForm, features: propertyForm.features.includes(feature) ? propertyForm.features.filter((item) => item !== feature) : [...propertyForm.features, feature] })}>
                      {propertyFeatureLabels[feature]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label>Not <span className="optional">isteğe bağlı</span><SpInput value={propertyForm.note} onChange={(event) => setPropertyForm({ ...propertyForm, note: event.target.value })} placeholder="Örn. Annesine almış, şu an boş" /></label>
              {noteRefusal ? <p className="privacy-hint compliance-warning">{noteRefusal}</p> : null}
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <button className="primary-action auth-submit" disabled={pending || noteRefusal !== null} type="submit">{pending ? "Kaydediliyor…" : <><Check size={17} /> Kaydet</>}</button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
