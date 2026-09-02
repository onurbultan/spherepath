// ../../../../../private/tmp/claude-501/-Users-onurbultan-Documents-WebProjects-spherepath/06b2f227-c703-45c4-9bf0-6cb77534813f/scratchpad/repro4.ts
import { execFileSync } from "node:child_process";
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";
import { OAuth2Client } from "google-auth-library";

// functions/src/voice/vertex-extraction.ts
import { GoogleGenAI } from "@google/genai";
import { logger } from "firebase-functions";
import { defineString } from "firebase-functions/params";

// packages/shared/src/calls/call-record.ts
import { z } from "zod";
var listCallsSchema = z.object({
  contactId: z.string().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50)
}).strict();
var startContactCallSchema = z.object({
  contactId: z.string().min(1).max(160)
}).strict();

// packages/shared/src/contacts/contact-draft.ts
import { z as z5 } from "zod";

// packages/shared/src/voice/voice-note.ts
import { z as z4 } from "zod";

// packages/shared/src/interactions/manual-interaction.ts
import { z as z2 } from "zod";
var interactionChannels = ["in_person", "phone", "whatsapp", "sms", "email", "other"];
var interactionObjectives = [
  "get_acquainted",
  "provide_value",
  "permission",
  "appointment",
  "request_referral",
  "request_listing",
  "follow_up",
  "presentation",
  "offer"
];
var askOutcomes = ["positive", "unclear", "negative", "not_asked", "not_applicable"];
var nextActionTypes = ["call", "message", "appointment", "valuation", "offer", "complete_permission", "make_ask", "other"];
var manualInteractionSchema = z2.object({
  contactId: z2.string().min(1).max(160),
  channel: z2.enum(interactionChannels),
  objective: z2.enum(interactionObjectives),
  direction: z2.enum(["outbound", "inbound", "mutual"]),
  outcome: z2.string().trim().min(2, "Sonu\xE7 en az 2 karakter olmal\u0131.").max(500),
  askOutcome: z2.enum(askOutcomes),
  nextActionType: z2.enum(nextActionTypes).nullable(),
  nextActionAt: z2.number().int().positive().nullable(),
  noteSummary: z2.string().trim().max(1e3),
  /** When the conversation actually happened; null falls back to the moment it is recorded. */
  occurredAt: z2.number().int().positive().nullable().optional()
}).strict().superRefine((value, context) => {
  if (value.nextActionType === null !== (value.nextActionAt === null)) {
    context.addIssue({
      code: "custom",
      message: "Sonraki aksiyon t\xFCr\xFC ve tarihi birlikte se\xE7ilmeli.",
      path: [value.nextActionType === null ? "nextActionType" : "nextActionAt"]
    });
  }
});
var maxInteractionBackdateMs = 30 * 864e5;

// packages/shared/src/opportunities/opportunity-draft.ts
import { z as z3 } from "zod";
var opportunityTypes = ["seller_listing", "landlord_listing", "buyer_requirement", "tenant_requirement"];
var opportunityStages = ["new_lead", "first_contact", "appointment", "valuation", "mandate_offer", "won", "lost"];
var opportunityDraftSchema = z3.object({
  subjectContactId: z3.string().min(1).max(160),
  type: z3.enum(opportunityTypes),
  nextActionType: z3.enum(nextActionTypes),
  nextActionAt: z3.number().int().positive()
}).strict();

