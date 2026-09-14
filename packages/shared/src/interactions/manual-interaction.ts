import { z } from "zod";
import type {
  AskOutcome,
  Contact,
  Interaction,
  InteractionChannel,
  InteractionObjective,
  NextActionType,
  TenantOwned,
} from "../domain/entities.js";

export const interactionChannels = ["in_person", "phone", "whatsapp", "sms", "email", "other"] as const satisfies readonly InteractionChannel[];
export const interactionObjectives = [
  "get_acquainted",
  "provide_value",
  "permission",
  "appointment",
  "request_referral",
  "request_listing",
  "follow_up",
  "presentation",
  "offer",
] as const satisfies readonly InteractionObjective[];
export const askOutcomes = ["positive", "unclear", "negative", "not_asked", "not_applicable"] as const satisfies readonly AskOutcome[];
export const nextActionTypes = ["call", "message", "appointment", "appointment_confirmed", "valuation", "offer", "complete_permission", "make_ask", "other"] as const satisfies readonly NextActionType[];

export const interactionChannelLabels: Record<InteractionChannel, string> = {
  in_person: "Yüz yüze",
  phone: "Telefon",
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "E-posta",
  other: "Diğer",
};

export const interactionObjectiveLabels: Record<InteractionObjective, string> = {
  get_acquainted: "Tanıma",
  provide_value: "Değer sunma",
  permission: "İzin / aydınlatma",
  appointment: "Randevu",
  request_referral: "Referans talebi",
  request_listing: "Portföy talebi",
  follow_up: "Takip",
  presentation: "Sunum",
  offer: "Teklif",
};

export const askOutcomeLabels: Record<AskOutcome, string> = {
  positive: "Olumlu",
  unclear: "Belirsiz",
  negative: "Olumsuz",
  not_asked: "Sorulmadı",
  not_applicable: "Bu görüşmeye uygulanmaz",
};

export const nextActionTypeLabels: Record<NextActionType, string> = {
  call: "Ara",
  message: "Mesaj gönder",
  appointment: "Randevu planla",
  appointment_confirmed: "Teyitli randevuya katıl",
  valuation: "Değerleme",
  offer: "Teklif hazırla",
  complete_permission: "İzni tamamla",
  make_ask: "Talep yap",
  other: "Diğer",
};

export const interactionDirections = ["mutual", "outbound", "inbound"] as const;
export const interactionDirectionLabels: Record<(typeof interactionDirections)[number], string> = {
  mutual: "Karşılıklı",
  outbound: "Giden",
  inbound: "Gelen",
};

export const manualInteractionSchema = z
  .object({
    nextActionContactId: z.string().min(1).max(160).nullable().optional(),
    nextActionOpportunityId: z.string().min(1).max(160).nullable().optional(),
    dealId: z.string().min(1).max(160).nullable().optional(),
    dealOffer: z.object({ party: z.enum(["buyer", "seller"]), amount: z.number().positive(), currency: z.enum(["TRY", "GBP", "USD", "EUR"]) }).strict().nullable().optional(),
    contactId: z.string().min(1).max(160),
    channel: z.enum(interactionChannels),
    objective: z.enum(interactionObjectives),
    direction: z.enum(["outbound", "inbound", "mutual"]),
    outcome: z.string().trim().min(2, "Sonuç en az 2 karakter olmalı.").max(500),
    askOutcome: z.enum(askOutcomes),
    nextActionType: z.enum(nextActionTypes).nullable(),
    nextActionAt: z.number().int().positive().nullable(),
    noteSummary: z.string().trim().max(1_000),
    /** When the conversation actually happened; null falls back to the moment it is recorded. */
    occurredAt: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.dealOffer && !value.dealId) context.addIssue({ code: "custom", message: "Teklifi kaydetmek için ilgili işlemi seç.", path: ["dealId"] });
    if ((value.nextActionType === null) !== (value.nextActionAt === null)) {
      context.addIssue({
        code: "custom",
        message: "Sonraki aksiyon türü ve tarihi birlikte seçilmeli.",
        path: [value.nextActionType === null ? "nextActionType" : "nextActionAt"],
      });
    }
  });

export type ManualInteractionDraft = z.infer<typeof manualInteractionSchema>;

/**
 * What a recorded conversation can be corrected to. The contact, the linked
 * work and the next action stay out: moving an interaction to another person
 * would rewrite two relationship histories at once, and the next action already
 * has its own complete-or-reschedule flow. This is for the account of the
 * conversation itself -- what was said, through which channel, and when.
 */
export const interactionEditSchema = z
  .object({
    interactionId: z.string().trim().min(1).max(160),
    channel: z.enum(interactionChannels),
    objective: z.enum(interactionObjectives),
    direction: z.enum(["outbound", "inbound", "mutual"]),
    outcome: z.string().trim().min(2, "Sonuç en az 2 karakter olmalı.").max(500),
    askOutcome: z.enum(askOutcomes),
    noteSummary: z.string().trim().max(1_000),
    occurredAt: z.number().int().positive(),
  })
  .strict();

export type InteractionEdit = z.infer<typeof interactionEditSchema>;

