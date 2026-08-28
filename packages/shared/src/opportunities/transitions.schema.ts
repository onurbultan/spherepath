import { z } from "zod";
import { nextActionTypes } from "../interactions/manual-interaction.js";
import { opportunityStages } from "./opportunity-draft.js";

export const opportunityTransitionSchema = z.object({
  opportunityId: z.string().min(1).max(160),
  toStage: z.enum(opportunityStages),
  reason: z.string().trim().max(500).nullable(),
  lostReason: z.string().trim().max(160).nullable(),
  nextActionType: z.enum(nextActionTypes).nullable(),
  nextActionAt: z.number().int().positive().nullable(),
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

export type OpportunityTransition = z.infer<typeof opportunityTransitionSchema>;