// packages/shared/src/voice/voice-note.ts
var propertyTransactionTypes = ["buy", "sell", "rent", "let", "invest"];
var voicePropertyTypes = ["apartment", "villa", "detached_house", "land", "commercial"];
var voicePropertyContexts = ["search_preference", "subject_property"];
var voicePropertyPreferencesSchema = z4.object({
  transactionType: z4.enum(propertyTransactionTypes).nullable(),
  propertyTypes: z4.array(z4.enum(voicePropertyTypes)).max(5),
  preferredLocations: z4.array(z4.string().trim().min(1).max(120)).max(8),
  budgetRange: z4.object({
    min: z4.number().nonnegative().nullable(),
    max: z4.number().positive().nullable(),
    currency: z4.enum(["TRY", "GBP", "USD", "EUR"])
  }).strict().nullable(),
  bedroomCountMin: z4.number().nonnegative().max(100).nullable().default(null),
  livingRoomCountMin: z4.number().nonnegative().max(20).nullable().default(null),
  /** @deprecated Kept while existing contact memories migrate to bedroom/living-room counts. */
  roomCountMin: z4.number().nonnegative().max(100).nullable(),
  areaMinM2: z4.number().positive().max(1e5).nullable(),
  areaMaxM2: z4.number().positive().max(1e5).nullable().default(null),
  mustHaves: z4.array(z4.string().trim().min(1).max(160)).max(8),
  dealBreakers: z4.array(z4.string().trim().min(1).max(160)).max(8),
  timeline: z4.string().trim().min(1).max(180).nullable()
}).strict().superRefine((value, context) => {
  const budget = value.budgetRange;
  if (budget?.min !== null && budget?.min !== void 0 && budget.max !== null && budget.max < budget.min) {
    context.addIssue({ code: "custom", message: "Maximum budget cannot be lower than minimum budget.", path: ["budgetRange", "max"] });
  }
  if (value.areaMinM2 !== null && value.areaMaxM2 !== null && value.areaMaxM2 < value.areaMinM2) {
    context.addIssue({ code: "custom", message: "Maximum area cannot be lower than minimum area.", path: ["areaMaxM2"] });
  }
});
var emptyVoicePropertyPreferences = {
  transactionType: null,
  propertyTypes: [],
  preferredLocations: [],
  budgetRange: null,
  bedroomCountMin: null,
  livingRoomCountMin: null,
  roomCountMin: null,
  areaMinM2: null,
  areaMaxM2: null,
  mustHaves: [],
  dealBreakers: [],
  timeline: null
};
var voicePropertySituationSchema = z4.object({
  propertyContext: z4.enum(voicePropertyContexts),
  summary: z4.string().trim().min(2).max(240),
  propertyPreferences: voicePropertyPreferencesSchema
}).strict();
var voiceInsightsSchema = z4.object({
  keyThingsToRemember: z4.array(z4.string().trim().min(2).max(180)).max(8),
  propertyContext: z4.enum(voicePropertyContexts).nullable().default(null),
  propertyPreferences: voicePropertyPreferencesSchema,
  propertySituations: z4.array(voicePropertySituationSchema).max(3).default([]),
  suggestedActionReason: z4.string().trim().min(2).max(240).nullable()
}).strict();
var emptyVoiceInsights = {
  keyThingsToRemember: [],
  propertyContext: null,
  propertyPreferences: emptyVoicePropertyPreferences,
  propertySituations: [],
  suggestedActionReason: null
};
var maxContactPropertySituations = 3;
var contactMemorySchema = z4.object({
  keyThingsToRemember: z4.array(z4.string().trim().min(2).max(180)).max(12),
  propertyPreferences: voicePropertyPreferencesSchema,
  // Defaulted so contacts stored before situations existed still parse.
  propertySituations: z4.array(voicePropertySituationSchema).max(maxContactPropertySituations).default([]),
  updatedAt: z4.number().int().positive().nullable()
}).strict();
var registerVoiceNoteSchema = z4.object({
  contactId: z4.string().min(1).max(160),
  storagePath: z4.string().min(1).max(500),
  durationMs: z4.number().int().min(5e3).max(9e4),
  mimeType: z4.enum(["audio/mp4", "audio/m4a", "audio/webm", "audio/wav", "audio/x-wav"]),
  conversationEndedConfirmed: z4.literal(true),
  emulatorTranscript: z4.string().trim().min(2).max(4e3).optional()
}).strict();
var registerVoiceTextTestSchema = z4.object({
  contactId: z4.string().min(1).max(160),
  transcript: z4.string().trim().min(2).max(4e3)
}).strict();
var voiceInteractionDraftSchema = z4.object({
  channel: z4.enum(interactionChannels).nullable(),
  objective: z4.enum(interactionObjectives).nullable(),
  direction: z4.enum(["outbound", "inbound", "mutual"]).nullable(),
  outcome: z4.string().trim().max(500).nullable(),
  askOutcome: z4.enum(askOutcomes).nullable(),
  noteSummary: z4.string().trim().max(1e3).nullable(),
  nextActionType: z4.enum(nextActionTypes).nullable(),
  daysFromNow: z4.number().int().min(0).max(3650).nullable(),
  actionTime: z4.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u).nullable().default(null)
}).strict();
var voiceExtractionSchema = z4.object({
  isUnclear: z4.boolean(),
  interaction: voiceInteractionDraftSchema,
  insights: voiceInsightsSchema,
  confidence: z4.array(z4.object({
    path: z4.string().min(1).max(160),
    score: z4.number().min(0).max(1)
  }).strict()).max(32),
  provenance: z4.object({
    engine: z4.enum(["rules", "vertex_ai"]),
    model: z4.string().min(1).max(120).nullable(),
    promptVersion: z4.string().min(1).max(40)
  }).strict()
}).strict();
var aiVoiceExtractionSchema = voiceExtractionSchema.omit({ provenance: true });
var confirmVoiceNoteSchema = z4.object({
  voiceNoteId: z4.string().min(1).max(160),
  interaction: manualInteractionSchema,
  approvedInsights: voiceInsightsSchema.default(emptyVoiceInsights),
  opportunity: opportunityDraftSchema.omit({ subjectContactId: true }).nullable().default(null),
  opportunities: z4.array(opportunityDraftSchema.omit({ subjectContactId: true })).max(3).default([])
}).strict();
var getVoiceNoteSchema = z4.object({
  voiceNoteId: z4.string().min(1).max(160)
}).strict();
var retryVoiceNoteProcessingSchema = getVoiceNoteSchema.extend({
  emulatorTranscript: z4.string().trim().min(2).max(4e3).optional()
});

// packages/shared/src/contacts/contact-draft.ts
var contactSources = [
  "in_person",
  "referral",
  "listing",
  "social",
  "door",
  "area",
  "address_book",
  "inbound_call",
  "other"
];
var contactRoles = [
  "buyer",
  "seller",
  "tenant",
  "landlord",
  "investor",
  "peer",
  "information_source",
  "referral_source",
  "unknown"
];
var contactDraftSchema = z5.object({
  fullName: z5.string().trim().min(2, "Ad veya tan\u0131mlay\u0131c\u0131 en az 2 karakter olmal\u0131.").max(120),
  phone: z5.string().trim().max(30, "Telefon numaras\u0131 en fazla 30 karakter olabilir."),
  metAtPlace: z5.string().trim().max(160, "Tan\u0131\u015Fma yeri en fazla 160 karakter olabilir."),
  source: z5.enum(contactSources),
  role: z5.enum(contactRoles),
  nextActionType: z5.enum(nextActionTypes).nullable().optional(),
  nextActionAt: z5.number().int().positive().nullable().optional()
}).superRefine((value, context) => {
  const type = value.nextActionType ?? null;
  const at = value.nextActionAt ?? null;
  if (type === null !== (at === null)) context.addIssue({ code: "custom", message: "\u0130lk aksiyon ve zaman\u0131 birlikte se\xE7ilmeli.", path: [type === null ? "nextActionType" : "nextActionAt"] });
});

