import { describe, expect, it } from "vitest";
import { applyInteractionToRelationship, createInteraction, interactionOccurredAtError, manualInteractionSchema } from "./manual-interaction.js";

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

describe("backdated conversation time", () => {
  const base = {
    contactId: "contact-1", channel: "phone" as const, objective: "follow_up" as const, direction: "mutual" as const,
    outcome: "Görüşme tamamlandı", askOutcome: "not_asked" as const, nextActionType: null, nextActionAt: null, noteSummary: "",
  };
  const tenant = { officeId: "office-1", ownerUid: "user-1" };
  const now = 10 * 86_400_000;

  it("records the conversation time the advisor entered, not the moment of entry", () => {
    const morning = now - 11 * 60 * 60 * 1_000;
    expect(createInteraction({ ...base, occurredAt: morning }, tenant, now).occurredAt).toBe(morning);
  });

  it("falls back to the recording time when none is given", () => {
    expect(createInteraction(base, tenant, now).occurredAt).toBe(now);
  });

  it("rejects a conversation time in the future or beyond the backdating window", () => {
    expect(interactionOccurredAtError(now + 5 * 60_000, now)).toContain("gelecekte");
    expect(interactionOccurredAtError(now - 40 * 86_400_000, now)).toContain("30 gün");
  });

  it("accepts a time inside the window and tolerates small clock skew", () => {
    expect(interactionOccurredAtError(now - 3 * 86_400_000, now)).toBeNull();
    expect(interactionOccurredAtError(now + 10_000, now)).toBeNull();
    expect(interactionOccurredAtError(null, now)).toBeNull();
  });
});
