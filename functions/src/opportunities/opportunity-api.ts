import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  contactMemorySchema,
  createOpportunity as createOpportunityEntity,
  isOwnerOpportunity,
  opportunityCriteriaSummary,
  opportunityCriteriaUpdateSchema,
  opportunityDraftSchema,
  opportunityImpliedRole,
  opportunityTransactionType,
  type Contact,
  type OpportunityCriteriaUpdate,
  type StageEvent,
  type Opportunity,
  type OpportunityDraft,
} from "../../../packages/shared/src/index";
import { z } from "zod";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims } from "../auth/claims.js";

export interface OpportunityRecord extends Opportunity {
  id: string;
  subjectContactName: string;
  subjectContactMemory: Contact["memory"];
}

export interface OpportunityStageEventRecord extends StageEvent {
  id: string;
}

const opportunityDetailSchema = z.object({ opportunityId: z.string().trim().min(1).max(128) }).strict();

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

function contactMemory(data?: DocumentData): Contact["memory"] {
  const memory = (data?.memory ?? {}) as DocumentData;
  return contactMemorySchema.parse({
    keyThingsToRemember: memory.keyThingsToRemember ?? [],
    propertySituations: memory.propertySituations ?? [],
    propertyPreferences: memory.propertyPreferences ?? {
      transactionType: null,
      propertyTypes: [],
      preferredLocations: [],
      budgetRange: null,
      bedroomCountMin: null,
      livingRoomCountMin: null,
      roomCountMin: null,
      areaMinM2: null,
      areaMaxM2: null,
      mustHaves: [],
      dealBreakers: [],
      timeline: null,
    },
    updatedAt: millis(memory.updatedAt),
  });
}

function toOpportunityRecord(id: string, data: DocumentData, subjectContactName: string, subjectContactMemory: Contact["memory"]): OpportunityRecord {
  return {
    ...(data as Opportunity),
    id,
    subjectContactName,
    subjectContactMemory,
    qualifiedAt: millis(data.qualifiedAt),
    stageEnteredAt: millis(data.stageEnteredAt) ?? 0,
    nextActionAt: millis(data.nextActionAt),
    nextActionType: data.nextActionType ?? null,
    closedAt: millis(data.closedAt),
    // Records written before the distinction existed are ordinary losses.
    lostKind: data.lostKind === "duplicate" ? "duplicate" : "lost",
    deletedAt: millis(data.deletedAt),
    createdAt: millis(data.createdAt) ?? 0,
    updatedAt: millis(data.updatedAt) ?? 0,
  };
}

function toStageEventRecord(id: string, data: DocumentData): OpportunityStageEventRecord {
  return {
    ...(data as StageEvent),
    id,
    occurredAt: millis(data.occurredAt) ?? 0,
    createdAt: millis(data.createdAt) ?? 0,
  };
}

export const getOpportunityDetail = onCall(callableOptions, async (request): Promise<{
  opportunity: OpportunityRecord;
  stageEvents: OpportunityStageEventRecord[];
}> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data);
  const parsed = opportunityDetailSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Opportunity identifier is invalid.");

  return observeApiRequest("getOpportunityDetail", envelope.requestId, async () => {
    const firestore = getFirestore();
    const opportunitySnapshot = await firestore.collection("opportunities").doc(parsed.data.opportunityId).get();
    if (!opportunitySnapshot.exists || opportunitySnapshot.data()?.deletedAt !== null) {
      throw new HttpsError("not-found", "Opportunity was not found.");
    }
    const opportunityData = opportunitySnapshot.data()!;
    const canRead = opportunityData.officeId === claims.officeId &&
      (opportunityData.ownerUid === claims.uid || claims.role === "broker");
    if (!canRead) throw new HttpsError("permission-denied", "Opportunity is outside your workspace.");

    const [contactSnapshot, eventsSnapshot] = await Promise.all([
      firestore.collection("contacts").doc(opportunityData.subjectContactId as string).get(),
      firestore.collection("stageEvents").where("entityId", "==", opportunitySnapshot.id).limit(100).get(),
    ]);
    const contact = contactSnapshot.data();
    const stageEvents = eventsSnapshot.docs
      .filter((item) => {
        const data = item.data();
        return data.entityType === "opportunity" && data.officeId === claims.officeId &&
          (data.ownerUid === claims.uid || claims.role === "broker");
      })
      .map((item) => toStageEventRecord(item.id, item.data()))
      .sort((left, right) => right.occurredAt - left.occurredAt);

    return {
      opportunity: toOpportunityRecord(
        opportunitySnapshot.id,
        opportunityData,
        (contact?.fullName ?? contact?.label ?? "İsimsiz kişi") as string,
        contactMemory(contact),
      ),
      stageEvents,
    };
  });
});