// packages/shared/src/contacts/phone-country.ts
var phoneCountries = [
  { code: "TR", dialCode: "90", name: "T\xFCrkiye" },
  { code: "DE", dialCode: "49", name: "Almanya" },
  { code: "NL", dialCode: "31", name: "Hollanda" },
  { code: "GB", dialCode: "44", name: "Birle\u015Fik Krall\u0131k" },
  { code: "AT", dialCode: "43", name: "Avusturya" },
  { code: "BE", dialCode: "32", name: "Bel\xE7ika" },
  { code: "FR", dialCode: "33", name: "Fransa" },
  { code: "CH", dialCode: "41", name: "\u0130svi\xE7re" },
  { code: "SE", dialCode: "46", name: "\u0130sve\xE7" },
  { code: "DK", dialCode: "45", name: "Danimarka" },
  { code: "NO", dialCode: "47", name: "Norve\xE7" },
  { code: "RU", dialCode: "7", name: "Rusya" },
  { code: "UA", dialCode: "380", name: "Ukrayna" },
  { code: "IR", dialCode: "98", name: "\u0130ran" },
  { code: "IQ", dialCode: "964", name: "Irak" },
  { code: "IL", dialCode: "972", name: "\u0130srail" },
  { code: "US", dialCode: "1", name: "ABD" }
];
var defaultPhoneCountry = phoneCountries[0];

// packages/shared/src/closing/closing.ts
import { z as z8 } from "zod";

// packages/shared/src/listings/listing-draft.ts
import { z as z6 } from "zod";
var propertyTypes = ["apartment", "villa", "detached_house", "land", "commercial"];
var propertyFeatures = ["ground_floor", "no_elevator", "furnished", "sea_view", "parking", "garden", "pool", "gated_community", "middle_floor", "top_floor", "new_building"];
var authorizationTypes = ["exclusive", "open", "verbal", "unknown"];
var listingStatuses = ["preparing", "active", "reserved", "sold", "rented", "removed"];
var currencyCodes = ["TRY", "GBP", "USD", "EUR"];
var listingDraftSchema = z6.object({
  opportunityId: z6.string().trim().min(1).max(160),
  address: z6.string().trim().min(3).max(500),
  regionSlug: z6.string().trim().min(2).max(160),
  propertyType: z6.enum(propertyTypes),
  roomCount: z6.number().nonnegative().max(100).nullable(),
  areaM2: z6.number().positive().max(1e6).nullable(),
  features: z6.array(z6.enum(propertyFeatures)).max(12),
  authorizationType: z6.enum(authorizationTypes),
  askingPrice: z6.number().positive().max(1e12),
  currency: z6.enum(currencyCodes),
  expiresAt: z6.number().int().positive().nullable()
}).strict();
var existingListingDraftSchema = listingDraftSchema.omit({ opportunityId: true }).extend({
  ownerContactId: z6.string().trim().min(1).max(160),
  opportunityType: z6.enum(["seller_listing", "landlord_listing"]),
  sourceInboxItemId: z6.string().trim().min(1).max(160).nullable().default(null)
}).strict();

// packages/shared/src/privacy/contact-privacy.ts
import { z as z7 } from "zod";
var legalBases = ["legitimate_interest", "contract", "legal_obligation", "explicit_consent"];
var marketingChannels = ["phone", "whatsapp", "sms", "email"];
var iysStatuses = ["unknown", "approved", "rejected", "exempt"];
var contactPrivacyDraftSchema = z7.object({
  contactId: z7.string().trim().min(1).max(160),
  coreCrmLegalBasis: z7.enum(legalBases),
  noticeStatus: z7.enum(["pending", "completed"]),
  noticeMethod: z7.enum(["verbal", "written", "electronic"]).nullable(),
  noticeVersion: z7.string().trim().min(1).max(80).nullable(),
  marketingConsent: z7.enum(["unknown", "granted", "withdrawn"]),
  marketingChannels: z7.array(z7.enum(marketingChannels)).max(4),
  iysStatus: z7.enum(iysStatuses),
  profilingObjection: z7.boolean()
}).strict().superRefine((value, context) => {
  if (value.noticeStatus === "completed" && (!value.noticeMethod || !value.noticeVersion)) context.addIssue({ code: "custom", path: ["noticeStatus"], message: "Tamamlanan ayd\u0131nlatma i\xE7in y\xF6ntem ve s\xFCr\xFCm gerekli." });
  if (value.marketingConsent === "granted" && value.marketingChannels.length === 0) context.addIssue({ code: "custom", path: ["marketingChannels"], message: "Pazarlama r\u0131zas\u0131 i\xE7in en az bir kanal se\xE7ilmeli." });
});

