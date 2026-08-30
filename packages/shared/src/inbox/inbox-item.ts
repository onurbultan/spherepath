import { z } from "zod";
import type { Audited, Instant, TenantOwned } from "../domain/entities.js";

export const inboxItemSources = ["typed", "voice", "whatsapp"] as const;
export const inboxItemKinds = ["note", "person", "property", "requirement", "follow_up"] as const;
export const inboxItemStatuses = ["queued", "processing", "needs_review", "applied", "failed", "archived"] as const;

export type InboxItemSource = (typeof inboxItemSources)[number];
export type InboxItemKind = (typeof inboxItemKinds)[number];
export type InboxItemStatus = (typeof inboxItemStatuses)[number];

export interface InboxAppliedAction {
  type: "classification" | "contact_created" | "location_added";
  entityId: string | null;
  label: string;
  appliedAt: Instant;
  undoneAt: Instant | null;
}

export interface InboxItem extends TenantOwned, Audited {
  source: InboxItemSource;
  safeText: string;
  summary: string;
  kind: InboxItemKind;
  status: InboxItemStatus;
  confidence: number;
  linkedContactId: string | null;
  sourceEntityId: string | null;
  appliedActions: InboxAppliedAction[];
  pinned: boolean;
  needsLocation: boolean;
  errorCode: string | null;
  archivedAt: Instant | null;
}

export interface InboxItemRecord extends InboxItem { id: string }

export const createInboxItemSchema = z.object({
  source: z.enum(inboxItemSources).default("typed"),
  text: z.string().trim().min(1, "Not boş bırakılamaz.").max(4_000, "Not en fazla 4.000 karakter olabilir."),
  linkedContactId: z.string().trim().min(1).max(160).nullable().default(null),
  requestedKind: z.enum(inboxItemKinds).nullable().default(null),
}).strict();
export type CreateInboxItemInput = z.infer<typeof createInboxItemSchema>;

export const updateInboxItemSchema = z.object({
  inboxItemId: z.string().trim().min(1).max(160),
  kind: z.enum(inboxItemKinds).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  /** Answers the card's own "Nerede?" prompt; appended to the note and reclassified. */
  location: z.string().trim().min(2, "Konum en az 2 karakter olmalı.").max(120).optional(),
}).strict().refine(
  (value) => value.kind !== undefined || value.pinned !== undefined || value.archived !== undefined || value.location !== undefined,
  "En az bir değişiklik gerekli.",
);
export type UpdateInboxItemInput = z.infer<typeof updateInboxItemSchema>;

export const inboxPageQuerySchema = z.preprocess(
  (value) => value ?? {},
  z.object({ cursor: z.string().trim().max(160).nullable().default(null), limit: z.number().int().min(1).max(50).default(30) }).strict(),
);

export const inboxItemIdSchema = z.object({ inboxItemId: z.string().trim().min(1).max(160) }).strict();

export interface InboxClassification {
  safeText: string;
  summary: string;
  kind: InboxItemKind;
  confidence: number;
  needsLocation: boolean;
  sensitiveContentMasked: boolean;
  explicitContact: { fullName: string; phone: string } | null;
}

const sensitiveSentence = /\b(hastalık|hasta|kanser|tansiyon|diyabet|depresyon|psikiyatr|engelli|hamile|ilaç|ameliyat|sağlık|müslüman|hristiyan|yahudi|alevi|sünni|ateist|mezhep|etnik|ırk|kürt|rum|ermeni|siyasi|politik|parti|sendika)\w*/iu;
const locationWords = /\b(urla|çeşme|alaçatı|güzelbahçe|seferihisar|karaburun|izmir|ankara|istanbul|mahallesi|sokak|cadde|mevki|bölge)\b/iu;
const propertyWords = /\b(ev|daire|villa|arsa|dükkan|mülk|portföy|konut|bahçeli|deniz manzaralı|oda)\b/iu;
const requirementWords = /\b(arıyor|istiyor|talep|bütçe|satın almak|kiralamak)\b/iu;
const followUpWords = /\b(ara|arayacağım|mesaj|randevu|hatırlat|takip|yarın|salı|çarşamba|perşembe|cuma|cumartesi|pazar|haftaya)\b/iu;

export function maskSensitiveInboxText(rawText: string): { text: string; masked: boolean } {
  let masked = false;
  const text = (rawText.replace(/\s+/gu, " ").trim().match(/[^.!?]+[.!?]?/gu) ?? [])
    .map((sentence) => {
      if (!sensitiveSentence.test(sentence)) return sentence.trim();
      masked = true;
      return "[HASSAS İÇERİK MASKELENDİ]";
    })
    .join(" ")
    .trim();
  return { text, masked };
}

function explicitContactFrom(text: string): InboxClassification["explicitContact"] {
  const nameMatch = text.match(/(?:kişi|isim|ad)\s*:\s*([\p{L}'’-]+(?:\s+[\p{L}'’-]+){1,3}?)\s+(?=(?:telefon|tel)\s*:)/iu);
  const phoneMatch = text.match(/(?:telefon|tel)\s*:\s*(\+?\d[\d ()-]{8,20}\d)/iu);
  if (!nameMatch?.[1] || !phoneMatch?.[1]) return null;
  return { fullName: nameMatch[1].trim(), phone: phoneMatch[1].replace(/[^+\d]/gu, "") };
}

export function classifyInboxText(rawText: string, requestedKind: InboxItemKind | null = null): InboxClassification {
  const masked = maskSensitiveInboxText(rawText);
  const text = masked.text.slice(0, 4_000);
  const explicitContact = explicitContactFrom(text);
  const hasProperty = propertyWords.test(text);
  const hasRequirement = requirementWords.test(text);
  const hasFollowUp = followUpWords.test(text);
  const hasLocation = locationWords.test(text);
  const suggestedKind: InboxItemKind = explicitContact
    ? "person"
    : hasProperty && hasRequirement
      ? "requirement"
      : hasProperty
        ? "property"
        : hasFollowUp
          ? "follow_up"
          : "note";
  const kind = requestedKind ?? suggestedKind;
  const baseConfidence = explicitContact ? 0.97 : kind === "requirement" && hasLocation ? 0.94 : kind === "property" && hasLocation ? 0.93 : kind === "follow_up" ? 0.86 : kind === "note" ? 0.7 : 0.82;
  const confidence = masked.masked ? Math.min(baseConfidence, 0.6) : baseConfidence;
  return {
    safeText: text,
    summary: text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text,
    kind,
    confidence,
    needsLocation: kind === "property" && !hasLocation,
    sensitiveContentMasked: masked.masked,
    explicitContact,
  };
}
