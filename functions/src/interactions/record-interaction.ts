import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  appendDealOffer, type Deal,
  applyInteractionEditToRelationship,
  applyInteractionToRelationship,
  createInteraction,
  interactionEditSchema,
  interactionOccurredAtError,
  manualInteractionSchema,
  type Contact,
  type Interaction,
} from "../../../packages/shared/src/index";
import { requireSpherepathClaims } from "../auth/claims.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";

function timestamp(value: number | null): Timestamp | null {
  return value === null ? null : Timestamp.fromMillis(value);
}

export const recordInteraction = onCall(
  {
    region: "europe-west8",
    cors: true,
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request): Promise<{ interactionId: string }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<unknown>(request.data, { command: true });
    const commandId = envelope.commandId!;
    const parsed = manualInteractionSchema.safeParse(envelope.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "Interaction input is invalid.", parsed.error.flatten());
    }
    const occurredAtError = interactionOccurredAtError(parsed.data.occurredAt ?? null, Date.now());
    if (occurredAtError) throw new HttpsError("invalid-argument", occurredAtError);

    const firestore = getFirestore();
    const commandRef = firestore.collection("commands").doc(commandId);
    const contactRef = firestore.collection("contacts").doc(parsed.data.contactId);
    const interactionRef = firestore.collection("interactions").doc();

    return observeApiRequest("recordInteraction", envelope.requestId, () => firestore.runTransaction(async (transaction) => {
      const [commandSnapshot, contactSnapshot] = await Promise.all([
        transaction.get(commandRef),
        transaction.get(contactRef),
      ]);
      if (commandSnapshot.exists) {
        const receipt = commandSnapshot.data()!;
        if (receipt.officeId !== claims.officeId || receipt.ownerUid !== claims.uid || receipt.type !== "recordInteraction") {
          throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        }
        return { interactionId: receipt.interactionId as string };
      }
      if (!contactSnapshot.exists) throw new HttpsError("not-found", "Contact was not found.");

      const contact = contactSnapshot.data()!;
      const canManage = contact.officeId === claims.officeId &&
        (contact.ownerUid === claims.uid || claims.role === "broker") && contact.deletedAt === null;
      if (!canManage) throw new HttpsError("permission-denied", "Contact is outside your workspace.");

      const targetId = parsed.data.nextActionContactId ?? parsed.data.contactId;
      const targetRef = firestore.collection("contacts").doc(targetId);
      const targetSnapshot = targetId === contactRef.id ? contactSnapshot : await transaction.get(targetRef);
      const target = targetSnapshot.data();
      if (!target || target.officeId !== claims.officeId || (target.ownerUid !== claims.uid && claims.role !== "broker") || target.deletedAt !== null) throw new HttpsError("permission-denied", "Action contact is outside your workspace.");
      const opportunityRef = parsed.data.nextActionOpportunityId ? firestore.collection("opportunities").doc(parsed.data.nextActionOpportunityId) : null;
      const opportunity = opportunityRef ? (await transaction.get(opportunityRef)).data() : null;
      if (opportunityRef && (!opportunity || opportunity.officeId !== claims.officeId || (opportunity.ownerUid !== claims.uid && claims.role !== "broker") || opportunity.subjectContactId !== targetId || opportunity.deletedAt !== null || ["won", "lost"].includes(opportunity.stage as string))) throw new HttpsError("permission-denied", "Action requirement is unavailable.");
      const dealRef = parsed.data.dealId ? firestore.collection("deals").doc(parsed.data.dealId) : null;
      const deal = dealRef ? (await transaction.get(dealRef)).data() : null;
      if (dealRef && (!deal || deal.officeId !== claims.officeId || (deal.ownerUid !== claims.uid && claims.role !== "broker") || deal.deletedAt !== null || ["closed", "lost"].includes(deal.stage as string))) throw new HttpsError("permission-denied", "Related deal is unavailable.");
      if (deal && deal.buyerContactId !== targetId && parsed.data.nextActionType) throw new HttpsError("invalid-argument", "İşlemin sonraki aksiyonu için ilgili alıcıyı seç.");
      if (deal && opportunityRef && deal.buyerOpportunityId !== opportunityRef.id) throw new HttpsError("invalid-argument", "Seçilen talep bu işleme bağlı değil.");
      const now = Date.now();
      const interaction = createInteraction(
        parsed.data,
        { officeId: contact.officeId as string, ownerUid: contact.ownerUid as string },
        now,
      );
      const storedRelationship = contact.relationship as DocumentData;
      const relationship = applyInteractionToRelationship({
        ...(storedRelationship as Contact["relationship"]),
        lastTouchAt: storedRelationship.lastTouchAt instanceof Timestamp ? storedRelationship.lastTouchAt.toMillis() : null,
        nextActionAt: storedRelationship.nextActionAt instanceof Timestamp ? storedRelationship.nextActionAt.toMillis() : null,
      }, interaction);
      const separateAction = targetId !== contactRef.id || opportunityRef !== null || dealRef !== null;
      if (separateAction) {
        relationship.nextActionType = storedRelationship.nextActionType ?? null;
        relationship.nextActionAt = storedRelationship.nextActionAt instanceof Timestamp ? storedRelationship.nextActionAt.toMillis() : null;
      }
      const nowTimestamp = Timestamp.fromMillis(now);
      const actionUpdate = { nextActionType: parsed.data.nextActionType, nextActionAt: timestamp(parsed.data.nextActionAt), updatedAt: nowTimestamp };
      let dealUpdate: DocumentData = { updatedAt: nowTimestamp };
      if (dealRef && deal && parsed.data.dealOffer) {
        const offer = parsed.data.dealOffer;
        const transition = { dealId: dealRef.id, toStage: "offer" as const, offerParty: offer.party, offerAmount: offer.amount, currency: offer.currency, occurredAt: interaction.occurredAt, evidenceNote: parsed.data.outcome, sourceInteractionId: interactionRef.id, nextActionType: parsed.data.nextActionType, nextActionAt: parsed.data.nextActionAt, actualAmount: null, commissionAmount: null, lostReason: null };
        try { dealUpdate = { ...dealUpdate, stage: "offer", stageEnteredAt: deal.stage === "offer" ? deal.stageEnteredAt : Timestamp.fromMillis(interaction.occurredAt), offers: appendDealOffer(deal as Deal, transition, interactionRef.id, now), offerAmount: offer.amount, currency: offer.currency, lastStageNote: parsed.data.outcome }; }
        catch { throw new HttpsError("invalid-argument", "Teklif, tarih ve sonraki aksiyonu kontrol et."); }
        transaction.create(firestore.collection("stageEvents").doc(), { officeId: deal.officeId, ownerUid: deal.ownerUid, entityType: "deal", entityId: dealRef.id, fromStage: deal.stage, toStage: "offer", reason: parsed.data.outcome, commandId, occurredAt: Timestamp.fromMillis(interaction.occurredAt), createdAt: nowTimestamp });
      }
      if (dealRef) transaction.update(dealRef, { ...dealUpdate, ...(parsed.data.nextActionType ? actionUpdate : {}) });
      else if (opportunityRef && parsed.data.nextActionType) transaction.update(opportunityRef, actionUpdate);
      else if (targetId !== contactRef.id && parsed.data.nextActionType) transaction.update(targetRef, { "relationship.nextActionType": parsed.data.nextActionType, "relationship.nextActionAt": timestamp(parsed.data.nextActionAt), updatedAt: nowTimestamp });

      transaction.create(interactionRef, {
        ...interaction,
        occurredAt: Timestamp.fromMillis(interaction.occurredAt),
        nextActionAt: timestamp(interaction.nextActionAt),
        createdAt: nowTimestamp,
      });
      transaction.update(contactRef, {
        relationship: {
          ...relationship,
          lastTouchAt: timestamp(relationship.lastTouchAt),
          nextActionAt: timestamp(relationship.nextActionAt),
        },
        updatedAt: nowTimestamp,
      });
      transaction.create(commandRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        type: "recordInteraction",
        interactionId: interactionRef.id,
        createdAt: nowTimestamp,
      });
      return { interactionId: interactionRef.id };
    }));
  },
);