// packages/shared/src/closing/closing.ts
var presentationStatuses = ["draft", "user_approved", "sent", "delivered", "read", "replied", "failed"];
var presentationDraftSchema = z8.object({ listingId: z8.string().min(1).max(160), contactId: z8.string().min(1).max(160), message: z8.string().trim().min(3).max(2e3), channel: z8.enum(marketingChannels) }).strict();
var presentationTransitionSchema = z8.object({ presentationId: z8.string().min(1).max(160), toStatus: z8.enum(presentationStatuses) }).strict();
var dealStages = ["presentation", "viewing", "offer", "contract", "closed", "lost"];
var dealDraftSchema = z8.object({ listingId: z8.string().min(1).max(160), buyerContactId: z8.string().min(1).max(160).nullable() }).strict();
var dealTransitionSchema = z8.object({ dealId: z8.string().min(1).max(160), toStage: z8.enum(dealStages), offerAmount: z8.number().positive().nullable(), actualAmount: z8.number().positive().nullable(), commissionAmount: z8.number().nonnegative().nullable(), currency: z8.enum(currencyCodes).nullable(), lostReason: z8.string().trim().min(2).max(500).nullable() }).strict().superRefine((value, context) => {
  if (value.toStage === "offer" && (value.offerAmount === null || value.currency === null)) context.addIssue({ code: "custom", message: "Teklif a\u015Famas\u0131nda tutar ve para birimi gerekli." });
  if (value.toStage === "closed" && (value.actualAmount === null || value.commissionAmount === null || value.currency === null)) context.addIssue({ code: "custom", message: "Kapama a\u015Famas\u0131nda ger\xE7ekle\u015Fen bedel, komisyon ve para birimi gerekli." });
  if (value.toStage === "lost" && !value.lostReason) context.addIssue({ code: "custom", message: "Kay\u0131p nedeni gerekli." });
});

// packages/shared/src/today/build-overview.ts
import { z as z9 } from "zod";
var reportingPeriods = ["30d", "90d", "1y"];
var reportingPeriodSchema = z9.enum(reportingPeriods);
var todayOverviewQuerySchema = z9.preprocess(
  (value) => value === null || value === void 0 ? {} : value,
  z9.object({ period: reportingPeriodSchema.default("30d") }).strict()
);
var dailyTaskOutcomeSchema = z9.object({
  taskId: z9.string().trim().min(3).max(240),
  status: z9.enum(["completed", "skipped", "rescheduled", "contact_opt_out"]),
  outcomeNote: z9.string().trim().max(500).nullable(),
  skippedReason: z9.string().trim().max(300).nullable(),
  rescheduledAt: z9.number().int().positive().nullable(),
  rescheduledActionType: z9.enum(nextActionTypes).nullable()
}).strict().superRefine((value, context) => {
  if ((value.status === "skipped" || value.status === "contact_opt_out") && !value.skippedReason) {
    context.addIssue({ code: "custom", message: value.status === "contact_opt_out" ? "\u0130leti\u015Fim tercihi i\xE7in a\xE7\u0131klama gerekli." : "Atlanan g\xF6rev i\xE7in neden gerekli.", path: ["skippedReason"] });
  }
  if (value.status === "rescheduled" && (value.rescheduledAt === null || value.rescheduledActionType === null)) {
    context.addIssue({ code: "custom", message: "Yeni tarih ve aksiyon t\xFCr\xFC gerekli.", path: [value.rescheduledAt === null ? "rescheduledAt" : "rescheduledActionType"] });
  }
  if (value.status !== "rescheduled" && (value.rescheduledAt !== null || value.rescheduledActionType !== null)) {
    context.addIssue({ code: "custom", message: "Yeni tarih yaln\u0131z ertelenen g\xF6revde kullan\u0131labilir.", path: ["rescheduledAt"] });
  }
});
var replaceDailyPlanItemSchema = z9.object({ taskId: z9.string().trim().min(3).max(240) }).strict();

// packages/shared/src/domain/interaction-draft.ts
import { z as z10 } from "zod";
var nullableText = z10.string().trim().max(1e3).nullable();
var interactionDraftSchema = z10.object({
  isUnclear: z10.boolean(),
  contact: z10.object({
    fullName: z10.string().trim().max(160).nullable(),
    label: z10.string().trim().max(80).nullable(),
    metAtPlace: z10.string().trim().max(200).nullable(),
    source: z10.enum(["in_person", "referral", "listing", "social", "door", "area", "address_book", "other"]).nullable(),
    roles: z10.array(
      z10.enum([
        "buyer",
        "seller",
        "tenant",
        "landlord",
        "investor",
        "peer",
        "information_source",
        "referral_source",
        "unknown"
      ])
    )
  }).strict(),
  interaction: z10.object({
    channel: z10.enum(["in_person", "phone", "whatsapp", "sms", "email", "other"]).nullable(),
    objective: z10.enum([
      "get_acquainted",
      "provide_value",
      "permission",
      "appointment",
      "request_referral",
      "request_listing",
      "follow_up",
      "presentation",
      "offer"
    ]).nullable(),
    direction: z10.enum(["outbound", "inbound", "mutual"]).nullable(),
    outcome: nullableText,
    askOutcome: z10.enum(["positive", "unclear", "negative", "not_asked", "not_applicable"]).nullable(),
    noteSummary: nullableText
  }).strict(),
  nextAction: z10.object({
    type: z10.enum(["call", "message", "appointment", "valuation", "offer", "complete_permission", "make_ask", "other"]).nullable(),
    description: nullableText,
    daysFromNow: z10.number().int().min(0).max(3650).nullable()
  }).strict(),
  confidence: z10.array(
    z10.object({
      path: z10.string().min(1).max(200),
      score: z10.number().min(0).max(1)
    }).strict()
  ),
  schemaVersion: z10.literal("1.0.0")
}).strict();

// packages/shared/src/inbox/inbox-item.ts
import { z as z12 } from "zod";

