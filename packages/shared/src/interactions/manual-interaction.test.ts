import { describe, expect, it } from "vitest";
import { applyInteractionToRelationship, createInteraction, manualInteractionSchema } from "./manual-interaction.js";

describe("manual interactions", () => {
  it("requires a complete next action pair", () => {
    const result = manualInteractionSchema.safeParse({
      contactId: "contact-1",
      channel: "phone",
      objective: "follow_up",
      direction: "outbound",
      outcome: "Görüşme tamamlandı",
      askOutcome: "not_asked",
      nextActionType: "call",
      nextActionAt: null,
      noteSummary: "",
    });
    expect(result.success).toBe(false);
  });

  it("creates an immutable interaction payload", () => {
    const interaction = createInteraction({
      contactId: "contact-1",
      channel: "phone",
      objective: "follow_up",
      direction: "mutual",
      outcome: "Randevu netleşti",
      askOutcome: "positive",
      nextActionType: "appointment",
      nextActionAt: 2_000,
      noteSummary: "Salı günü buluşulacak.",
    }, { officeId: "office-1", ownerUid: "user-1" }, 1_000);

    expect(interaction.voiceNoteId).toBeNull();
    expect(interaction.occurredAt).toBe(1_000);
  });

  it("derives relationship activity deterministically", () => {
    const relationship = applyInteractionToRelationship({
      stage: "new",
      meaningfulTouchCount: 0,
      reciprocalTouchCount: 0,
      lastTouchAt: null,
      nextActionAt: null,
      nextActionType: null,
      lastObjective: null,
      lastAskOutcome: null,
      referralCount: 0,
    }, {
      occurredAt: 1_000,
      objective: "get_acquainted",
      direction: "mutual",
      askOutcome: "not_asked",
      nextActionAt: 2_000,
      nextActionType: "call",
    });

    expect(relationship.stage).toBe("getting_to_know");
    expect(relationship.meaningfulTouchCount).toBe(1);
    expect(relationship.reciprocalTouchCount).toBe(1);
    expect(relationship.nextActionType).toBe("call");
  });
});