/** An advisor entering the day's conversations in the evening may backdate, but only so far. */
export const maxInteractionBackdateMs = 30 * 86_400_000;
const clockSkewGraceMs = 60_000;

/** Returns a user-facing reason when a backdated conversation time is out of range. */
export function interactionOccurredAtError(occurredAt: number | null, now: number): string | null {
  if (occurredAt === null) return null;
  if (occurredAt > now + clockSkewGraceMs) return "Görüşme zamanı gelecekte olamaz.";
  if (occurredAt < now - maxInteractionBackdateMs) return "Görüşme zamanı en fazla 30 gün geriye alınabilir.";
  return null;
}

export function createInteraction(draft: ManualInteractionDraft, tenant: TenantOwned, now: number): Interaction {
  const parsed = manualInteractionSchema.parse(draft);
  return {
    ...tenant,
    contactId: parsed.contactId,
    nextActionContactId: parsed.nextActionContactId ?? parsed.contactId,
    nextActionOpportunityId: parsed.nextActionOpportunityId ?? null,
    dealId: parsed.dealId ?? null,
    channel: parsed.channel,
    occurredAt: parsed.occurredAt ?? now,
    objective: parsed.objective,
    direction: parsed.direction,
    outcome: parsed.outcome,
    askOutcome: parsed.askOutcome,
    nextActionAt: parsed.nextActionAt,
    nextActionType: parsed.nextActionType,
    noteSummary: parsed.noteSummary || null,
    voiceNoteId: null,
    createdAt: now,
  };
}

export interface RelationshipActivity {
  occurredAt: number;
  objective: InteractionObjective;
  direction: Interaction["direction"];
  askOutcome: AskOutcome;
  nextActionAt: number | null;
  nextActionType: NextActionType | null;
}

/**
 * One definition of the ladder, so recording a conversation and correcting one
 * cannot disagree about where the relationship stands. A referral source has
 * earned a standing that touch counts do not take back.
 */
export function relationshipStageFor(
  current: Contact["relationship"]["stage"],
  meaningfulTouchCount: number,
  reciprocalTouchCount: number,
): Contact["relationship"]["stage"] {
  if (current === "referral_source") return current;
  if (meaningfulTouchCount >= 5 && reciprocalTouchCount >= 2) return "active";
  if (meaningfulTouchCount >= 2) return "engaged";
  return "getting_to_know";
}

export function applyInteractionToRelationship(
  current: Contact["relationship"],
  activity: RelationshipActivity,
): Contact["relationship"] {
  const meaningfulTouchCount = current.meaningfulTouchCount + 1;
  const reciprocalTouchCount = current.reciprocalTouchCount + (activity.direction === "outbound" ? 0 : 1);
  const stage = relationshipStageFor(current.stage, meaningfulTouchCount, reciprocalTouchCount);

  return {
    ...current,
    stage,
    meaningfulTouchCount,
    reciprocalTouchCount,
    lastTouchAt: Math.max(current.lastTouchAt ?? 0, activity.occurredAt),
    nextActionAt: activity.nextActionAt,
    nextActionType: activity.nextActionType,
    lastObjective: activity.objective,
    lastAskOutcome: activity.askOutcome,
  };
}

/**
 * A correction has to move the derived relationship with it, or the summary on
 * the contact keeps describing a conversation that no longer reads that way.
 * The number of conversations does not change, so the meaningful touch count is
 * left alone; only what the correction actually restates is recomputed.
 *
 * `lastTouchAt` only moves forward. Pulling it back would need the dates of
 * every other interaction, which this rule does not have -- so a conversation
 * corrected to an earlier date leaves the last-touch date where it was rather
 * than inventing a new one.
 */
export function applyInteractionEditToRelationship(
  current: Contact["relationship"],
  before: Pick<RelationshipActivity, "direction" | "occurredAt">,
  after: Pick<RelationshipActivity, "direction" | "objective" | "askOutcome" | "occurredAt">,
): Contact["relationship"] {
  const reciprocalDelta = (after.direction === "outbound" ? 0 : 1) - (before.direction === "outbound" ? 0 : 1);
  const reciprocalTouchCount = Math.max(0, current.reciprocalTouchCount + reciprocalDelta);
  // The corrected conversation speaks for the relationship only while it is the
  // most recent one; otherwise a fix to an old note would overwrite what the
  // latest conversation established.
  const wasLatest = current.lastTouchAt === null || before.occurredAt >= current.lastTouchAt;
  const becomesLatest = current.lastTouchAt === null || after.occurredAt >= current.lastTouchAt;
  const speaksForRelationship = wasLatest || becomesLatest;

  return {
    ...current,
    stage: relationshipStageFor(current.stage, current.meaningfulTouchCount, reciprocalTouchCount),
    reciprocalTouchCount,
    lastTouchAt: Math.max(current.lastTouchAt ?? 0, after.occurredAt),
    lastObjective: speaksForRelationship ? after.objective : current.lastObjective,
    lastAskOutcome: speaksForRelationship ? after.askOutcome : current.lastAskOutcome,
  };
}