// packages/shared/src/matching/portfolio-match.ts
import { z as z11 } from "zod";
var portfolioSources = ["manual", "whatsapp_group", "listing"];
var portfolioAuthorizationTypes = ["exclusive", "open", "verbal", "none", "unknown"];
var titleDeedTypes = ["full", "shared", "unknown"];
var portfolioTransactionTypes = ["sell", "let"];
var optionalNumber = (maximum) => z11.number().nonnegative().max(maximum).nullable();
var optionalText = (maximum) => z11.string().trim().min(1).max(maximum).nullable();
var portfolioItemDraftSchema = z11.object({
  source: z11.enum(portfolioSources),
  sourceAuthorName: optionalText(120),
  headline: z11.string().trim().min(3).max(160),
  summary: z11.string().trim().min(3).max(1e3),
  transactionType: z11.enum(portfolioTransactionTypes),
  propertyType: z11.enum(["apartment", "villa", "detached_house", "land", "commercial"]),
  location: z11.string().trim().min(2).max(240),
  askingPrice: z11.object({
    amount: z11.number().positive().max(1e12),
    currency: z11.enum(["TRY", "GBP", "USD", "EUR"])
  }).strict().nullable(),
  bedroomCount: optionalNumber(100),
  livingRoomCount: optionalNumber(20),
  areaM2: optionalNumber(1e6),
  landAreaM2: optionalNumber(1e7),
  features: z11.array(z11.enum(["ground_floor", "no_elevator", "furnished", "sea_view", "parking", "garden", "pool", "gated_community", "middle_floor", "top_floor", "new_building"])).max(12),
  attributes: z11.array(z11.string().trim().min(2).max(120)).max(20),
  authorizationType: z11.enum(portfolioAuthorizationTypes),
  titleDeedType: z11.enum(titleDeedTypes),
  constructionAllowed: z11.boolean().nullable(),
  listingUrl: z11.string().url().max(1e3).nullable()
}).strict();
var portfolioTextInputSchema = z11.object({
  text: z11.string().trim().min(10).max(8e3),
  source: z11.enum(portfolioSources).default("whatsapp_group")
}).strict();
var portfolioItemCommandSchema = z11.object({
  portfolioItemId: z11.string().min(1).max(160)
}).strict();
var matchNotificationCommandSchema = z11.object({
  notificationIds: z11.array(z11.string().min(1).max(360)).min(1).max(100)
}).strict();

// packages/shared/src/inbox/inbox-item.ts
var inboxItemSources = ["typed", "voice", "whatsapp"];
var inboxItemKinds = ["note", "person", "property", "requirement", "follow_up"];
var createInboxItemSchema = z12.object({
  source: z12.enum(inboxItemSources).default("typed"),
  text: z12.string().trim().min(1, "Not bo\u015F b\u0131rak\u0131lamaz.").max(4e3, "Not en fazla 4.000 karakter olabilir."),
  linkedContactId: z12.string().trim().min(1).max(160).nullable().default(null),
  requestedKind: z12.enum(inboxItemKinds).nullable().default(null)
}).strict();
var updateInboxItemSchema = z12.object({
  inboxItemId: z12.string().trim().min(1).max(160),
  text: z12.string().trim().min(1, "Not bo\u015F b\u0131rak\u0131lamaz.").max(4e3, "Not en fazla 4.000 karakter olabilir.").optional(),
  kind: z12.enum(inboxItemKinds).optional(),
  linkedContactId: z12.string().trim().min(1).max(160).nullable().optional(),
  pinned: z12.boolean().optional(),
  archived: z12.boolean().optional(),
  /** Answers the card's own "Nerede?" prompt; appended to the note and reclassified. */
  location: z12.string().trim().min(2, "Konum en az 2 karakter olmal\u0131.").max(120).optional()
}).strict().refine(
  (value) => value.text !== void 0 || value.kind !== void 0 || value.linkedContactId !== void 0 || value.pinned !== void 0 || value.archived !== void 0 || value.location !== void 0,
  "En az bir de\u011Fi\u015Fiklik gerekli."
);
var processBaseSchema = z12.object({ inboxItemId: z12.string().trim().min(1).max(160) });
var processInboxItemSchema = z12.discriminatedUnion("action", [
  processBaseSchema.extend({ action: z12.literal("person"), contact: contactDraftSchema }),
  processBaseSchema.extend({
    action: z12.literal("requirement"),
    contactId: z12.string().trim().min(1).max(160),
    opportunityType: z12.enum(opportunityTypes).refine((value) => value === "buyer_requirement" || value === "tenant_requirement"),
    nextActionType: z12.enum(nextActionTypes),
    nextActionAt: z12.number().int().positive(),
    approvedInsights: voiceInsightsSchema
  }),
  processBaseSchema.extend({ action: z12.literal("portfolio"), contactId: z12.string().trim().min(1).max(160).nullable(), portfolio: portfolioItemDraftSchema }),
  processBaseSchema.extend({
    action: z12.literal("follow_up"),
    contactId: z12.string().trim().min(1).max(160),
    nextActionType: z12.enum(nextActionTypes),
    nextActionAt: z12.number().int().positive()
  })
]).superRefine((value, context) => {
  if ((value.action === "requirement" || value.action === "follow_up") && value.nextActionAt < Date.now() - 6e4) {
    context.addIssue({ code: "custom", message: "Takip zaman\u0131 ge\xE7mi\u015Fte olamaz.", path: ["nextActionAt"] });
  }
});
var analyzeInboxItemSchema = z12.object({
  inboxItemId: z12.string().trim().min(1).max(160)
}).strict();
var inboxPageQuerySchema = z12.preprocess(
  (value) => value ?? {},
  z12.object({ cursor: z12.string().trim().max(160).nullable().default(null), limit: z12.number().int().min(1).max(50).default(30) }).strict()
);
var inboxItemIdSchema = z12.object({ inboxItemId: z12.string().trim().min(1).max(160) }).strict();

