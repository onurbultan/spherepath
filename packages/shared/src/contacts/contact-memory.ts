import { z } from "zod";
import type { Property, PropertyFeature, PropertyType, TenantOwned } from "../domain/entities.js";
import { propertyFeatures, propertyTypes } from "../listings/listing-draft.js";
import { maskSensitiveInboxText } from "../inbox/inbox-item.js";

/**
 * What the advisor knows about a person, written by the advisor. Until now the
 * only way anything reached a contact's memory was through an approved reading
 * of a note, so "adam mühendismiş, yat eğitmenliği yapmış" had nowhere to go
 * unless a model happened to pull it out of a sentence. This is the advisor
 * saying it directly.
 */
export const contactMemoryNotesSchema = z.object({
  contactId: z.string().trim().min(1).max(160),
  keyThingsToRemember: z.array(z.string().trim().min(2).max(200)).max(20),
}).strict();
export type ContactMemoryNotesInput = z.infer<typeof contactMemoryNotesSchema>;

/**
 * Special-category data under KVKK -- health, faith, ethnicity, politics, union
 * membership -- is refused rather than quietly stored or silently stripped. An
 * advisor writing it deserves to be told why it did not save, and a note whose
 * middle sentence vanished without a word is worse than one that did not save.
 *
 * Ordinary relationship knowledge is not special category and passes untouched:
 * an engineer who sells kitesurf gear and used to teach sailing stays exactly
 * as written.
 */
export function specialCategoryRefusal(value: string): string | null {
  return maskSensitiveInboxText(value).masked
    ? "Sağlık, inanç, köken, siyasi görüş ve sendika bilgisi kaydedilemez. Bu satırı bu bilgiler olmadan yaz."
    : null;
}

/** The first refusal among several lines, so the advisor is told once and clearly. */
export function firstSpecialCategoryRefusal(values: readonly string[]): string | null {
  for (const value of values) {
    const refusal = specialCategoryRefusal(value);
    if (refusal) return refusal;
  }
  return null;
}

/**
 * A property the advisor knows this person owns. No mandate is implied and none
 * is recorded: knowing that somebody has a field in Bodrum is not the same as
 * having the right to sell it, and the only way to write the first down used to
 * be to invent the second.
 */
export const knownPropertyDraftSchema = z.object({
  contactId: z.string().trim().min(1).max(160),
  /** Present when correcting a property already written down. */
  propertyId: z.string().trim().min(1).max(160).nullable().default(null),
  address: z.string().trim().min(3, "Adres en az 3 karakter olmalı.").max(500),
  regionSlug: z.string().trim().min(2, "Bölge en az 2 karakter olmalı.").max(160),
  propertyType: z.enum(propertyTypes),
  roomCount: z.number().nonnegative().max(100).nullable().default(null),
  areaM2: z.number().positive().max(1_000_000).nullable().default(null),
  features: z.array(z.enum(propertyFeatures)).max(12).default([]),
  /** Why it is worth knowing: "annesine almış", "kiraya veriyor", "yazlık". */
  note: z.string().trim().max(500).default(""),
}).strict().superRefine((value, context) => {
  const refusal = specialCategoryRefusal(value.note);
  if (refusal) context.addIssue({ code: "custom", message: refusal, path: ["note"] });
});
export type KnownPropertyDraft = z.infer<typeof knownPropertyDraftSchema>;

export interface KnownPropertyRecord extends Property {
  id: string;
  /** True once a mandate exists for it, so the card can send the advisor there. */
  hasListing: boolean;
}

export function createKnownProperty(draft: KnownPropertyDraft, tenant: TenantOwned, now: number): Property {
  const parsed = knownPropertyDraftSchema.parse(draft);
  return {
    ...tenant,
    ownerContactId: parsed.contactId,
    address: parsed.address,
    regionSlug: parsed.regionSlug.toLocaleLowerCase("tr-TR").replace(/\s+/gu, "-").replace(/[^a-z0-9çğıöşü-]/gu, ""),
    geo: null,
    geohash: null,
    type: parsed.propertyType,
    roomCount: parsed.propertyType === "land" ? null : parsed.roomCount,
    areaM2: parsed.areaM2,
    features: parsed.features as PropertyFeature[],
    note: parsed.note || null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** A short line for a card: "Bodrum · Villa · 4+1 · 220 m²". */
export function knownPropertySummary(
  property: Pick<Property, "regionSlug" | "type" | "roomCount" | "areaM2">,
  typeLabels: Record<PropertyType, string>,
): string {
  const region = property.regionSlug.replace(/-/gu, " ");
  const parts = [region, typeLabels[property.type]];
  if (property.roomCount !== null) parts.push(`${property.roomCount} oda`);
  if (property.areaM2 !== null) parts.push(`${property.areaM2} m²`);
  return parts.filter(Boolean).join(" · ");
}
