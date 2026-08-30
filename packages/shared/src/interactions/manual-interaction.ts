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
export const nextActionTypes = ["call", "message", "appointment", "valuation", "offer", "complete_permission", "make_ask", "other"] as const satisfies readonly NextActionType[];

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
  not_applicable: "Uygun değildi",
};

export const nextActionTypeLabels: Record<NextActionType, string> = {
  call: "Ara",
  message: "Mesaj gönder",
  appointment: "Randevu yap",
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
    if ((value.nextActionType === null) !== (value.nextActionAt === null)) {
      context.addIssue({
        code: "custom",
        message: "Sonraki aksiyon türü ve tarihi birlikte seçilmeli.",
        path: [value.nextActionType === null ? "nextActionType" : "nextActionAt"],
      });
    }
  });

export type ManualInteractionDraft = z.infer<typeof manualInteractionSchema>;

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

export function applyInteractionToRelationship(
  current: Contact["relationship"],
  activity: RelationshipActivity,
): Contact["relationship"] {
  const meaningfulTouchCount = current.meaningfulTouchCount + 1;
  const reciprocalTouchCount = current.reciprocalTouchCount + (activity.direction === "outbound" ? 0 : 1);
  const stage = current.stage === "referral_source"
    ? current.stage
    : meaningfulTouchCount >= 5 && reciprocalTouchCount >= 2
      ? "active"
      : meaningfulTouchCount >= 2
        ? "engaged"
        : "getting_to_know";

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