// packages/shared/src/funnel/funnel-metrics.ts
var dayMs = 864e5;
var promiseGraceMs = 7 * dayMs;

// packages/shared/src/listings/listing-transitions.ts
import { z as z13 } from "zod";
var listingTransitionSchema = z13.object({
  listingId: z13.string().trim().min(1).max(160),
  toStatus: z13.enum(listingStatuses),
  reason: z13.string().trim().max(500).nullable()
}).strict();

// packages/shared/src/matching/match-message.ts
import { z as z14 } from "zod";
var matchMessageRequestSchema = z14.object({
  contactId: z14.string().min(1).max(160),
  portfolioItemId: z14.string().min(1).max(160)
}).strict();

// packages/shared/src/opportunities/transitions.schema.ts
import { z as z15 } from "zod";
var opportunityTransitionSchema = z15.object({
  opportunityId: z15.string().min(1).max(160),
  toStage: z15.enum(opportunityStages),
  reason: z15.string().trim().max(500).nullable(),
  lostReason: z15.string().trim().max(160).nullable(),
  nextActionType: z15.enum(nextActionTypes).nullable(),
  nextActionAt: z15.number().int().positive().nullable()
}).strict().superRefine((value, context) => {
  if (value.toStage === "lost" && !value.lostReason) {
    context.addIssue({ code: "custom", message: "lostReason is required when an opportunity is lost", path: ["lostReason"] });
  }
  if (value.toStage !== "lost" && value.lostReason) {
    context.addIssue({ code: "custom", message: "lostReason is only valid for a lost opportunity", path: ["lostReason"] });
  }
  const terminal = value.toStage === "won" || value.toStage === "lost";
  if (terminal && (value.nextActionType !== null || value.nextActionAt !== null)) {
    context.addIssue({ code: "custom", message: "Terminal opportunities cannot have a next action", path: ["nextActionType"] });
  }
  if (!terminal && (value.nextActionType === null || value.nextActionAt === null)) {
    context.addIssue({ code: "custom", message: "Active opportunities require a next action", path: ["nextActionType"] });
  }
});
var opportunityStageCorrectionSchema = z15.object({
  opportunityId: z15.string().min(1).max(160),
  toStage: z15.enum(opportunityStages),
  reason: z15.string().trim().min(3, "D\xFCzeltme nedeni gerekli.").max(500),
  lostReason: z15.string().trim().max(160).nullable(),
  nextActionType: z15.enum(nextActionTypes).nullable(),
  nextActionAt: z15.number().int().positive().nullable()
}).strict().superRefine((value, context) => {
  const terminal = value.toStage === "won" || value.toStage === "lost";
  if (value.toStage === "lost" && !value.lostReason) context.addIssue({ code: "custom", message: "Kaybedilen f\u0131rsat i\xE7in neden gerekli.", path: ["lostReason"] });
  if (value.toStage !== "lost" && value.lostReason) context.addIssue({ code: "custom", message: "Kay\u0131p nedeni yaln\u0131z kaybedilen f\u0131rsatta kullan\u0131labilir.", path: ["lostReason"] });
  if (terminal && (value.nextActionType !== null || value.nextActionAt !== null)) context.addIssue({ code: "custom", message: "Kapanan f\u0131rsatta sonraki aksiyon olamaz.", path: ["nextActionType"] });
  if (!terminal && (value.nextActionType === null || value.nextActionAt === null)) context.addIssue({ code: "custom", message: "A\xE7\u0131k f\u0131rsatta sonraki aksiyon gerekli.", path: ["nextActionType"] });
});

// packages/shared/src/referrals/referral-draft.ts
import { z as z16 } from "zod";
var referralDraftSchema = z16.object({
  sourceContactId: z16.string().trim().min(1).max(160),
  referredContactId: z16.string().trim().min(1).max(160).nullable(),
  referredLabel: z16.string().trim().min(2).max(160).nullable()
}).strict().superRefine((value, context) => {
  if (!value.referredContactId && !value.referredLabel) context.addIssue({ code: "custom", message: "Referans verilen ki\u015Fi veya k\u0131sa tan\u0131m gerekli." });
  if (value.referredContactId === value.sourceContactId) context.addIssue({ code: "custom", path: ["referredContactId"], message: "Kaynak ve referans verilen ki\u015Fi farkl\u0131 olmal\u0131." });
});

// packages/shared/src/privacy/data-subject-request.ts
import { z as z17 } from "zod";
var dataSubjectRequestTypes = ["access", "correction", "deletion", "profiling_objection"];
var createDataSubjectRequestSchema = z17.object({
  contactId: z17.string().min(1).max(160),
  type: z17.enum(dataSubjectRequestTypes),
  requesterReference: z17.string().trim().max(160),
  details: z17.string().trim().max(2e3)
}).strict().superRefine((value, context) => {
  if (value.type === "correction" && value.details.length < 2) {
    context.addIssue({ code: "custom", path: ["details"], message: "D\xFCzeltme talebinde a\xE7\u0131klama gerekli." });
  }
});
var resolveDataSubjectRequestSchema = z17.object({
  requestId: z17.string().min(1).max(160),
  decision: z17.enum(["approved", "rejected"]),
  resolutionNote: z17.string().trim().min(2).max(2e3),
  correctedContact: contactDraftSchema.nullable()
}).strict().superRefine((value, context) => {
  if (value.decision === "approved" && value.correctedContact === null) return;
  if (value.decision === "rejected" && value.correctedContact !== null) {
    context.addIssue({ code: "custom", path: ["correctedContact"], message: "Reddedilen talepte d\xFCzeltme verisi bulunamaz." });
  }
});

