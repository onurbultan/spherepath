import { createHash } from "node:crypto";
import { getFirestore, Timestamp, FieldValue, type DocumentData } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { analyticsEvents, createContact, importIdentityKeys, matchImportContact, mergeImportedChannels, maskSensitiveInboxText, type ImportContact, type ContactImportSource, type ContactImportJob, type ContactImportRow, type Contact, type TenantOwned } from "../../../packages/shared/src/index.js";
import { toStoredContact } from "./contact-store.js";
import { phoneLookupHash, contactPhoneFields } from "./phone-index.js";

export const importHash = (...parts: string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
export const importJobRef = (id: string) => getFirestore().collection("contactImportJobs").doc(id);
export const importRowId = (index: number) => String(index).padStart(6, "0");
const rowRef = (jobId: string, rowId: string) => getFirestore().collection("contactImportRows").doc(`${jobId}_${rowId}`);
export const belongsToImporter = (data: DocumentData | undefined, tenant: TenantOwned) => Boolean(data && data.officeId === tenant.officeId && data.ownerUid === tenant.ownerUid);
export function requireImportOwner(data: DocumentData | undefined, tenant: TenantOwned): asserts data is DocumentData {
  if (!belongsToImporter(data, tenant)) throw new HttpsError("not-found", "Import was not found.");
}
export function importJobView(id: string, data: DocumentData): ContactImportJob {
  return { id, source: data.source, status: data.status, total: data.total, processed: data.processed, created: data.created, merged: data.merged, skipped: data.skipped, conflicts: data.conflicts, createdAt: (data.createdAt as Timestamp).toMillis(), errorCode: data.errorCode ?? null };
}
export function importRowView(data: DocumentData): ContactImportRow {
  return { id: data.rowId, sourceId: data.person.sourceId, ...data.person, ...data.match, matchedName: data.matchedName ?? null, result: data.result ?? null };
}
export function newImportJob(tenant: TenantOwned, source: ContactImportSource, status: string) {
  return { ...tenant, source, status, total: 0, processed: 0, created: 0, merged: 0, skipped: 0, conflicts: 0, cursor: 0, workVersion: 0, selectedRows: [], errorCode: null, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86_400_000) };
}
function candidate(id: string, data: DocumentData) {
  return { id, keys: importIdentityKeys({ phones: [data.phone, ...(data.additionalPhones ?? [])].filter((value): value is string => typeof value === "string" && Boolean(value)), emails: data.emails ?? [] }), archived: data.deletedAt != null || data.privacy?.deletionRequestedAt != null };
}
export const sourceLinkId = (tenant: TenantOwned, source: string, account: string, person: ImportContact) => importHash(tenant.officeId, tenant.ownerUid, source, account, person.sourceId);

export async function stageImport(jobId: string, tenant: TenantOwned, source: ContactImportSource, account: string, people: ImportContact[]) {
  const db = getFirestore();
  const job = importJobRef(jobId);
  const [contacts, links] = await Promise.all([
    db.collection("contacts").where("officeId", "==", tenant.officeId).where("ownerUid", "==", tenant.ownerUid).get(),
    db.collection("contactImportLinks").where("officeId", "==", tenant.officeId).where("ownerUid", "==", tenant.ownerUid).get(),
  ]);
  const candidates = contacts.docs.map((doc) => candidate(doc.id, doc.data()));
  const linked = new Map(links.docs.map((doc) => [doc.id, doc.data().contactId as string]));
  const seen = new Set<string>();
  const eligibleRowIds: string[] = [];
  for (let offset = 0; offset < people.length; offset += 50) {
    const batch = db.batch();
    people.slice(offset, offset + 50).forEach((raw, index) => {
      // No raw note is ever persisted, including temporary preview rows.
      const masked = maskSensitiveInboxText(raw.note);
      const person = { ...raw, note: masked.masked ? masked.text : raw.note, noteMasked: masked.masked || raw.noteMasked };
      if (source === "google_csv") person.sourceId = importHash(person.fullName, ...person.phones, ...person.emails, person.note);
      const linkId = sourceLinkId(tenant, source, account, person);
      let match = matchImportContact(person, candidates, linked.get(linkId));
      const keys = [linkId, ...importIdentityKeys(person)];
      if (keys.some((key) => seen.has(key)) && match.status !== "invalid") match = { status: "review", contactId: null, reason: "duplicate" };
      keys.forEach((key) => seen.add(key));
      const rowId = importRowId(offset + index);
      if (["new", "matched"].includes(match.status)) eligibleRowIds.push(rowId);
      batch.set(rowRef(jobId, rowId), { ...tenant, jobId, rowId, person, match, matchedName: contacts.docs.find((doc) => doc.id === match.contactId)?.data().fullName ?? null, linkId, result: null, contactId: null, expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86_400_000) });
    });
    await batch.commit();
  }
  await db.runTransaction(async (tx) => {
    const current = (await tx.get(job)).data();
    requireImportOwner(current, tenant);
    if (current.status === "preparing") tx.update(job, { status: "preview", total: people.length, eligibleRowIds });
  });
}

