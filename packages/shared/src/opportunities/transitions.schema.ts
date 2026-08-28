import { z } from "zod";

export const opportunityTransitionCommandSchema = z
  .object({
    opportunityId: z.string().min(1).max(160),
    commandId: z.uuid(),
    toStage: z.enum([
      "yeni_lead",
      "ilk_temas",
      "randevu",
      "degerleme",
      "teklif_yetki",
      "kazanildi",
      "kayip",
    ]),
    reason: z.string().trim().max(500).nullable(),
    lostReason: z.string().trim().max(160).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.toStage === "kayip" && !value.lostReason) {
      context.addIssue({
        code: "custom",
        message: "lostReason is required when an opportunity is lost",
        path: ["lostReason"],
      });
    }
    if (value.toStage !== "kayip" && value.lostReason) {
      context.addIssue({
        code: "custom",
        message: "lostReason is only valid for a lost opportunity",
        path: ["lostReason"],
      });
    }
  });

export type OpportunityTransitionCommand = z.infer<typeof opportunityTransitionCommandSchema>;