// packages/shared/src/settings/office-team.ts
import { z as z18 } from "zod";
var officeInviteCodeSchema = z18.string().trim().toUpperCase().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/u, "Davet kodu 8 karakter olmal\u0131d\u0131r.");
var joinOfficeSchema = z18.object({
  code: officeInviteCodeSchema
}).strict();

// packages/shared/src/settings/workspace-settings.ts
import { z as z19 } from "zod";
var verbisStatuses = ["unknown", "exempt", "registered"];
var workspaceSettingsSchema = z19.object({
  displayName: z19.string().trim().min(2).max(120),
  phone: z19.string().trim().max(40),
  defaultRegions: z19.array(z19.string().trim().min(2).max(120)).max(5),
  monthlyPortfolioTarget: z19.number().int().min(1).max(100).nullable(),
  weeklyCapacity: z19.number().int().min(1).max(100).nullable(),
  country: z19.enum(["TR", "TRNC"]),
  dataControllerName: z19.string().trim().min(2).max(160),
  verbisStatus: z19.enum(verbisStatuses),
  trncFilingConfirmed: z19.boolean(),
  trncTransferLicenseConfirmed: z19.boolean(),
  dailyPlanReminderEnabled: z19.boolean(),
  dailyPlanReminderHour: z19.number().int().min(0).max(23),
  dailyPlanReminderMinute: z19.number().int().min(0).max(59)
}).strict().superRefine((value, context) => {
  if (value.country === "TRNC" && (!value.trncFilingConfirmed || !value.trncTransferLicenseConfirmed)) {
    context.addIssue({
      code: "custom",
      path: ["country"],
      message: "KKTC \xE7al\u0131\u015Fma alan\u0131 i\xE7in dosyalama bildirimi ve yurt d\u0131\u015F\u0131 aktar\u0131m ruhsat\u0131 birlikte do\u011Frulanmal\u0131."
    });
  }
});

// packages/shared/src/settings/whatsapp-group.ts
import { z as z20 } from "zod";
var whatsappGroupConfigurationSchema = z20.object({
  businessPhoneNumberId: z20.string().trim().regex(/^\d{5,32}$/u, "Meta i\u015Fletme telefon numaras\u0131 kimli\u011Fi ge\xE7ersiz."),
  subject: z20.string().trim().min(2, "Grup ad\u0131 en az 2 karakter olmal\u0131.").max(128),
  description: z20.string().trim().max(2048),
  joinApprovalMode: z20.enum(["approval_required", "auto_approve"])
}).strict();

