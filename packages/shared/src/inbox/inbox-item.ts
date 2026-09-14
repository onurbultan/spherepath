import { z } from "zod";
import type { Audited, Instant, OpportunityType, TenantOwned } from "../domain/entities.js";
import { contactDraftSchema } from "../contacts/contact-draft.js";
import { nextActionTypeLabels, nextActionTypes } from "../interactions/manual-interaction.js";
import { opportunityCriteriaSummary, opportunityTransactionType } from "../opportunities/opportunity-situation.js";
import { opportunityTypes } from "../opportunities/opportunity-draft.js";
import { portfolioItemDraftSchema, type PortfolioItemDraft } from "../matching/portfolio-match.js";
import type { NoteSegmentReading } from "./note-segments.js";
import { voiceInsightsSchema, type VoiceInsights } from "../voice/voice-note.js";

/**
 * A note used to be one thought, so 4,000 characters was generous. A day's
 * notebook page is a different object -- people, portfolios, things to do and
 * doors to knock on, all on one page -- and the import pipeline already
 * accepts notes this long from a phone.
 */
export const noteMaxLength = 20_000;

export const inboxItemSources = ["typed", "voice", "whatsapp"] as const;
export const inboxItemKinds = ["note", "person", "property", "requirement", "follow_up"] as const;
export const inboxItemStatuses = ["queued", "processing", "needs_review", "applied", "failed", "archived"] as const;

export type InboxItemSource = (typeof inboxItemSources)[number];
export type InboxItemKind = (typeof inboxItemKinds)[number];
export type InboxItemStatus = (typeof inboxItemStatuses)[number];

export interface InboxAppliedAction {
  type: "classification" | "contact_created" | "contact_linked" | "location_added" | "interaction_created" | "opportunity_created" | "portfolio_created" | "listing_created" | "follow_up_scheduled";
  entityId: string | null;
  label: string;
  appliedAt: Instant;
  undoneAt: Instant | null;
}

/**
 * A note that has produced a real record is finished work. Classifying it is
 * not: that is the system labelling the text, which happens to every note and
 * leaves nothing behind. Without this distinction the active list keeps every
 * note ever written, each still offering to be processed, and an advisor who
 * captures a dozen calls a day stops opening it within the week.
 */
const resolvingActionTypes = new Set<InboxAppliedAction["type"]>([
  "contact_created", "contact_linked", "interaction_created", "opportunity_created",
  "portfolio_created", "listing_created", "follow_up_scheduled",
]);

export function isInboxItemResolved(item: Pick<InboxItem, "appliedActions">): boolean {
  return item.appliedActions.some((action) => action.undoneAt === null && resolvingActionTypes.has(action.type));
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
  /**
   * What the model made of the note. The deterministic classification that runs
   * on save gives the card a type and a summary; this is the reading that finds
   * the person, the property and the requirement inside one sentence, and it
   * arrives a few seconds later so the save itself stays instant.
   */
  analysis: InboxItemAnalysis | null;
  /**
   * The page cut into the items it actually holds, each with its own reading.
   * Null for a note read before segmentation existed, and for one the reading
   * failed on. A note carrying a single thought still gets one segment, so the
   * review has one shape rather than two.
   */
  segments?: NoteSegmentReading[] | null;
  analysisStatus: "pending" | "ready" | "failed";
  errorCode: string | null;
  archivedAt: Instant | null;
}

export interface InboxItemRecord extends InboxItem { id: string }

export const createInboxItemSchema = z.object({
  source: z.enum(inboxItemSources).default("typed"),
  text: z.string().trim().min(1, "Not boş bırakılamaz.").max(noteMaxLength, "Not en fazla 20.000 karakter olabilir."),
  linkedContactId: z.string().trim().min(1).max(160).nullable().default(null),
  requestedKind: z.enum(inboxItemKinds).nullable().default(null),
}).strict();
export type CreateInboxItemInput = z.infer<typeof createInboxItemSchema>;

export const updateInboxItemSchema = z.object({
  inboxItemId: z.string().trim().min(1).max(160),
  text: z.string().trim().min(1, "Not boş bırakılamaz.").max(noteMaxLength, "Not en fazla 20.000 karakter olabilir.").optional(),
  kind: z.enum(inboxItemKinds).optional(),
  linkedContactId: z.string().trim().min(1).max(160).nullable().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  /** Answers the card's own "Nerede?" prompt; appended to the note and reclassified. */
  location: z.string().trim().min(2, "Konum en az 2 karakter olmalı.").max(120).optional(),
}).strict().refine(
  (value) => value.text !== undefined || value.kind !== undefined || value.linkedContactId !== undefined || value.pinned !== undefined || value.archived !== undefined || value.location !== undefined,
  "En az bir değişiklik gerekli.",
);
export type UpdateInboxItemInput = z.infer<typeof updateInboxItemSchema>;