/** Each row, contact, provenance link, note and counter commit atomically. */
async function applyImportRow(jobId: string, index: number) {
  const db = getFirestore();
  const jobRef = importJobRef(jobId);
  const reference = rowRef(jobId, importRowId(index));
  await db.runTransaction(async (tx) => {
    const [jobSnapshot, rowSnapshot] = await Promise.all([tx.get(jobRef), tx.get(reference)]);
    const job = jobSnapshot.data(), row = rowSnapshot.data();
    if (!job || job.status !== "processing" || !row || row.result) return;
    const tenant = { officeId: job.officeId as string, ownerUid: job.ownerUid as string };
    requireImportOwner(row, tenant);
    const selected = (job.selectedRows as string[]).includes(row.rowId as string);
    let result: "created" | "merged" | "skipped" | "conflict" = "skipped";
    let contactId: string | null = null;
    if (selected) {
      const person = row.person as ImportContact;
      const linkRef = db.collection("contactImportLinks").doc(row.linkId as string);
      // This per-advisor fence serializes imports from multiple jobs, including
      // name-only records whose identity lives solely in the provenance link.
      const fenceRef = db.collection("contactImportLocks").doc(importHash(tenant.officeId, tenant.ownerUid));
      const identityRefs = importIdentityKeys(person).map((key) => db.collection("contactImportIdentities").doc(importHash(tenant.officeId, tenant.ownerUid, key)));
      const phoneHashes = [...new Set(person.phones.map(phoneLookupHash).filter((value): value is string => Boolean(value)))];
      const [identities, phoneMatches, link, fence] = await Promise.all([
        identityRefs.length ? tx.getAll(...identityRefs) : Promise.resolve([]),
        phoneHashes.length ? tx.get(db.collection("contacts").where("phoneHash", "in", phoneHashes)) : Promise.resolve(null),
        tx.get(linkRef), tx.get(fenceRef),
      ]);
      const ids = new Set<string>([...identities.map((doc) => doc.data()?.contactId), link.data()?.contactId, row.match.contactId].filter((id): id is string => typeof id === "string"));
      const linkedContacts = ids.size ? await tx.getAll(...[...ids].map((id) => db.collection("contacts").doc(id))) : [];
      const contacts = [...new Map([...(phoneMatches?.docs ?? []), ...linkedContacts].filter((doc) => doc.exists && belongsToImporter(doc.data(), tenant)).map((doc) => [doc.id, doc])).values()];
      const deletedIdentity = identities.some((identity) => identity.exists && !contacts.some((contact) => contact.id === identity.data()?.contactId));
      const fresh = matchImportContact(person, contacts.map((doc) => candidate(doc.id, doc.data()!)), link.data()?.contactId as string | undefined);
      const expected = row.match as ContactImportRow;
      if (deletedIdentity || !["new", "matched"].includes(expected.status) || fresh.status !== expected.status || fresh.contactId !== expected.contactId) {
        result = "conflict";
      } else {
        const now = Date.now();
        contactId = fresh.contactId ?? `import_${importHash(jobId, row.rowId as string)}`;
        const contactRef = db.collection("contacts").doc(contactId);
        const previous = contacts.find((doc) => doc.id === contactId)?.data() as Contact | undefined;
        const noteId = importHash(contactId, person.note);
        const noteRef = db.collection("contactImportNotes").doc(noteId);
        const noteSnapshot = person.note ? await tx.get(noteRef) : null;
        if (previous) {
          const channels = mergeImportedChannels(previous, person);
          tx.update(contactRef, { ...channels, ...contactPhoneFields(channels.phone), updatedAt: Timestamp.fromMillis(now) });
          result = "merged";
        } else {
          const contact = createContact({ fullName: person.fullName, phone: person.phones[0] ?? "", metAtPlace: "", source: "address_book", role: "unknown" }, tenant, now);
          tx.create(contactRef, toStoredContact({ ...contact, metAt: null, additionalPhones: person.phones.slice(1), emails: person.emails.map((email) => email.toLowerCase()) }));
          result = "created";
        }
        if (person.note && !noteSnapshot?.exists) tx.create(noteRef, { ...tenant, contactId, text: person.note, masked: person.noteMasked, source: job.source, sourceLinkId: row.linkId, jobId, importedAt: Timestamp.fromMillis(now), sourceDate: null });
        tx.set(linkRef, { ...tenant, contactId, source: job.source, updatedAt: Timestamp.fromMillis(now) });
        identityRefs.forEach((ref) => tx.set(ref, { ...tenant, contactId }));
        tx.set(fenceRef, { ...tenant, version: Number(fence.data()?.version ?? 0) + 1 });
      }
    }
    tx.update(reference, { result, contactId });
    tx.update(jobRef, { processed: FieldValue.increment(1), [result === "conflict" ? "conflicts" : result]: FieldValue.increment(1) });
  });
}

