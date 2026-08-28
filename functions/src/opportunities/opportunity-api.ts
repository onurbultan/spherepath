import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  createOpportunity as createOpportunityEntity,
  opportunityDraftSchema,
  type Opportunity,
  type OpportunityDraft,
} from "../../../packages/shared/src/index";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims } from "../auth/claims.js";

export interface OpportunityRecord extends Opportunity {
  id: string;
  subjectContactName: string;
}

const callableOptions = {
  region: "europe-west8" as const,
  cors: true,
  maxInstances: 10,
  memory: "256MiB" as const,
  timeoutSeconds: 60,
};

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function timestamp(value: number | null): Timestamp | null {
  return value === null ? null : Timestamp.fromMillis(value);
}

function toStoredOpportunity(opportunity: Opportunity) {
  return {
    ...opportunity,
    qualifiedAt: timestamp(opportunity.qualifiedAt),
    stageEnteredAt: Timestamp.fromMillis(opportunity.stageEnteredAt),
    nextActionAt: timestamp(opportunity.nextActionAt),
    closedAt: timestamp(opportunity.closedAt),
    deletedAt: timestamp(opportunity.deletedAt),
    createdAt: Timestamp.fromMillis(opportunity.createdAt),
    updatedAt: Timestamp.fromMillis(opportunity.updatedAt),
  };
}

function toOpportunityRecord(id: string, data: DocumentData, subjectContactName: string): OpportunityRecord {
  return {
    ...(data as Opportunity),
    id,
    subjectContactName,
    qualifiedAt: millis(data.qualifiedAt),
    stageEnteredAt: millis(data.stageEnteredAt) ?? 0,
    nextActionAt: millis(data.nextActionAt),
    nextActionType: data.nextActionType ?? null,
    closedAt: millis(data.closedAt),
    deletedAt: millis(data.deletedAt),
    createdAt: millis(data.createdAt) ?? 0,
    updatedAt: millis(data.updatedAt) ?? 0,
  };
}

export const listOpportunities = onCall(callableOptions, async (request): Promise<{ opportunities: OpportunityRecord[] }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<undefined>(request.data);
  return observeApiRequest("listOpportunities", envelope.requestId, async () => {
    const firestore = getFirestore();
    let opportunitiesQuery: FirebaseFirestore.Query = firestore.collection("opportunities").where("officeId", "==", claims.officeId);
    if (claims.role !== "broker") opportunitiesQuery = opportunitiesQuery.where("ownerUid", "==", claims.uid);
    const snapshot = await opportunitiesQuery.limit(200).get();
    const activeDocuments = snapshot.docs.filter((item) => item.data().deletedAt === null);
    const contactIds = [...new Set(activeDocuments.map((item) => item.data().subjectContactId as string))];
    const contactSnapshots = contactIds.length
      ? await firestore.getAll(...contactIds.map((id) => firestore.collection("contacts").doc(id)))
      : [];
    const contactNames = new Map(contactSnapshots.map((item) => [
      item.id,
      (item.data()?.fullName ?? item.data()?.label ?? "İsimsiz kişi") as string,
    ]));
    const opportunities = activeDocuments
      .map((item) => toOpportunityRecord(item.id, item.data(), contactNames.get(item.data().subjectContactId) ?? "İsimsiz kişi"))
      .sort((left, right) => right.updatedAt - left.updatedAt);
    return { opportunities };
  });
});

export const createOpportunity = onCall(callableOptions, async (request): Promise<{ opportunity: OpportunityRecord }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<OpportunityDraft>(request.data, { command: true });
  const parsed = opportunityDraftSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Opportunity input is invalid.", parsed.error.flatten());

  return observeApiRequest("createOpportunity", envelope.requestId, async () => {
    const firestore = getFirestore();
    const contactRef = firestore.collection("contacts").doc(parsed.data.subjectContactId);
    const opportunityRef = firestore.collection("opportunities").doc();
    const eventRef = firestore.collection("stageEvents").doc();
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const opportunityId = await firestore.runTransaction(async (transaction) => {
      const [receipt, contactSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(contactRef)]);
      if (receipt.exists) {
        const data = receipt.data()!;
        if (data.officeId !== claims.officeId || data.ownerUid !== claims.uid || data.type !== "createOpportunity") {
          throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        }
        return data.opportunityId as string;
      }
      if (!contactSnapshot.exists) throw new HttpsError("not-found", "Contact was not found.");
      const contact = contactSnapshot.data()!;
      const canManage = contact.officeId === claims.officeId && (contact.ownerUid === claims.uid || claims.role === "broker") && contact.deletedAt === null;
      if (!canManage) throw new HttpsError("permission-denied", "Contact is outside your workspace.");

      const now = Date.now();
      const opportunity = createOpportunityEntity(parsed.data, { officeId: contact.officeId, ownerUid: contact.ownerUid }, now);
      const nowTimestamp = Timestamp.fromMillis(now);
      transaction.create(opportunityRef, toStoredOpportunity(opportunity));
      transaction.create(eventRef, {
        officeId: contact.officeId,
        ownerUid: contact.ownerUid,
        entityType: "opportunity",
        entityId: opportunityRef.id,
        fromStage: null,
        toStage: "new_lead",
        reason: "Opportunity created",
        commandId: envelope.commandId,
        occurredAt: nowTimestamp,
        createdAt: nowTimestamp,
      });
      transaction.create(commandRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        type: "createOpportunity",
        opportunityId: opportunityRef.id,
        eventId: eventRef.id,
        createdAt: nowTimestamp,
      });
      return opportunityRef.id;
    });

    const [opportunitySnapshot, contactSnapshot] = await Promise.all([
      firestore.collection("opportunities").doc(opportunityId).get(),
      contactRef.get(),
    ]);
    const contact = contactSnapshot.data();
    return { opportunity: toOpportunityRecord(opportunitySnapshot.id, opportunitySnapshot.data()!, (contact?.fullName ?? contact?.label ?? "İsimsiz kişi") as string) };
  });
});