const processBaseSchema = z.object({ inboxItemId: z.string().trim().min(1).max(160) });

export const processInboxItemSchema = z.discriminatedUnion("action", [
  processBaseSchema.extend({
    action: z.literal("person"),
    contact: contactDraftSchema,
    /** The advisor-approved reading is applied atomically with the new contact. */
    approvedInsights: voiceInsightsSchema.optional(),
    /** A conversation note is a real interaction unless the advisor explicitly says otherwise. */
    recordInteraction: z.boolean().default(true),
    /** One note can create the person and the qualified work it describes. */
    opportunityType: z.enum(opportunityTypes).nullable().default(null),
  }),
  processBaseSchema.extend({
    action: z.literal("requirement"),
    contactId: z.string().trim().min(1).max(160),
    opportunityType: z.enum(opportunityTypes).refine((value) => value === "buyer_requirement" || value === "tenant_requirement"),
    nextActionType: z.enum(nextActionTypes),
    nextActionAt: z.number().int().positive(),
    approvedInsights: voiceInsightsSchema,
  }),
  processBaseSchema.extend({ action: z.literal("portfolio"), contactId: z.string().trim().min(1).max(160).nullable(), portfolio: portfolioItemDraftSchema }),
  processBaseSchema.extend({
    action: z.literal("follow_up"),
    contactId: z.string().trim().min(1).max(160),
    nextActionType: z.enum(nextActionTypes),
    nextActionAt: z.number().int().positive(),
  }),
]).superRefine((value, context) => {
  if ((value.action === "requirement" || value.action === "follow_up") && value.nextActionAt < Date.now() - 60_000) {
    context.addIssue({ code: "custom", message: "Takip zamanı geçmişte olamaz.", path: ["nextActionAt"] });
  }
  if (value.action === "person" && value.opportunityType !== null
    && (value.contact.nextActionType == null || value.contact.nextActionAt == null)) {
    context.addIssue({
      code: "custom",
      message: "Fırsat oluşturmak için ilk takip ve zamanı gerekli.",
      path: ["contact", "nextActionAt"],
    });
  }
});

export type ProcessInboxItemInput = z.infer<typeof processInboxItemSchema>;

export const analyzeInboxItemSchema = z.object({
  inboxItemId: z.string().trim().min(1).max(160),
}).strict();
export type AnalyzeInboxItemInput = z.infer<typeof analyzeInboxItemSchema>;

export interface InboxItemAnalysis {
  insights: VoiceInsights;
  nextActionType: (typeof nextActionTypes)[number] | null;
  nextActionAt: number | null;
  opportunityType: OpportunityType;
  engine: "rules" | "vertex_ai";
  /**
   * A property note used to wait for its reading until the advisor opened the
   * sheet and asked for it, which put a model round trip in front of the one
   * action they came to take. The trigger now reads the property at the same
   * time as the person, so the sheet opens on a draft. Null when the note is
   * not about a property, or when that reading failed.
   */
  portfolio?: PortfolioItemDraft | null;
}

/**
 * What the card can say it understood. One phone call routinely holds a person,
 * a property being sold and a property being sought; the type picker could only
 * ever name one of them, so the card showed a label and a form instead of the
 * reading. Each situation carries its own sentence already -- that is the chip.
 */
/**
 * What the note turned into. "İşlendi" told the advisor the work was done but
 * not what it produced, so answering "what did I do with that note?" meant
 * going to the contact list and searching for a name.
 */
export function inboxItemTrace(item: Pick<InboxItem, "appliedActions">): Array<{ label: string; kind: InboxAppliedAction["type"]; entityId: string | null }> {
  return item.appliedActions
    .filter((action) => action.undoneAt === null && action.type !== "classification")
    .map((action) => ({ label: action.label, kind: action.type, entityId: action.entityId }));
}

/**
 * A short note often reads back as its own summary, and the card then printed
 * the same sentence twice -- once as the note and once as what was understood
 * from it. `noteText` lets the caller drop that echo; the reading is only worth
 * showing where it adds something the note does not already say.
 */
export function inboxAnalysisHighlights(analysis: InboxItemAnalysis | null, noteText?: string): string[] {
  if (!analysis) return [];
  const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/[\s.,;:!?…]+/gu, " ").trim();
  const echo = noteText ? normalize(noteText) : null;
  const isEcho = (value: string) => echo !== null && normalize(value) === echo;
  const situations = analysis.insights.propertySituations
    .map((situation) => situation.summary.trim())
    .filter((summary) => Boolean(summary) && !isEcho(summary));
  const remembered = situations.length ? [] : analysis.insights.keyThingsToRemember.filter((item) => !isEcho(item)).slice(0, 2);
  const next = analysis.nextActionType ? [`Sonraki: ${nextActionTypeLabels[analysis.nextActionType]}`] : [];
  return [...situations, ...remembered, ...next].slice(0, 4);
}

