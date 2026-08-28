import { z } from "zod";

const nullableText = z.string().trim().max(1_000).nullable();

export const interactionDraftSchema = z
  .object({
    isUnclear: z.boolean(),
    contact: z
      .object({
        fullName: z.string().trim().max(160).nullable(),
        label: z.string().trim().max(80).nullable(),
        metAtPlace: z.string().trim().max(200).nullable(),
        source: z
          .enum(["in_person", "referral", "listing", "social", "door", "area", "address_book", "other"])
          .nullable(),
        roles: z.array(
          z.enum([
            "buyer",
            "seller",
            "tenant",
            "landlord",
            "investor",
            "peer",
            "information_source",
            "referral_source",
            "unknown",
          ]),
        ),
      })
      .strict(),
    interaction: z
      .object({
        channel: z.enum(["in_person", "phone", "whatsapp", "sms", "email", "other"]).nullable(),
        objective: z
          .enum([
            "get_acquainted",
            "provide_value",
            "permission",
            "appointment",
            "request_referral",
            "request_listing",
            "follow_up",
            "presentation",
            "offer",
          ])
          .nullable(),
        direction: z.enum(["outbound", "inbound", "mutual"]).nullable(),
        outcome: nullableText,
        askOutcome: z.enum(["positive", "unclear", "negative", "not_asked", "not_applicable"]).nullable(),
        noteSummary: nullableText,
      })
      .strict(),
    nextAction: z
      .object({
        type: z
          .enum(["call", "message", "appointment", "valuation", "offer", "complete_permission", "make_ask", "other"])
          .nullable(),
        description: nullableText,
        daysFromNow: z.number().int().min(0).max(3_650).nullable(),
      })
      .strict(),
    confidence: z.array(
      z
        .object({
          path: z.string().min(1).max(200),
          score: z.number().min(0).max(1),
        })
        .strict(),
    ),
    schemaVersion: z.literal("1.0.0"),
  })
  .strict();

export type InteractionDraft = z.infer<typeof interactionDraftSchema>;
