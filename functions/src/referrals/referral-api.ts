import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createReferral as createReferralEntity, referralDraftSchema, type Referral, type ReferralDraft } from "../../../packages/shared/src/index";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims } from "../auth/claims.js";

export interface ReferralRecord extends Referral { id: string; sourceContactName: string; referredContactName: string }
const options = { region: "europe-west8" as const, cors: true, maxInstances: 10, memory: "256MiB" as const, timeoutSeconds: 60 };
const millis = (value: unknown): number | null => value instanceof Timestamp ? value.toMillis() : null;
function toRecord(id: string, data: DocumentData, sourceContactName: string, referredContactName: string): ReferralRecord { return { ...(data as Referral), id, sourceContactName, referredContactName, firstNoticeCompletedAt: millis(data.firstNoticeCompletedAt), deletedAt: millis(data.deletedAt), createdAt: millis(data.createdAt) ?? 0, updatedAt: millis(data.updatedAt) ?? 0 }; }

export const listReferrals = onCall(options, async (request): Promise<{ referrals: ReferralRecord[] }> => {
  const claims = requireSpherepathClaims(request); const envelope = readApiEnvelope<undefined>(request.data);
  return observeApiRequest("listReferrals", envelope.requestId, async () => {
    const firestore = getFirestore(); let query: FirebaseFirestore.Query = firestore.collection("referrals").where("officeId", "==", claims.officeId); if (claims.role !== "broker") query = query.where("ownerUid", "==", claims.uid);
    const snapshot = await query.limit(200).get(); const documents = snapshot.docs.filter((item) => item.data().deletedAt === null);
    const contactIds = [...new Set(documents.flatMap((item) => [item.data().sourceContactId, item.data().referredContactId]).filter((id): id is string => typeof id === "string"))];
    const contacts = contactIds.length ? await firestore.getAll(...contactIds.map((id) => firestore.collection("contacts").doc(id))) : [];
    const names = new Map(contacts.map((item) => [item.id, (item.data()?.fullName ?? item.data()?.label ?? "İsimsiz kişi") as string]));
    return { referrals: documents.map((item) => toRecord(item.id, item.data(), names.get(item.data().sourceContactId) ?? "İsimsiz kişi", names.get(item.data().referredContactId) ?? item.data().referredLabel ?? "Tanımsız referans")).sort((left, right) => right.createdAt - left.createdAt) };
  });
});

export const createReferral = onCall(options, async (request): Promise<{ referral: ReferralRecord }> => {
  const claims = requireSpherepathClaims(request); const envelope = readApiEnvelope<ReferralDraft>(request.data, { command: true }); const parsed = referralDraftSchema.safeParse(envelope.data); if (!parsed.success) throw new HttpsError("invalid-argument", "Referral input is invalid.", parsed.error.flatten());
  return observeApiRequest("createReferral", envelope.requestId, async () => {
    const firestore = getFirestore(); const sourceRef = firestore.collection("contacts").doc(parsed.data.sourceContactId); const referredRef = parsed.data.referredContactId ? firestore.collection("contacts").doc(parsed.data.referredContactId) : null; const referralRef = firestore.collection("referrals").doc(); const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const result = await firestore.runTransaction(async (transaction) => {
      const [receiptSnapshot, sourceSnapshot, referredSnapshot] = await Promise.all([
        transaction.get(commandRef),
        transaction.get(sourceRef),
        referredRef ? transaction.get(referredRef) : Promise.resolve(null),
      ]);
      if (receiptSnapshot.exists) { const receipt = receiptSnapshot.data()!; if (receipt.officeId !== claims.officeId || receipt.ownerUid !== claims.uid || receipt.type !== "createReferral") throw new HttpsError("permission-denied", "Command receipt is outside your workspace."); return { referralId: receipt.referralId as string, sourceName: receipt.sourceName as string, referredName: receipt.referredName as string }; }
      if (!sourceSnapshot.exists) throw new HttpsError("not-found", "Source contact was not found."); const source = sourceSnapshot.data()!; const canManageSource = source.officeId === claims.officeId && (source.ownerUid === claims.uid || claims.role === "broker") && source.deletedAt === null; if (!canManageSource) throw new HttpsError("permission-denied", "Source contact is outside your workspace.");
      const referred = referredSnapshot?.data(); if (referredRef && (!referredSnapshot?.exists || referred?.officeId !== claims.officeId || (referred?.ownerUid !== claims.uid && claims.role !== "broker") || referred?.deletedAt !== null)) throw new HttpsError("permission-denied", "Referred contact is outside your workspace.");
      const now = Date.now(); const nowTimestamp = Timestamp.fromMillis(now); const entity = createReferralEntity(parsed.data, { officeId: source.officeId, ownerUid: source.ownerUid }, now); const sourceName = (source.fullName ?? source.label ?? "İsimsiz kişi") as string; const referredName = (referred?.fullName ?? referred?.label ?? parsed.data.referredLabel ?? "Tanımsız referans") as string;
      transaction.create(referralRef, { ...entity, firstNoticeCompletedAt: null, deletedAt: null, createdAt: nowTimestamp, updatedAt: nowTimestamp });
      transaction.update(sourceRef, { "relationship.referralCount": (source.relationship?.referralCount ?? 0) + 1, updatedAt: nowTimestamp });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "createReferral", referralId: referralRef.id, sourceName, referredName, createdAt: nowTimestamp });
      return { referralId: referralRef.id, sourceName, referredName };
    });
    const snapshot = await firestore.collection("referrals").doc(result.referralId).get(); return { referral: toRecord(snapshot.id, snapshot.data()!, result.sourceName, result.referredName) };
  });
});
