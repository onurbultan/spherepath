import { getFirestore, FieldPath, Timestamp, FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { analyticsEvents, contactImportLimits, prepareContactImportSchema, getContactImportSchema, commitContactImportSchema, contactImportIdSchema, parseContactCsv, importUtf8Size } from "../../../packages/shared/src/index.js";
import { readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims } from "../auth/claims.js";
import { importJobRef, importHash, newImportJob, stageImport, requireImportOwner, importJobView, importRowView } from "./import-store.js";

const options = { region: "europe-west8" as const, cors: true, memory: "512MiB" as const, timeoutSeconds: 300, maxInstances: 10 };
const parse = <T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpsError("invalid-argument", "Import input is invalid.");
  return result.data;
};

export const prepareContactImport = onCall(options, async (request) => {
  const claims = requireSpherepathClaims(request);
  const tenant = { officeId: claims.officeId, ownerUid: claims.uid };
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const input = parse(prepareContactImportSchema, envelope.data);
  let people;
  try { people = parseContactCsv(input.csv); }
  catch (error) {
    const code = error instanceof Error && ["invalid_csv", "unsupported_csv", "csv_too_large", "too_many_contacts", "empty_import"].includes(error.message) ? error.message : "invalid_csv";
    logger.warn("Contact import validation failed", { endpoint: "prepareContactImport", requestId: envelope.requestId, errorCode: code, csvBytes: importUtf8Size(input.csv) });
    throw new HttpsError("invalid-argument", code);
  }
  const jobId = importHash(tenant.officeId, tenant.ownerUid, "csv", envelope.commandId!);
  const job = importJobRef(jobId);
  const digest = importHash(input.csv);
  const shouldStage = await getFirestore().runTransaction(async (tx) => {
    const previous = (await tx.get(job)).data();
    if (previous) {
      requireImportOwner(previous, tenant);
      if (previous.inputDigest !== digest) throw new HttpsError("already-exists", "Command input changed.");
      // A retry must never overwrite rows once another request staged them.
      return false;
    }
    tx.create(job, { ...newImportJob(tenant, "google_csv", "preparing"), inputDigest: digest });
    return true;
  });
  if (shouldStage) {
    try { await stageImport(jobId, tenant, "google_csv", digest, people); }
    catch {
      await getFirestore().runTransaction(async (tx) => {
        const current = (await tx.get(job)).data();
        if (current?.status === "preparing") tx.update(job, { status: "failed", errorCode: "preview_failed" });
      });
    }
  }
  return { jobId };
});

export const listContactImports = onCall(options, async (request) => {
  const claims = requireSpherepathClaims(request);
  readApiEnvelope(request.data);
  const snapshot = await getFirestore().collection("contactImportJobs").where("officeId", "==", claims.officeId).where("ownerUid", "==", claims.uid).orderBy("createdAt", "desc").limit(20).get();
  return { jobs: snapshot.docs.map((doc) => importJobView(doc.id, doc.data())) };
});

export const getContactImport = onCall(options, async (request) => {
  const claims = requireSpherepathClaims(request);
  const input = parse(getContactImportSchema, readApiEnvelope<unknown>(request.data).data);
  const snapshot = await importJobRef(input.jobId).get();
  const data = snapshot.data();
  requireImportOwner(data, { officeId: claims.officeId, ownerUid: claims.uid });
  if ((data.expiresAt as Timestamp).toMillis() < Date.now()) throw new HttpsError("failed-precondition", "expired");
  let query = getFirestore().collection("contactImportRows").where("jobId", "==", input.jobId).orderBy(FieldPath.documentId());
  if (input.cursor) query = query.startAfter(`${input.jobId}_${input.cursor}`);
  const rows = await query.limit(contactImportLimits.pageSize + 1).get();
  const page = rows.docs.slice(0, contactImportLimits.pageSize);
  // Only IDs cross page boundaries; note payloads remain paginated.
  let eligibleRowIds = Array.isArray(data.eligibleRowIds) ? data.eligibleRowIds as string[] : [];
  if (data.status === "preview" && !Array.isArray(data.eligibleRowIds)) {
    const candidates = await getFirestore().collection("contactImportRows").where("jobId", "==", input.jobId).select("rowId", "match.status").get();
    eligibleRowIds = candidates.docs.filter((doc) => ["new", "matched"].includes(doc.data().match.status as string)).map((doc) => doc.data().rowId as string);
  }
  return { job: importJobView(snapshot.id, data), eligibleRowIds, rows: page.map((doc) => importRowView(doc.data())), nextCursor: rows.size > contactImportLimits.pageSize ? page.at(-1)!.data().rowId as string : null };
});

