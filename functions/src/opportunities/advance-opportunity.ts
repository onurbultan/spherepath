import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  assertOpportunityTransitionFor,
  opportunityStageCorrectionSchema,
  opportunityTransitionSchema,
  reconcileMirroredOpenAction,
  type OpportunityStage,
  type OpportunityType,
  type NextActionType,
} from "../../../packages/shared/src/index";
import { requireSpherepathClaims } from "../auth/claims.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";

interface OpportunityDocument {
  officeId: string;
  ownerUid: string;
  stage: OpportunityStage;
  type: OpportunityType;
  subjectContactId: string;
  nextActionAt: Timestamp | null;
  nextActionType: NextActionType | null;
  deletedAt: unknown;
}

export const advanceOpportunity = onCall(
  {
    region: "europe-west8",
    cors: true,
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<unknown>(request.data, { command: true });
    const parsed = opportunityTransitionSchema.safeParse(envelope.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "Opportunity transition is invalid.", parsed.error.flatten());
    }

    const command = parsed.data;
    const firestore = getFirestore();
    const opportunityRef = firestore.collection("opportunities").doc(command.opportunityId);
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const eventRef = firestore.collection("stageEvents").doc();

    return observeApiRequest("advanceOpportunity", envelope.requestId, async () => {
    const result = await firestore.runTransaction(async (transaction) => {
      const [opportunitySnapshot, commandSnapshot] = await Promise.all([
        transaction.get(opportunityRef),
        transaction.get(commandRef),
      ]);

      if (commandSnapshot.exists) {
        const receipt = commandSnapshot.data()!;
        if (receipt.officeId !== claims.officeId || receipt.ownerUid !== claims.uid || receipt.type !== "advanceOpportunity") {
          throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        }
        return receipt as { opportunityId: string; toStage: OpportunityStage; eventId: string };
      }
      if (!opportunitySnapshot.exists) {
        throw new HttpsError("not-found", "Opportunity was not found.");
      }

      const opportunity = opportunitySnapshot.data() as OpportunityDocument;
      const canManage = opportunity.officeId === claims.officeId &&
        (opportunity.ownerUid === claims.uid || claims.role === "broker") && opportunity.deletedAt === null;
      if (!canManage) throw new HttpsError("permission-denied", "Opportunity is outside your workspace.");

      try {
        assertOpportunityTransitionFor(opportunity.type, opportunity.stage, command.toStage);
      } catch {
        throw new HttpsError(
          "failed-precondition",
          `Opportunity cannot move from ${opportunity.stage} to ${command.toStage}.`,
        );
      }

      const closing = command.toStage === "won" || command.toStage === "lost";
      const contactRef = opportunity.subjectContactId
        ? firestore.collection("contacts").doc(opportunity.subjectContactId)
        : null;
      const contactSnapshot = contactRef ? await transaction.get(contactRef) : null;
      const now = Timestamp.now();
      transaction.update(opportunityRef, {
        stage: command.toStage,
        stageEnteredAt: now,
        updatedAt: now,
        closedAt: closing ? now : null,
        lostReason: command.toStage === "lost" ? command.lostReason : null,
        // A record closed as a duplicate is tidying, not a lost deal.
        lostKind: command.toStage === "lost" ? command.lostKind : "lost",
        nextActionAt: command.nextActionAt === null ? null : Timestamp.fromMillis(command.nextActionAt),
        nextActionType: command.nextActionType,
      });
      transaction.create(eventRef, {
        officeId: opportunity.officeId,
        ownerUid: opportunity.ownerUid,
        entityType: "opportunity",
        entityId: opportunityRef.id,
        fromStage: opportunity.stage,
        toStage: command.toStage,
        reason: command.reason,
        commandId: envelope.commandId,
        occurredAt: now,
        createdAt: now,
      });
      const contactActionAt = contactSnapshot?.data()?.relationship?.nextActionAt;
      const opportunityActionAt = opportunity.nextActionAt;
      const contact = contactSnapshot?.data();
      const contactBelongsToOpportunity = contactSnapshot?.exists && contact?.officeId === opportunity.officeId &&
        contact?.ownerUid === opportunity.ownerUid && contact?.deletedAt === null;
      const reconciledAction = contactRef && contactBelongsToOpportunity ? reconcileMirroredOpenAction(
        { type: contactSnapshot.data()?.relationship?.nextActionType ?? null, at: contactActionAt instanceof Timestamp ? contactActionAt.toMillis() : null },
        { type: opportunity.nextActionType, at: opportunityActionAt instanceof Timestamp ? opportunityActionAt.toMillis() : null },
        { type: command.nextActionType, at: command.nextActionAt },
      ) : undefined;
      if (contactRef && reconciledAction) {
        transaction.update(contactRef, {
          "relationship.nextActionAt": reconciledAction.at === null ? null : Timestamp.fromMillis(reconciledAction.at),
          "relationship.nextActionType": reconciledAction.type,
          updatedAt: now,
        });
      }

      const receipt = {
        opportunityId: opportunityRef.id,
        toStage: command.toStage,
        eventId: eventRef.id,
        createdAt: now,
      };
      transaction.create(commandRef, {
        ...receipt,
        officeId: claims.officeId,
        ownerUid: claims.uid,
        type: "advanceOpportunity",
      });
      return receipt;
    });

    return {
      opportunityId: result.opportunityId,
      toStage: result.toStage,
      eventId: result.eventId,
    };
    });
  },
);