// functions/src/voice/vertex-extraction.ts
var extractionModel = defineString("VOICE_EXTRACTION_MODEL", { default: "gemini-3.7-flash" });
var vertexLocation = defineString("VERTEX_AI_LOCATION", { default: "global" });
var responseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["isUnclear", "interaction", "insights", "confidence"],
  properties: {
    isUnclear: { type: "boolean" },
    interaction: {
      type: "object",
      additionalProperties: false,
      required: ["channel", "objective", "direction", "outcome", "askOutcome", "noteSummary", "nextActionType", "daysFromNow", "actionTime"],
      properties: {
        channel: { anyOf: [{ type: "string", enum: ["in_person", "phone", "whatsapp", "sms", "email", "other"] }, { type: "null" }] },
        objective: { anyOf: [{ type: "string", enum: ["get_acquainted", "provide_value", "permission", "appointment", "request_referral", "request_listing", "follow_up", "presentation", "offer"] }, { type: "null" }] },
        direction: { anyOf: [{ type: "string", enum: ["outbound", "inbound", "mutual"] }, { type: "null" }] },
        outcome: { anyOf: [{ type: "string" }, { type: "null" }] },
        askOutcome: { anyOf: [{ type: "string", enum: ["positive", "unclear", "negative", "not_asked", "not_applicable"] }, { type: "null" }] },
        noteSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
        nextActionType: { anyOf: [{ type: "string", enum: ["call", "message", "appointment", "valuation", "offer", "complete_permission", "make_ask", "other"] }, { type: "null" }] },
        daysFromNow: { anyOf: [{ type: "integer", minimum: 0, maximum: 3650 }, { type: "null" }] },
        actionTime: { anyOf: [{ type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" }, { type: "null" }] }
      }
    },
    insights: {
      type: "object",
      additionalProperties: false,
      required: ["keyThingsToRemember", "propertyContext", "propertyPreferences", "propertySituations", "suggestedActionReason"],
      properties: {
        keyThingsToRemember: { type: "array", maxItems: 8, items: { type: "string" } },
        propertyContext: { anyOf: [{ type: "string", enum: ["search_preference", "subject_property"] }, { type: "null" }] },
        propertyPreferences: {
          type: "object",
          additionalProperties: false,
          required: ["transactionType", "propertyTypes", "preferredLocations", "budgetRange", "bedroomCountMin", "livingRoomCountMin", "roomCountMin", "areaMinM2", "areaMaxM2", "mustHaves", "dealBreakers", "timeline"],
          properties: {
            transactionType: { anyOf: [{ type: "string", enum: ["buy", "sell", "rent", "let", "invest"] }, { type: "null" }] },
            propertyTypes: { type: "array", maxItems: 5, items: { type: "string", enum: ["apartment", "villa", "detached_house", "land", "commercial"] } },
            preferredLocations: { type: "array", maxItems: 8, items: { type: "string" } },
            budgetRange: {
              anyOf: [{
                type: "object",
                additionalProperties: false,
                required: ["min", "max", "currency"],
                properties: {
                  min: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
                  max: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
                  currency: { type: "string", enum: ["TRY", "GBP", "USD", "EUR"] }
                }
              }, { type: "null" }]
            },
            bedroomCountMin: { anyOf: [{ type: "number", minimum: 0, maximum: 100 }, { type: "null" }] },
            livingRoomCountMin: { anyOf: [{ type: "number", minimum: 0, maximum: 20 }, { type: "null" }] },
            roomCountMin: { anyOf: [{ type: "number", minimum: 0, maximum: 100 }, { type: "null" }] },
            areaMinM2: { anyOf: [{ type: "number", minimum: 0, maximum: 1e5 }, { type: "null" }] },
            areaMaxM2: { anyOf: [{ type: "number", minimum: 0, maximum: 1e5 }, { type: "null" }] },
            mustHaves: { type: "array", maxItems: 8, items: { type: "string" } },
            dealBreakers: { type: "array", maxItems: 8, items: { type: "string" } },
            timeline: { anyOf: [{ type: "string" }, { type: "null" }] }
          }
        },
        propertySituations: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["propertyContext", "summary", "propertyPreferences"],
            properties: {
              propertyContext: { type: "string", enum: ["search_preference", "subject_property"] },
              summary: { type: "string" },
              propertyPreferences: {
                type: "object",
                additionalProperties: false,
                required: ["transactionType", "propertyTypes", "preferredLocations", "budgetRange", "bedroomCountMin", "livingRoomCountMin", "roomCountMin", "areaMinM2", "areaMaxM2", "mustHaves", "dealBreakers", "timeline"],
                properties: {
                  transactionType: { anyOf: [{ type: "string", enum: ["buy", "sell", "rent", "let", "invest"] }, { type: "null" }] },
                  propertyTypes: { type: "array", maxItems: 5, items: { type: "string", enum: ["apartment", "villa", "detached_house", "land", "commercial"] } },
                  preferredLocations: { type: "array", maxItems: 8, items: { type: "string" } },
                  budgetRange: {
                    anyOf: [{
                      type: "object",
                      additionalProperties: false,
                      required: ["min", "max", "currency"],
                      properties: {
                        min: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
                        max: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
                        currency: { type: "string", enum: ["TRY", "GBP", "USD", "EUR"] }
                      }
                    }, { type: "null" }]
                  },
                  bedroomCountMin: { anyOf: [{ type: "number", minimum: 0, maximum: 100 }, { type: "null" }] },
                  livingRoomCountMin: { anyOf: [{ type: "number", minimum: 0, maximum: 20 }, { type: "null" }] },
                  roomCountMin: { anyOf: [{ type: "number", minimum: 0, maximum: 100 }, { type: "null" }] },
                  areaMinM2: { anyOf: [{ type: "number", minimum: 0, maximum: 1e5 }, { type: "null" }] },
                  areaMaxM2: { anyOf: [{ type: "number", minimum: 0, maximum: 1e5 }, { type: "null" }] },
                  mustHaves: { type: "array", maxItems: 8, items: { type: "string" } },
                  dealBreakers: { type: "array", maxItems: 8, items: { type: "string" } },
                  timeline: { anyOf: [{ type: "string" }, { type: "null" }] }
                }
              }
            }
          }
        },
        suggestedActionReason: { anyOf: [{ type: "string" }, { type: "null" }] }
      }
    },
    confidence: {
      type: "array",
      maxItems: 32,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "score"],
        properties: {
          path: { type: "string" },
          score: { type: "number", minimum: 0, maximum: 1 }
        }
      }
    }
  }
};

// ../../../../../private/tmp/claude-501/-Users-onurbultan-Documents-WebProjects-spherepath/06b2f227-c703-45c4-9bf0-6cb77534813f/scratchpad/repro4.ts
var token = execFileSync("gcloud", ["auth", "print-access-token"]).toString().trim();
var auth = new OAuth2Client();
auth.setCredentials({ access_token: token });
var client = new GoogleGenAI2({ enterprise: true, project: "spherepath-96ecd", location: "global", googleAuthOptions: { authClient: auth } });
async function attempt(label, schema) {
  try {
    await client.models.generateContent({
      model: "gemini-3.7-flash",
      contents: [{ role: "user", parts: [{ text: "test" }] }],
      config: { temperature: 0, maxOutputTokens: 256, responseMimeType: "application/json", responseJsonSchema: schema }
    });
    console.log("  OK      ", label);
  } catch (e) {
    console.log("  400     ", label);
  }
}
await attempt("basit nesne", { type: "object", properties: { a: { type: "string" } } });
await attempt("anyOf ile null", { type: "object", properties: { a: { anyOf: [{ type: "string" }, { type: "null" }] } } });
await attempt("enum + null anyOf", { type: "object", properties: { a: { anyOf: [{ type: "string", enum: ["x", "y"] }, { type: "null" }] } } });
await attempt("number min/max", { type: "object", properties: { a: { type: "number", minimum: 0, maximum: 1 } } });
await attempt("required", { type: "object", properties: { a: { type: "string" } }, required: ["a"] });
await attempt("additionalProperties:false", { type: "object", properties: { a: { type: "string" } }, additionalProperties: false });
await attempt("GERCEK SEMA", responseJsonSchema);
var real = responseJsonSchema;
for (const key of Object.keys(real.properties ?? {})) {
  await attempt(`sadece .${key}`, { type: "object", properties: { [key]: real.properties[key] } });
}
