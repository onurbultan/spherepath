import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  createDataSubjectRequestSchema,
  resolveDataSubjectRequestSchema,
  type ContactDataExport,
  type DataSubjectRequestStatus,
  type DataSubjectRequestView,
} from "../../../packages/shared/src/index.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims, type SpherepathClaims } from "../auth/claims.js";

const callableOptions = { region: "europe-west8" as const, cors: true, maxInstances: 10, memory: "256MiB" as const, timeoutSeconds: 60 };

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function canManage(data: DocumentData, claims: SpherepathClaims) {
  return data.officeId === claims.officeId && (data.ownerUid === claims.uid || claims.role === "broker");
}

function requestView(id: string, data: DocumentData, contactName: string): DataSubjectRequestView {
  return {
    id,
    contactId: data.contactId as string,
    contactName,
    type: data.type,
    status: data.status as DataSubjectRequestStatus,
    requesterReference: typeof data.requesterReference === "string" && data.requesterReference ? data.requesterReference : null,
    details: typeof data.details === "string" && data.details ? data.details : null,
    dueAt: millis(data.dueAt) ?? 0,
    resolutionNote: typeof data.resolutionNote === "string" ? data.resolutionNote : null,
    resolvedAt: millis(data.resolvedAt),
    createdAt: millis(data.createdAt) ?? 0,
    updatedAt: millis(data.updatedAt) ?? 0,
  };
}

export const createDataSubjectRequest = onCall(callableOptions, async (request): Promise<{ request: DataSubjectRequestView }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = createDataSubjectRequestSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Data subject request is invalid.", parsed.error.flatten());
  const firestore = getFirestore();
  const contactRef = firestore.collection("contacts").doc(parsed.data.contactId);
  const officeRef = firestore.collection("offices").doc(claims.officeId);
  const commandRef = firestore.collection("commands").doc(envelope.commandId!);
  const requestRef = firestore.collection("dataSubjectRequests").doc();
  const requestId = await observeApiRequest("createDataSubjectRequest", envelope.requestId, () => firestore.runTransaction(async (transaction) => {
    const [receipt, contactSnapshot, officeSnapshot] = await Promise.all([
      transaction.get(commandRef), transaction.get(contactRef), transaction.get(officeRef),
    ]);
    if (receipt.exists) {
      const data = receipt.data()!;
      if (!canManage(data, claims) || data.type !== "createDataSubjectRequest") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
      return data.requestId as string;
    }
    if (!contactSnapshot.exists || !canManage(contactSnapshot.data()!, claims)) throw new HttpsError("not-found", "Contact was not found.");
    const country = officeSnapshot.data()?.country === "TRNC" ? "TRNC" : "TR";
    const responseDays = country === "TRNC" && parsed.data.type === "profiling_objection" ? 21 : 30;
    const now = Date.now();
    const nowTimestamp = Timestamp.fromMillis(now);
    transaction.create(requestRef, {
      officeId: claims.officeId,
      ownerUid: contactSnapshot.data()!.ownerUid,
      createdByUid: claims.uid,
      contactId: parsed.data.contactId,
      type: parsed.data.type,
      status: "pending_verification",
      requesterReference: parsed.data.requesterReference || null,
      details: parsed.data.details || null,
      dueAt: Timestamp.fromMillis(now + responseDays * 86_400_000),
      resolutionNote: null,
      resolvedAt: null,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    });
    if (parsed.data.type === "deletion") transaction.update(contactRef, { "privacy.deletionRequestedAt": nowTimestamp, updatedAt: nowTimestamp });
    transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "createDataSubjectRequest", requestId: requestRef.id, createdAt: nowTimestamp });
    return requestRef.id;
  }));
  const [snapshot, contactSnapshot] = await Promise.all([firestore.collection("dataSubjectRequests").doc(requestId).get(), contactRef.get()]);
  const contactName = contactSnapshot.data()?.fullName ?? contactSnapshot.data()?.label ?? "İsimsiz kişi";
  return { request: requestView(snapshot.id, snapshot.data()!, contactName) };
});

