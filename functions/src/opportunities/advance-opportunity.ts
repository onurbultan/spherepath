import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  assertOpportunityTransition,
  opportunityTransitionCommandSchema,
  type OpportunityStage,
} from "../../../packages/shared/src/index";
import { requireSpherepathClaims } from "../auth/claims.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";

interface OpportunityDocument {
  officeId: string;
  ownerUid: string;
  stage: OpportunityStage;
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
    const parsed = opportunityTransitionCommandSchema.safeParse({
      ...(typeof envelope.data === "object" && envelope.data !== null ? envelope.data : {}),
      commandId: envelope.commandId,
    });
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "Opportunity transition is invalid.", parsed.error.flatten());
    }

    const command = parsed.data;
    const firestore = getFirestore();
    const opportunityRef = firestore.collection("opportunities").doc(command.opportunityId);
    const commandRef = firestore.collection("commands").doc(command.commandId);
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
        (opportunity.ownerUid === claims.uid || claims.role === "broker");
      if (!canManage) throw new HttpsError("permission-denied", "Opportunity is outside your workspace.");

      try {
        assertOpportunityTransition(opportunity.stage, command.toStage);
      } catch {
        throw new HttpsError(
          "failed-precondition",
          `Opportunity cannot move from ${opportunity.stage} to ${command.toStage}.`,
        );
      }

      const now = Timestamp.now();
      const closing = command.toStage === "won" || command.toStage === "lost";
      transaction.update(opportunityRef, {
        stage: command.toStage,
        stageEnteredAt: now,
        updatedAt: now,
        closedAt: closing ? now : null,
        lostReason: command.toStage === "lost" ? command.lostReason : null,
      });
      transaction.create(eventRef, {
        officeId: opportunity.officeId,
        ownerUid: opportunity.ownerUid,
        entityType: "opportunity",
        entityId: opportunityRef.id,
        fromStage: opportunity.stage,
        toStage: command.toStage,
        reason: command.reason,
        commandId: command.commandId,
        occurredAt: now,
        createdAt: now,
      });

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