export const correctOpportunityStage = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 60 },
  async (request) => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<unknown>(request.data, { command: true });
    const parsed = opportunityStageCorrectionSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Opportunity correction is invalid.", parsed.error.flatten());
    return observeApiRequest("correctOpportunityStage", envelope.requestId, async () => {
      const firestore = getFirestore();
      const opportunityRef = firestore.collection("opportunities").doc(parsed.data.opportunityId);
      const commandRef = firestore.collection("commands").doc(envelope.commandId!);
      const eventRef = firestore.collection("stageEvents").doc();
      return firestore.runTransaction(async (transaction) => {
        const [opportunitySnapshot, commandSnapshot] = await Promise.all([transaction.get(opportunityRef), transaction.get(commandRef)]);
        if (commandSnapshot.exists) {
          const receipt = commandSnapshot.data()!;
          if (receipt.officeId !== claims.officeId || receipt.ownerUid !== claims.uid || receipt.type !== "correctOpportunityStage") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
          return { opportunityId: receipt.opportunityId as string, toStage: receipt.toStage as OpportunityStage, eventId: receipt.eventId as string };
        }
        if (!opportunitySnapshot.exists) throw new HttpsError("not-found", "Opportunity was not found.");
        const opportunity = opportunitySnapshot.data() as OpportunityDocument;
        const canManage = opportunity.officeId === claims.officeId && (opportunity.ownerUid === claims.uid || claims.role === "broker") && opportunity.deletedAt === null;
        if (!canManage) throw new HttpsError("permission-denied", "Opportunity is outside your workspace.");
        if (opportunity.stage === parsed.data.toStage) throw new HttpsError("failed-precondition", "Opportunity is already in that stage.");
        const terminal = parsed.data.toStage === "won" || parsed.data.toStage === "lost";
        const contactRef = opportunity.subjectContactId ? firestore.collection("contacts").doc(opportunity.subjectContactId) : null;
        const contactSnapshot = contactRef ? await transaction.get(contactRef) : null;
        const now = Timestamp.now();
        transaction.update(opportunityRef, { stage: parsed.data.toStage, stageEnteredAt: now, updatedAt: now, closedAt: terminal ? now : null, lostReason: parsed.data.toStage === "lost" ? parsed.data.lostReason : null, lostKind: parsed.data.toStage === "lost" ? parsed.data.lostKind : "lost", nextActionAt: parsed.data.nextActionAt === null ? null : Timestamp.fromMillis(parsed.data.nextActionAt), nextActionType: parsed.data.nextActionType });
        const contactActionAt = contactSnapshot?.data()?.relationship?.nextActionAt;
        const contact = contactSnapshot?.data();
        const contactBelongsToOpportunity = contactSnapshot?.exists && contact?.officeId === opportunity.officeId &&
          contact?.ownerUid === opportunity.ownerUid && contact?.deletedAt === null;
        const reconciledAction = contactRef && contactBelongsToOpportunity ? reconcileMirroredOpenAction(
          { type: contactSnapshot.data()?.relationship?.nextActionType ?? null, at: contactActionAt instanceof Timestamp ? contactActionAt.toMillis() : null },
          { type: opportunity.nextActionType, at: opportunity.nextActionAt instanceof Timestamp ? opportunity.nextActionAt.toMillis() : null },
          { type: parsed.data.nextActionType, at: parsed.data.nextActionAt },
        ) : undefined;
        if (contactRef && reconciledAction) transaction.update(contactRef, {
          "relationship.nextActionAt": reconciledAction.at === null ? null : Timestamp.fromMillis(reconciledAction.at),
          "relationship.nextActionType": reconciledAction.type,
          updatedAt: now,
        });
        transaction.create(eventRef, { officeId: opportunity.officeId, ownerUid: opportunity.ownerUid, entityType: "opportunity", entityId: opportunityRef.id, fromStage: opportunity.stage, toStage: parsed.data.toStage, reason: `Düzeltme: ${parsed.data.reason}`, correction: true, commandId: envelope.commandId, occurredAt: now, createdAt: now });
        transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "correctOpportunityStage", opportunityId: opportunityRef.id, toStage: parsed.data.toStage, eventId: eventRef.id, createdAt: now });
        return { opportunityId: opportunityRef.id, toStage: parsed.data.toStage, eventId: eventRef.id };
      });
    });
  },
);