export async function processImportBatch(jobId: string) {
  const ref = importJobRef(jobId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || data.status !== "processing") return;
  const cursor = Number(data.cursor);
  const end = Math.min(cursor + 20, Number(data.total));
  try {
    for (let index = cursor; index < end; index++) await applyImportRow(jobId, index);
    await getFirestore().runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      if (!current || current.status !== "processing" || current.cursor !== cursor) return;
      tx.update(ref, { cursor: end, workVersion: FieldValue.increment(1), status: end === current.total ? "completed" : "processing", updatedAt: Timestamp.now() });
      if (end === current.total) tx.create(getFirestore().collection("auditEvents").doc(`import-completed-${jobId}`), { officeId: current.officeId, ownerUid: current.ownerUid, actorUid: "system", action: analyticsEvents.CONTACT_IMPORT_COMPLETED, entityType: "contact_import", entityId: jobId, metadata: { created: current.created, merged: current.merged, skipped: current.skipped, conflicts: current.conflicts, source: current.source }, createdAt: Timestamp.now() });
    });
  } catch {
    // The user can resume with a new workVersion; completed rows stay immutable.
    await getFirestore().runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      if (current?.status === "processing" && current.cursor === cursor) tx.update(ref, { status: "failed", errorCode: "import_failed" });
    });
  }
}

export const processContactImport = onDocumentWritten({ document: "contactImportJobs/{jobId}", region: "europe-west8", memory: "512MiB", timeoutSeconds: 300, retry: true }, async (event) => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (after?.status === "processing" && (before?.status !== "processing" || before?.workVersion !== after.workVersion)) await processImportBatch(event.params.jobId);
});

export const purgeContactImportPreviews = onSchedule({ schedule: "every 24 hours", region: "europe-west8", timeoutSeconds: 540 }, async () => {
  const db = getFirestore();
  for (const collection of ["contactImportRows", "contactImportJobs", "contactImportOAuthStates"]) {
    for (let page = 0; page < 30; page++) {
      const expired = await db.collection(collection).where("expiresAt", "<", Timestamp.now()).limit(300).get();
      if (expired.empty) break;
      const batch = db.batch();
      expired.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
});