/**
 * A typed or dictated conversation note that names an unlinked person should
 * open as a person workflow once the richer reading arrives. WhatsApp group
 * posts often name third parties, so they keep their original classification.
 */
export function inboxKindAfterAnalysis(
  currentKind: InboxItemKind,
  source: InboxItemSource,
  linkedContactId: string | null,
  analysis: InboxItemAnalysis,
): InboxItemKind {
  if (source !== "whatsapp" && linkedContactId === null && analysis.insights.contactName?.trim()) return "person";
  return currentKind;
}

/** Derive the work type from the active preference or, for a single property
 * being sold/let, from its structured situation. */
export function inboxOpportunityType(insights: VoiceInsights): OpportunityType {
  const transaction = insights.propertyPreferences.transactionType
    ?? insights.propertySituations[0]?.propertyPreferences.transactionType
    ?? null;
  if (transaction === "rent") return "tenant_requirement";
  if (transaction === "sell") return "seller_listing";
  if (transaction === "let") return "landlord_listing";
  return "buyer_requirement";
}

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

/**
 * Masking used to flatten every newline into a space, which was harmless while
 * a note was one thought. A day's notebook is not: the advisor's own line
 * breaks and blank lines are what separate one person from the next, and one
 * heading from the list under it. Sentences are still masked one at a time --
 * the shape of the page is simply not collateral damage any more.
 */
export function maskSensitiveInboxText(rawText: string): { text: string; masked: boolean } {
  let masked = false;
  const maskLine = (line: string): string => {
    const collapsed = line.replace(/[^\S\n]+/gu, " ").trim();
    if (!collapsed) return "";
    return (collapsed.match(/[^.!?]+[.!?]?/gu) ?? [])
      .map((sentence) => {
        if (!sensitiveSentence.test(sentence)) return sentence.trim();
        masked = true;
        return "[HASSAS İÇERİK MASKELENDİ]";
      })
      .join(" ")
      .trim();
  };
  const text = rawText
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map(maskLine)
    // Any run of blank lines is one separator; more than that is just the gap
    // someone left while typing.
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
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
  const text = masked.text.slice(0, noteMaxLength);
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

/** Only explicit labels or an unambiguous named caller introduce a person. */
export function inboxContactName(text: string): string {
  const safe = maskSensitiveInboxText(text).text;
  const labeled = safe.match(/(?:kişi|isim|ad)\s*:\s*([\p{L}'’-]+(?:\s+[\p{L}'’-]+){1,3}?)(?=\s+(?:telefon|tel)\s*:|[.!?]|$)/iu);
  const caller = safe.match(/^([\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+){1,3})\s+(?:(?:bugün|dün)\s+)?(?:aradı|ile görüştüm|ile konuştum)(?=\s|[.!?]|$)/u);
  return (labeled?.[1] ?? caller?.[1] ?? "").trim();
}

/** A phone is independent of how the note introduced the person's name. */
export function inboxContactPhone(text: string): string {
  const safe = maskSensitiveInboxText(text).text;
  return safe.match(/(?:telefon|tel)\s*:\s*(\+?\d[\d ()-]{8,20}\d)/iu)?.[1]?.replace(/[^+\d]/gu, "") ?? "";
}

/** The reviewed primary requirement supersedes its original extracted situation. */
export function reviewedInboxInsights(insights: VoiceInsights, type: OpportunityType): VoiceInsights {
  const owner = type === "seller_listing" || type === "landlord_listing";
  if (owner) return insights;
  const propertyContext = "search_preference" as const;
  const preferences = { ...insights.propertyPreferences, transactionType: opportunityTransactionType(type) };
  const situation = { propertyContext, propertyPreferences: preferences, summary: opportunityCriteriaSummary(type, preferences) };
  return {
    ...insights, propertyContext, propertyPreferences: preferences,
    propertySituations: [situation, ...insights.propertySituations.filter((entry) => entry.propertyContext !== propertyContext)].slice(0, 3),
  };
}

export const inboxReviewCopy = {
  newContact: "Yeni kişiyi burada oluştur",
  existingContact: "Mevcut kişiyi seç",
  createRequirement: "Kişi, görüşme ve talebi oluştur",
  locationRequired: "Bölge olmazsa olmaz",
  analyzing: "Kişi, talep ve takip bilgileri çıkarılıyor…",
  budgetMin: "Asgari bütçe",
  budgetMax: "Azami bütçe",
  areaMin: "Minimum m²",
  areaMax: "Maksimum m²",
} as const;