export const listDataSubjectRequests = onCall(callableOptions, async (request): Promise<{ requests: DataSubjectRequestView[] }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<undefined>(request.data);
  return observeApiRequest("listDataSubjectRequests", envelope.requestId, async () => {
    let query: FirebaseFirestore.Query = getFirestore().collection("dataSubjectRequests").where("officeId", "==", claims.officeId);
    if (claims.role !== "broker") query = query.where("ownerUid", "==", claims.uid);
    const snapshot = await query.limit(100).get();
    const contactIds = [...new Set(snapshot.docs.map((item) => item.data().contactId as string))];
    const contactSnapshots = await Promise.all(contactIds.map((id) => getFirestore().collection("contacts").doc(id).get()));
    const names = new Map(contactSnapshots.map((item) => [item.id, item.data()?.fullName ?? item.data()?.label ?? "Silinmiş kişi"]));
    return { requests: snapshot.docs.map((item) => requestView(item.id, item.data(), names.get(item.data().contactId as string) ?? "Silinmiş kişi")).sort((a, b) => b.createdAt - a.createdAt) };
  });
});

export const resolveDataSubjectRequest = onCall(callableOptions, async (request): Promise<{ requestId: string; status: DataSubjectRequestStatus }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = resolveDataSubjectRequestSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Data subject resolution is invalid.", parsed.error.flatten());
  const firestore = getFirestore();
  const requestRef = firestore.collection("dataSubjectRequests").doc(parsed.data.requestId);
  const commandRef = firestore.collection("commands").doc(envelope.commandId!);
  const deletionJobRef = firestore.collection("deletionJobs").doc();
  const status = await observeApiRequest("resolveDataSubjectRequest", envelope.requestId, () => firestore.runTransaction(async (transaction) => {
    const [receipt, requestSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(requestRef)]);
    if (receipt.exists) {
      const data = receipt.data()!;
      if (!canManage(data, claims) || data.type !== "resolveDataSubjectRequest") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
      return data.status as DataSubjectRequestStatus;
    }
    if (!requestSnapshot.exists || !canManage(requestSnapshot.data()!, claims)) throw new HttpsError("not-found", "Data subject request was not found.");
    const data = requestSnapshot.data()!;
    if (data.status !== "pending_verification") throw new HttpsError("failed-precondition", "Data subject request was already resolved.");
    const contactRef = firestore.collection("contacts").doc(data.contactId as string);
    const contactSnapshot = await transaction.get(contactRef);
    if (!contactSnapshot.exists || !canManage(contactSnapshot.data()!, claims)) throw new HttpsError("not-found", "Contact was not found.");
    const now = Timestamp.now();
    let nextStatus: DataSubjectRequestStatus = parsed.data.decision === "rejected" ? "rejected" : "completed";
    if (parsed.data.decision === "approved" && data.type === "profiling_objection") {
      transaction.update(contactRef, { "privacy.profilingObjection": true, updatedAt: now });
    }
    if (parsed.data.decision === "approved" && data.type === "correction") {
      if (!parsed.data.correctedContact) throw new HttpsError("invalid-argument", "Approved correction requires corrected contact data.");
      const corrected = parsed.data.correctedContact;
      transaction.update(contactRef, {
        fullName: corrected.fullName,
        phone: corrected.phone || null,
        phoneHash: null,
        metAtPlace: corrected.metAtPlace || null,
        source: corrected.source,
        roles: [corrected.role],
        updatedAt: now,
      });
    }
    if (parsed.data.decision === "approved" && data.type === "deletion") {
      nextStatus = "processing";
      transaction.create(deletionJobRef, {
        officeId: claims.officeId,
        ownerUid: data.ownerUid,
        contactId: data.contactId,
        requestId: requestRef.id,
        status: "queued",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (parsed.data.decision === "rejected" && data.type === "deletion") {
      transaction.update(contactRef, { "privacy.deletionRequestedAt": null, updatedAt: now });
    }
    transaction.update(requestRef, {
      status: nextStatus,
      resolutionNote: parsed.data.resolutionNote,
      resolvedAt: nextStatus === "processing" ? null : now,
      updatedAt: now,
    });
    transaction.create(firestore.collection("auditEvents").doc(), {
      officeId: claims.officeId,
      actorUid: claims.uid,
      action: "data_subject_request_resolved",
      entityType: "data_subject_request",
      entityId: requestRef.id,
      metadata: { requestType: data.type, decision: parsed.data.decision },
      createdAt: now,
    });
    transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "resolveDataSubjectRequest", requestId: requestRef.id, status: nextStatus, createdAt: now });
    return nextStatus;
  }));
  return { requestId: parsed.data.requestId, status };
});

