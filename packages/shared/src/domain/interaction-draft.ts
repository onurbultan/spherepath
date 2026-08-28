import { z } from "zod";

const nullableText = z.string().trim().max(1_000).nullable();

export const interactionDraftSchema = z
  .object({
    isUnclear: z.boolean(),
    contact: z
      .object({
        adSoyad: z.string().trim().max(160).nullable(),
        takmaEtiket: z.string().trim().max(80).nullable(),
        tanismaYeri: z.string().trim().max(200).nullable(),
        kaynak: z
          .enum(["yuz_yuze", "referans", "ilan", "sosyal", "kapi", "bolge", "rehber", "diger"])
          .nullable(),
        roller: z.array(
          z.enum([
            "alici",
            "satici",
            "kiraci",
            "kiraya_veren",
            "yatirimci",
            "meslektas",
            "bilgi_kaynagi",
            "referans_kaynagi",
            "belirsiz",
          ]),
        ),
      })
      .strict(),
    interaction: z
      .object({
        channel: z.enum(["yuz_yuze", "telefon", "whatsapp", "sms", "eposta", "diger"]).nullable(),
        objective: z
          .enum([
            "tanima",
            "deger_sunma",
            "izin",
            "randevu",
            "referans_talebi",
            "portfoy_talebi",
            "takip",
            "sunum",
            "teklif",
          ])
          .nullable(),
        direction: z.enum(["giden", "gelen", "karsilikli"]).nullable(),
        outcome: nullableText,
        askOutcome: z.enum(["olumlu", "belirsiz", "olumsuz", "sorulmadi", "uygun_degil"]).nullable(),
        noteSummary: nullableText,
      })
      .strict(),
    nextAction: z
      .object({
        type: z
          .enum(["ara", "mesaj", "randevu", "degerleme", "teklif", "izin_tamamla", "talep_yap", "diger"])
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