export const listOpportunities = onCall(callableOptions, async (request): Promise<{ opportunities: OpportunityRecord[] }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<undefined>(request.data);
  return observeApiRequest("listOpportunities", envelope.requestId, async () => {
    const firestore = getFirestore();
    let opportunitiesQuery: FirebaseFirestore.Query = firestore.collection("opportunities").where("officeId", "==", claims.officeId);
    if (claims.role !== "broker") opportunitiesQuery = opportunitiesQuery.where("ownerUid", "==", claims.uid);
    const snapshot = await opportunitiesQuery.limit(1_000).get();
    const activeDocuments = snapshot.docs.filter((item) => item.data().deletedAt === null);
    const contactIds = [...new Set(activeDocuments.map((item) => item.data().subjectContactId as string))];
    const contactSnapshots = contactIds.length
      ? await firestore.getAll(...contactIds.map((id) => firestore.collection("contacts").doc(id)))
      : [];
    const contacts = new Map(contactSnapshots.map((item) => [item.id, item.data()]));
    const opportunities = activeDocuments
      .map((item) => {
        const contact = contacts.get(item.data().subjectContactId as string);
        return toOpportunityRecord(
          item.id,
          item.data(),
          (contact?.fullName ?? contact?.label ?? "İsimsiz kişi") as string,
          contactMemory(contact),
        );
      })
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
      // The opportunity states the role, so the contact should stop saying it
      // does not know one. An advisor-set role is never overwritten.
      const impliedRole = opportunityImpliedRole(parsed.data.type);
      const storedRoles = (contact.roles ?? []) as string[];
      if (!storedRoles.includes(impliedRole)) {
        transaction.update(contactSnapshot.ref, {
          roles: [...storedRoles.filter((role) => role !== "unknown"), impliedRole],
          updatedAt: Timestamp.fromMillis(now),
        });
      }
      transaction.create(eventRef, {
        officeId: contact.officeId,
        ownerUid: contact.ownerUid,
        entityType: "opportunity",
        entityId: opportunityRef.id,
        fromStage: null,
        toStage: "new_lead",
        reason: "Fırsat oluşturuldu",
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
    return { opportunity: toOpportunityRecord(
      opportunitySnapshot.id,
      opportunitySnapshot.data()!,
      (contact?.fullName ?? contact?.label ?? "İsimsiz kişi") as string,
      contactMemory(contact),
    ) };
  });
});

export const updateOpportunityCriteria = onCall(callableOptions, async (request): Promise<{ opportunityId: string }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<OpportunityCriteriaUpdate>(request.data, { command: true });
  const parsed = opportunityCriteriaUpdateSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Opportunity criteria are invalid.", parsed.error.flatten());

  return observeApiRequest("updateOpportunityCriteria", envelope.requestId, async () => {
    const firestore = getFirestore();
    const opportunityRef = firestore.collection("opportunities").doc(parsed.data.opportunityId);
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    await firestore.runTransaction(async (transaction) => {
      const [receipt, opportunitySnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(opportunityRef)]);
      if (receipt.exists) {
        const data = receipt.data()!;
        if (data.officeId !== claims.officeId || data.ownerUid !== claims.uid || data.type !== "updateOpportunityCriteria") {
          throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        }
        return;
      }
      if (!opportunitySnapshot.exists) throw new HttpsError("not-found", "Opportunity was not found.");
      const opportunity = opportunitySnapshot.data()!;
      if (opportunity.officeId !== claims.officeId || (opportunity.ownerUid !== claims.uid && claims.role !== "broker") || opportunity.deletedAt instanceof Timestamp) {
        throw new HttpsError("permission-denied", "Opportunity is outside your workspace.");
      }
      const contactRef = firestore.collection("contacts").doc(opportunity.subjectContactId as string);
      const contactSnapshot = await transaction.get(contactRef);
      if (!contactSnapshot.exists) throw new HttpsError("not-found", "Opportunity contact was not found.");
      const contact = contactSnapshot.data()!;
      if (contact.officeId !== claims.officeId || (contact.ownerUid !== claims.uid && claims.role !== "broker") || contact.deletedAt instanceof Timestamp) {
        throw new HttpsError("permission-denied", "Opportunity contact is outside your workspace.");
      }

      const type = opportunity.type as Opportunity["type"];
      const propertyContext = isOwnerOpportunity(type) ? "subject_property" : "search_preference";
      const preferences = { ...parsed.data.preferences, transactionType: opportunityTransactionType(type) };
      const currentMemory = contactMemory(contact);
      const nextSituation = { propertyContext, summary: opportunityCriteriaSummary(type, preferences), propertyPreferences: preferences };
      const matchingIndex = currentMemory.propertySituations.findIndex((item) => item.propertyContext === propertyContext);
      const propertySituations = matchingIndex >= 0
        ? currentMemory.propertySituations.map((item, index) => index === matchingIndex ? nextSituation : item)
        : [nextSituation, ...currentMemory.propertySituations].slice(0, 3);
      const now = Timestamp.now();
      transaction.update(contactRef, {
        memory: {
          ...currentMemory,
          propertyPreferences: propertyContext === "search_preference" ? preferences : currentMemory.propertyPreferences,
          propertySituations,
          updatedAt: now,
        },
        updatedAt: now,
      });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "updateOpportunityCriteria", opportunityId: opportunityRef.id, createdAt: now });
    });
    return { opportunityId: parsed.data.opportunityId };
  });
});