async function records(collection: string, field: string, contactId: string, officeId: string): Promise<Array<Record<string, unknown> & { id: string }>> {
  const snapshot = await getFirestore().collection(collection).where(field, "==", contactId).limit(200).get();
  return snapshot.docs
    .filter((item) => item.data().officeId === officeId)
    .map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
}

function publicRecord(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !["officeId", "ownerUid", "storagePath", "processingEventId"].includes(key)));
}

export const getContactDataExport = onCall(callableOptions, async (request): Promise<{ export: ContactDataExport }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<{ contactId?: unknown }>(request.data);
  if (typeof envelope.data?.contactId !== "string") throw new HttpsError("invalid-argument", "contactId is invalid.");
  const contactId = envelope.data.contactId;
  return observeApiRequest("getContactDataExport", envelope.requestId, async () => {
    const firestore = getFirestore();
    const contactSnapshot = await firestore.collection("contacts").doc(contactId).get();
    if (!contactSnapshot.exists || !canManage(contactSnapshot.data()!, claims)) throw new HttpsError("not-found", "Contact was not found.");
    const [interactions, sourceReferrals, referredReferrals, opportunities, presentations, deals, voiceNotes, inboxItems] = await Promise.all([
      records("interactions", "contactId", contactId, claims.officeId),
      records("referrals", "sourceContactId", contactId, claims.officeId),
      records("referrals", "referredContactId", contactId, claims.officeId),
      records("opportunities", "subjectContactId", contactId, claims.officeId),
      records("presentations", "contactId", contactId, claims.officeId),
      records("deals", "buyerContactId", contactId, claims.officeId),
      records("voiceNotes", "contactId", contactId, claims.officeId),
      records("inboxItems", "linkedContactId", contactId, claims.officeId),
    ]);
    const contact = contactSnapshot.data()!;
    const relationship = contact.relationship as DocumentData;
    return { export: {
      generatedAt: Date.now(),
      contact: publicRecord({ id: contactSnapshot.id, ...contact }),
      relationshipSignals: [
        { label: "Anlamlı temas sayısı", value: String(relationship.meaningfulTouchCount ?? 0) },
        { label: "Karşılıklı temas sayısı", value: String(relationship.reciprocalTouchCount ?? 0) },
        { label: "İlişki aşaması", value: String(relationship.stage ?? "unknown") },
        { label: "Referans sayısı", value: String(relationship.referralCount ?? 0) },
      ],
      interactions: interactions.map(publicRecord),
      referrals: [...new Map([...sourceReferrals, ...referredReferrals].map((item) => [item.id, item])).values()].map(publicRecord),
      opportunities: opportunities.map(publicRecord),
      presentations: presentations.map(publicRecord),
      deals: deals.map(publicRecord),
      voiceNotes: voiceNotes.map((item) => publicRecord({
        id: item.id,
        status: item.status,
        durationMs: item.durationMs,
        maskedTranscript: item.maskedTranscript,
        maskedCategories: item.maskedCategories,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      inboxItems: inboxItems.map((item) => publicRecord({ id: item.id, source: item.source, safeText: item.safeText, summary: item.summary, kind: item.kind, status: item.status, appliedActions: item.appliedActions, createdAt: item.createdAt, updatedAt: item.updatedAt })),
    } };
  });
});
