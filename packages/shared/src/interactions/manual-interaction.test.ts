import { describe, expect, it } from "vitest";
import { applyInteractionEditToRelationship, applyInteractionToRelationship, createInteraction, interactionEditSchema, interactionOccurredAtError, manualInteractionSchema } from "./manual-interaction.js";

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

describe("correcting a recorded conversation", () => {
  const relationship = {
    stage: "active" as const,
    meaningfulTouchCount: 6,
    reciprocalTouchCount: 2,
    lastTouchAt: 5_000,
    nextActionAt: 9_000,
    nextActionType: "call" as const,
    lastObjective: "follow_up" as const,
    lastAskOutcome: "unclear" as const,
    referralCount: 1,
  };

  it("rejects a correction that tries to move the conversation to another contact", () => {
    const result = interactionEditSchema.safeParse({
      interactionId: "interaction-1",
      contactId: "contact-2",
      channel: "phone",
      objective: "follow_up",
      direction: "mutual",
      outcome: "Düzeltildi",
      askOutcome: "positive",
      noteSummary: "",
      occurredAt: 5_000,
    });
    expect(result.success).toBe(false);
  });

  it("keeps the conversation count and moves only what the correction restates", () => {
    const next = applyInteractionEditToRelationship(
      relationship,
      { direction: "mutual", occurredAt: 5_000 },
      { direction: "mutual", objective: "presentation", askOutcome: "positive", occurredAt: 5_000 },
    );

    expect(next.meaningfulTouchCount).toBe(6);
    expect(next.reciprocalTouchCount).toBe(2);
    expect(next.lastObjective).toBe("presentation");
    expect(next.lastAskOutcome).toBe("positive");
  });

  it("takes back a reciprocal touch when the conversation turns out to have been outbound", () => {
    const next = applyInteractionEditToRelationship(
      relationship,
      { direction: "inbound", occurredAt: 5_000 },
      { direction: "outbound", objective: "follow_up", askOutcome: "unclear", occurredAt: 5_000 },
    );

    expect(next.reciprocalTouchCount).toBe(1);
    expect(next.stage).toBe("engaged");
  });

  it("never counts a reciprocal touch below zero", () => {
    const next = applyInteractionEditToRelationship(
      { ...relationship, reciprocalTouchCount: 0 },
      { direction: "inbound", occurredAt: 5_000 },
      { direction: "outbound", objective: "follow_up", askOutcome: "unclear", occurredAt: 5_000 },
    );

    expect(next.reciprocalTouchCount).toBe(0);
  });

  it("leaves a referral source at the standing it earned", () => {
    const next = applyInteractionEditToRelationship(
      { ...relationship, stage: "referral_source" },
      { direction: "inbound", occurredAt: 5_000 },
      { direction: "outbound", objective: "follow_up", askOutcome: "unclear", occurredAt: 5_000 },
    );

    expect(next.stage).toBe("referral_source");
  });

  it("does not let a correction to an older conversation overwrite the latest one", () => {
    const next = applyInteractionEditToRelationship(
      relationship,
      { direction: "mutual", occurredAt: 2_000 },
      { direction: "mutual", objective: "presentation", askOutcome: "positive", occurredAt: 2_000 },
    );

    expect(next.lastObjective).toBe("follow_up");
    expect(next.lastAskOutcome).toBe("unclear");
    expect(next.lastTouchAt).toBe(5_000);
  });

  it("carries the last touch forward when a conversation is corrected to a later date", () => {
    const next = applyInteractionEditToRelationship(
      relationship,
      { direction: "mutual", occurredAt: 2_000 },
      { direction: "mutual", objective: "presentation", askOutcome: "positive", occurredAt: 8_000 },
    );

    expect(next.lastTouchAt).toBe(8_000);
    expect(next.lastObjective).toBe("presentation");
  });

  it("does not pull the last touch back when a conversation is corrected to an earlier date", () => {
    const next = applyInteractionEditToRelationship(
      relationship,
      { direction: "mutual", occurredAt: 5_000 },
      { direction: "mutual", objective: "presentation", askOutcome: "positive", occurredAt: 3_000 },
    );

    expect(next.lastTouchAt).toBe(5_000);
  });
});