/**
 * Correcting the account of a conversation the advisor had themselves. The
 * contact it belongs to, the work it is linked to and the next action stay
 * fixed: moving an interaction between people would rewrite two relationship
 * histories at once, and the next action already has complete-or-reschedule.
 * An offer recorded from this conversation keeps its own date and amount --
 * the negotiation history is a separate record and is not rewritten here.
 */
export const updateInteraction = onCall(
  {
    region: "europe-west8",
    cors: true,
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request): Promise<{ interactionId: string }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<unknown>(request.data, { command: true });
    const commandId = envelope.commandId!;
    const parsed = interactionEditSchema.safeParse(envelope.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "Interaction edit is invalid.", parsed.error.flatten());
    }
    const occurredAtError = interactionOccurredAtError(parsed.data.occurredAt, Date.now());
    if (occurredAtError) throw new HttpsError("invalid-argument", occurredAtError);

    const firestore = getFirestore();
    const commandRef = firestore.collection("commands").doc(commandId);
    const interactionRef = firestore.collection("interactions").doc(parsed.data.interactionId);

    return observeApiRequest("updateInteraction", envelope.requestId, () => firestore.runTransaction(async (transaction) => {
      const [commandSnapshot, interactionSnapshot] = await Promise.all([
        transaction.get(commandRef),
        transaction.get(interactionRef),
      ]);
      if (commandSnapshot.exists) {
        const receipt = commandSnapshot.data()!;
        if (receipt.officeId !== claims.officeId || receipt.ownerUid !== claims.uid || receipt.type !== "updateInteraction") {
          throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        }
        return { interactionId: receipt.interactionId as string };
      }
      if (!interactionSnapshot.exists) throw new HttpsError("not-found", "Interaction was not found.");

      const stored = interactionSnapshot.data()!;
      const canManageInteraction = stored.officeId === claims.officeId &&
        (stored.ownerUid === claims.uid || claims.role === "broker");
      if (!canManageInteraction) throw new HttpsError("permission-denied", "Interaction is outside your workspace.");

      const contactRef = firestore.collection("contacts").doc(stored.contactId as string);
      const contactSnapshot = await transaction.get(contactRef);
      const contact = contactSnapshot.data();
      if (!contact || contact.officeId !== claims.officeId || (contact.ownerUid !== claims.uid && claims.role !== "broker") || contact.deletedAt !== null) {
        throw new HttpsError("permission-denied", "Contact is outside your workspace.");
      }

      const storedRelationship = contact.relationship as DocumentData;
      const relationship = applyInteractionEditToRelationship(
        {
          ...(storedRelationship as Contact["relationship"]),
          lastTouchAt: storedRelationship.lastTouchAt instanceof Timestamp ? storedRelationship.lastTouchAt.toMillis() : null,
          nextActionAt: storedRelationship.nextActionAt instanceof Timestamp ? storedRelationship.nextActionAt.toMillis() : null,
        },
        {
          direction: stored.direction as Interaction["direction"],
          occurredAt: stored.occurredAt instanceof Timestamp ? stored.occurredAt.toMillis() : 0,
        },
        {
          direction: parsed.data.direction,
          objective: parsed.data.objective,
          askOutcome: parsed.data.askOutcome,
          occurredAt: parsed.data.occurredAt,
        },
      );

      const now = Timestamp.now();
      transaction.update(interactionRef, {
        channel: parsed.data.channel,
        objective: parsed.data.objective,
        direction: parsed.data.direction,
        outcome: parsed.data.outcome,
        askOutcome: parsed.data.askOutcome,
        noteSummary: parsed.data.noteSummary || null,
        occurredAt: Timestamp.fromMillis(parsed.data.occurredAt),
        editedAt: now,
      });
      transaction.update(contactRef, {
        relationship: {
          ...relationship,
          lastTouchAt: timestamp(relationship.lastTouchAt),
          nextActionAt: timestamp(relationship.nextActionAt),
        },
        updatedAt: now,
      });
      transaction.create(commandRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        type: "updateInteraction",
        interactionId: interactionRef.id,
        createdAt: now,
      });
      return { interactionId: interactionRef.id };
    }));
  },
);