export const commitContactImport = onCall(options, async (request) => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const input = parse(commitContactImportSchema, envelope.data);
  const rowIds = [...new Set(input.rowIds)].sort();
  const ref = importJobRef(input.jobId);
  await getFirestore().runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    requireImportOwner(data, { officeId: claims.officeId, ownerUid: claims.uid });
    if (data.commitCommandId === envelope.commandId) {
      if (JSON.stringify(data.selectedRows) !== JSON.stringify(rowIds)) throw new HttpsError("already-exists", "Command input changed.");
      return;
    }
    if (data.status !== "preview" || (data.expiresAt as Timestamp).toMillis() < Date.now()) throw new HttpsError("failed-precondition", "Import is not ready.");
    const rows = await tx.get(getFirestore().collection("contactImportRows").where("jobId", "==", input.jobId));
    const eligible = new Set(rows.docs.filter((doc) => ["new", "matched"].includes(doc.data().match.status as string)).map((doc) => doc.data().rowId as string));
    if (rowIds.some((id) => !eligible.has(id))) throw new HttpsError("invalid-argument", "Selection contains unavailable rows.");
    tx.update(ref, { selectedRows: rowIds, commitCommandId: envelope.commandId, status: "processing", workVersion: FieldValue.increment(1) });
    tx.create(getFirestore().collection("auditEvents").doc(`import-confirmed-${input.jobId}`), { officeId: claims.officeId, ownerUid: claims.uid, actorUid: claims.uid, action: analyticsEvents.CONTACT_IMPORT_CONFIRMED, entityType: "contact_import", entityId: input.jobId, metadata: { selected: rowIds.length, source: data.source }, createdAt: Timestamp.now() });
  });
  return { jobId: input.jobId };
});

export const controlContactImport = onCall(options, async (request) => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<{ jobId: unknown; action: unknown }>(request.data, { command: true });
  const jobId = parse(contactImportIdSchema, envelope.data?.jobId);
  const action = envelope.data?.action;
  if (action !== "cancel" && action !== "resume") throw new HttpsError("invalid-argument", "Invalid action.");
  await getFirestore().runTransaction(async (tx) => {
    const ref = importJobRef(jobId);
    const data = (await tx.get(ref)).data();
    requireImportOwner(data, { officeId: claims.officeId, ownerUid: claims.uid });
    const commandRef = getFirestore().collection("commands").doc(importHash(claims.officeId, claims.uid, "controlImport", envelope.commandId!));
    const receipt = (await tx.get(commandRef)).data();
    if (receipt) {
      if (receipt.jobId !== jobId || receipt.action !== action) throw new HttpsError("already-exists", "Command input changed.");
      return;
    }
    if (action === "cancel") {
      if (!["authorizing", "preparing", "preview", "failed"].includes(data.status as string)) throw new HttpsError("failed-precondition", "Import cannot be cancelled.");
      tx.update(ref, { status: "cancelled" });
    } else {
      if (data.status !== "failed" || data.errorCode !== "import_failed" || (data.expiresAt as Timestamp).toMillis() < Date.now()) throw new HttpsError("failed-precondition", "Import cannot be resumed.");
      tx.update(ref, { status: "processing", errorCode: null, workVersion: FieldValue.increment(1) });
    }
    tx.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "controlContactImport", jobId, action, createdAt: Timestamp.now() });
  });
  return { jobId };
});

export const listContactImportNotes = onCall(options, async (request) => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<{ contactId: unknown }>(request.data);
  const contactId = parse(contactImportIdSchema, envelope.data?.contactId);
  const contact = (await getFirestore().collection("contacts").doc(contactId).get()).data();
  if (!contact || contact.officeId !== claims.officeId || (contact.ownerUid !== claims.uid && claims.role !== "broker") || contact.deletedAt != null) throw new HttpsError("not-found", "Contact was not found.");
  const notes = await getFirestore().collection("contactImportNotes").where("contactId", "==", contactId).get();
  return { notes: notes.docs.filter((doc) => doc.data().officeId === claims.officeId && doc.data().ownerUid === contact.ownerUid).map((doc) => {
    const data = doc.data();
    return { id: doc.id, contactId, text: data.text as string, source: data.source as string, importedAt: (data.importedAt as Timestamp).toMillis(), sourceDate: null, masked: data.masked as boolean };
  }).sort((a, b) => b.importedAt - a.importedAt) };
});
