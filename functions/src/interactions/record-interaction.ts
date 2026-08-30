import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  applyInteractionToRelationship,
  createInteraction,
  interactionOccurredAtError,
  manualInteractionSchema,
  type Contact,
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
      const nowTimestamp = Timestamp.fromMillis(now);

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
