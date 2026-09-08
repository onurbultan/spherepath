import { createHash } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireSpherepathClaims, type SpherepathClaims } from "../auth/claims.js";
import { readApiEnvelope } from "../api/request.js";
import { readQueryPages } from "../api/paged-query.js";

const options = { region: "europe-west8" as const, cors: true, timeoutSeconds: 120, maxInstances: 2 };
// Only business records are disposable. New collections require a conscious choice.
const businessCollections = ["contacts", "interactions", "opportunities", "properties", "listings", "deals", "presentations", "stageEvents", "referrals", "portfolioItems", "matchNotifications", "inboxItems", "voiceNotes", "dailyPlans", "dailyTaskCompletions", "calls", "contactImportJobs", "contactImportRows", "contactImportNotes", "contactImportIdentities", "contactImportLinks", "contactImportLocks", "contactImportOAuthStates", "dataSubjectRequests", "deletionJobs", "auditEvents", "whatsappWebhookEvents", "commands"] as const;
async function enabled(claims: SpherepathClaims): Promise<boolean> {
  if (process.env.FUNCTIONS_EMULATOR !== "true") return false;
  const user = await getAuth().getUser(claims.uid);
  return claims.officeId === `personal-${claims.uid}` && Boolean(user.email?.endsWith("@example.test"));
}
async function preview(claims: SpherepathClaims) {
  const db = getFirestore();
  const groups = await Promise.all(businessCollections.map(async (name) => {
    const docs = await readQueryPages(db.collection(name).where("officeId", "==", claims.officeId).where(name === "matchNotifications" ? "recipientUid" : "ownerUid", "==", claims.uid));
    return [name, docs.filter((doc) => doc.data().type !== "resetTestWorkspace")] as const;
  }));
  const documents: QueryDocumentSnapshot[] = groups.flatMap(([, docs]) => docs);
  const snapshotToken = createHash("sha256").update(documents.map((doc) => `${doc.ref.path}:${doc.updateTime.toMillis()}`).sort().join("\n")).digest("hex");
  return { documents, counts: Object.fromEntries(groups.map(([name, docs]) => [name, docs.length])), snapshotToken, total: documents.length };
}
export const previewTestWorkspaceReset = onCall(options, async (request) => {
  const claims = requireSpherepathClaims(request);
  readApiEnvelope(request.data);
  if (!await enabled(claims)) return { enabled: false, total: 0, counts: {}, snapshotToken: null };
  const { documents: _documents, ...summary } = await preview(claims);
  return { enabled: true, ...summary };
});
export const resetTestWorkspace = onCall(options, async (request) => {
  const claims = requireSpherepathClaims(request);
  if (!await enabled(claims)) throw new HttpsError("permission-denied", "Test reset is only available for isolated emulator workspaces.");
  const envelope = readApiEnvelope<{ snapshotToken?: unknown }>(request.data, { command: true });
  const db = getFirestore(); const receiptRef = db.collection("commands").doc(envelope.commandId!);
  const receipt = await receiptRef.get();
  if (receipt.exists) {
    const data = receipt.data()!;
    if (data.officeId !== claims.officeId || data.ownerUid !== claims.uid || data.type !== "resetTestWorkspace") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
    return { deletedCount: data.deletedCount as number };
  }
  const snapshot = await preview(claims);
  if (typeof envelope.data?.snapshotToken !== "string" || snapshot.snapshotToken !== envelope.data.snapshotToken) throw new HttpsError("failed-precondition", "Test verileri değişti. Silme kapsamını yeniden incele.");
  const writer = db.bulkWriter();
  const deletes = snapshot.documents.map((doc) => writer.delete(doc.ref, { lastUpdateTime: doc.updateTime }));
  await writer.close(); await Promise.all(deletes);
  await receiptRef.create({ officeId: claims.officeId, ownerUid: claims.uid, type: "resetTestWorkspace", deletedCount: snapshot.total, createdAt: Timestamp.now() });
  return { deletedCount: snapshot.total };
});
