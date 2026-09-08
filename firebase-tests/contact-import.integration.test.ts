import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { collection, doc, getDocs, query, setDoc, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import type { Contact, ContactImportPage, ContactImportNote } from "../packages/shared/src/index.js";

const projectId = "spherepath-96ecd";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const [firestoreHost, firestorePort] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
const functionsPort = Number(process.env.SPHEREPATH_IMPORT_FUNCTIONS_PORT ?? 5001);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const apps = ["owner", "outsider"].map((name) => initializeApp({ apiKey: "demo-key", projectId, authDomain: `${projectId}.firebaseapp.com` }, `imports-${name}-${runId}`));
const clients = apps.map((app) => {
  const auth = getAuth(app), functions = getFunctions(app, "europe-west8");
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  connectFunctionsEmulator(functions, "127.0.0.1", functionsPort);
  return { auth, functions };
});
let environment: RulesTestEnvironment;
let officeId: string;
let sequence = 0;
function call<T>(endpoint: string, data: unknown, commandId?: string, client = 0): Promise<T> {
  return httpsCallable(clients[client]!.functions, endpoint, { timeout: 120_000 })({ data, requestId: `import-request-${runId}-${sequence++}`, ...(commandId ? { commandId: `${commandId}-${runId}` } : {}) }).then((result) => result.data as T);
}
const getPage = (jobId: string, cursor: string | null = null) => call<ContactImportPage>("getContactImport", { jobId, cursor });
async function completed(jobId: string, maxAttempts = 60) {
  let page = await getPage(jobId);
  for (let attempt = 0; attempt < maxAttempts && page.job.status !== "completed"; attempt++) {
    if (page.job.status === "failed") throw new Error(`Import failed: ${page.job.errorCode}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    page = await getPage(jobId);
  }
  expect(page.job.status).toBe("completed");
  return page;
}
beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host: firestoreHost!, port: Number(firestorePort) } });
  for (const [index, client] of clients.entries()) {
    const credential = await createUserWithEmailAndPassword(client.auth, `contact-import-${index}-${runId}@example.test`, "Test1234!");
    const workspace = await call<{ officeId: string }>("bootstrapWorkspace", { displayName: `Import Test ${index}` }, `bootstrap-${index}`, index);
    if (index === 0) officeId = workspace.officeId;
    await credential.user.getIdToken(true);
  }
}, 30_000);
afterAll(async () => { await Promise.all(apps.map(deleteApp)); await environment?.cleanup(); });

describe("contact import commands", () => {
  it("previews without writing contacts, imports selected rows atomically, and replays without duplicate notes", async () => {
    const csv = 'Name,Phone 1 - Value,Phone 2 - Value,E-mail 1 - Value,Notes\nAyşe Yılmaz,05321234567,05331234567,ayse@example.test,"Bahçeli ev arıyor. Sağlık sorunu var. Ekimde ara."\nMehmet Demir,,,mehmet@example.test,Notu uzun\nTekrar,05321234567,,,Aynı telefon\nX,abc,,,Geçersiz';
    const prepared = await call<{ jobId: string }>("prepareContactImport", { csv }, "prepare-first");
    expect(await call("prepareContactImport", { csv }, "prepare-first")).toEqual(prepared);
    await expect(call("prepareContactImport", { csv: csv + "\nBaşka,,,,Not" }, "prepare-first")).rejects.toThrow();
    const preview = await getPage(prepared.jobId);
    expect(preview.eligibleRowIds).toEqual(["000000", "000001"]);
    expect(preview.rows.map((row) => row.status)).toEqual(["new", "new", "review", "invalid"]);
    expect(preview.rows[0]?.note).not.toContain("Sağlık sorunu");
    expect(preview.rows[0]?.noteMasked).toBe(true);
    expect((await call<{ contacts: unknown[] }>("listContacts", {})).contacts).toHaveLength(0);
    await expect(call("commitContactImport", { jobId: prepared.jobId, rowIds: ["000002"] }, "commit-invalid")).rejects.toThrow();
    const selection = { jobId: prepared.jobId, rowIds: ["000000", "000001"] };
    await Promise.all([call("commitContactImport", selection, "commit-first"), call("commitContactImport", selection, "commit-first")]);
    const result = await completed(prepared.jobId);
    expect(result.job).toMatchObject({ total: 4, processed: 4, created: 2, skipped: 2, conflicts: 0 });
    const contacts = (await call<{ contacts: Array<Contact & { id: string }> }>("listContacts", {})).contacts;
    const ayse = contacts.find((contact) => contact.fullName === "Ayşe Yılmaz")!;
    expect(ayse).toMatchObject({ phone: "05321234567", additionalPhones: ["05331234567"], emails: ["ayse@example.test"], metAt: null, source: "address_book", roles: ["unknown"], relationship: { stage: "new", meaningfulTouchCount: 0, lastTouchAt: null }, privacy: { marketingConsent: "unknown", noticeStatus: "pending" } });
    const notes = await call<{ notes: ContactImportNote[] }>("listContactImportNotes", { contactId: ayse.id });
    expect(notes.notes).toHaveLength(1);
    expect(notes.notes[0]).toMatchObject({ source: "google_csv", sourceDate: null, masked: true });
    const replay = await call<{ jobId: string }>("prepareContactImport", { csv }, "prepare-replay");
    expect((await getPage(replay.jobId)).rows[0]?.status).toBe("matched");
    await call("commitContactImport", { jobId: replay.jobId, rowIds: ["000000", "000001"] }, "commit-replay");
    expect((await completed(replay.jobId)).job).toMatchObject({ created: 0, merged: 2, processed: 4 });
    expect((await call<{ notes: unknown[] }>("listContactImportNotes", { contactId: ayse.id })).notes).toHaveLength(1);
    const access = await call<{ request: { id: string } }>("createDataSubjectRequest", { contactId: ayse.id, type: "access", requesterReference: "Import test", details: "Access request" }, "request-access");
    await call("resolveDataSubjectRequest", { requestId: access.request.id, decision: "approved", resolutionNote: "Identity verified", correctedContact: null }, "approve-access");
    const exported = await call<{ export: { importedNotes: unknown[] } }>("getContactDataExport", { requestId: access.request.id });
    expect(exported.export.importedNotes).toHaveLength(1);
    await environment.withSecurityRulesDisabled(async (context) => {
      const rows = await getDocs(query(collection(context.firestore(), "contactImportRows"), where("jobId", "==", prepared.jobId)));
      expect(JSON.stringify(rows.docs.map((row) => row.data()))).not.toContain("Sağlık sorunu");
      expect(rows.docs.every((row) => row.data().officeId === officeId && row.data().ownerUid === clients[0]!.auth.currentUser!.uid)).toBe(true);
    });
    await expect(call("getContactImport", { jobId: prepared.jobId }, undefined, 1)).rejects.toThrow();
    await expect(call("commitContactImport", selection, "outsider-commit", 1)).rejects.toThrow();
    await expect(call("listContactImportNotes", { contactId: ayse.id }, undefined, 1)).rejects.toThrow();
    await expect(call("finishGoogleContactImport", { state: "invalid", code: "invalid" }, "invalid-google")).rejects.toThrow();
  }, 90_000);

  it("preserves advisor fields, detects changes since preview and paginates all rows", async () => {
    const existing = await call<{ contact: Contact & { id: string } }>("createContact", { fullName: "Danışmanın adı", phone: "05351234567", metAtPlace: "Ofis", source: "referral", role: "seller" }, "create-existing");
    const csv = 'Name,Phone 1 - Value,Notes\nGoogle adı,05351234567,İlk not';
    const job = await call<{ jobId: string }>("prepareContactImport", { csv }, "prepare-existing");
    const page = await getPage(job.jobId);
    expect(page.rows[0]).toMatchObject({ status: "matched", matchedName: "Danışmanın adı" });
    await call("commitContactImport", { jobId: job.jobId, rowIds: ["000000"] }, "commit-existing");
    await completed(job.jobId);
    const after = (await call<{ contacts: Array<Contact & { id: string }> }>("listContacts", {})).contacts.find((contact) => contact.id === existing.contact.id);
    expect(after).toMatchObject({ fullName: "Danışmanın adı", source: "referral", roles: ["seller"], metAtPlace: "Ofis", metAt: existing.contact.metAt });
    // A source not yet linked to this contact must re-check the identity at commit.
    const changed = await call<{ jobId: string }>("prepareContactImport", { csv: csv.replace("İlk not", "Başka not") }, "prepare-conflict");
    await call("archiveContact", { contactId: existing.contact.id }, "archive-existing");
    await call("commitContactImport", { jobId: changed.jobId, rowIds: ["000000"] }, "commit-conflict");
    expect((await completed(changed.jobId)).job.conflicts).toBe(1);
    const largeCsv = "Name,E-mail 1 - Value,Notes\n" + Array.from({ length: 55 }, (_, index) => `Kişi ${index},person${index}@example.test,Not ${index}`).join("\n");
    const large = await call<{ jobId: string }>("prepareContactImport", { csv: largeCsv }, "prepare-pages");
    const first = await getPage(large.jobId);
    expect(first.eligibleRowIds).toHaveLength(55);
    expect(first.eligibleRowIds).toContain("000054");
    expect(first.rows).toHaveLength(50);
    expect(first.nextCursor).toBe("000049");
    const last = await getPage(large.jobId, first.nextCursor);
    expect(last.eligibleRowIds).toEqual(first.eligibleRowIds);
    expect(last.rows).toHaveLength(5);
    expect(last.nextCursor).toBeNull();
    await call("commitContactImport", { jobId: large.jobId, rowIds: ["000054"] }, "commit-last-page");
    expect((await completed(large.jobId)).job).toMatchObject({ processed: 55, created: 1, skipped: 54 });
    const cancelled = await call<{ jobId: string }>("prepareContactImport", { csv }, "prepare-cancel");
    await call("controlContactImport", { jobId: cancelled.jobId, action: "cancel" }, "cancel-job");
    await expect(call("commitContactImport", { jobId: cancelled.jobId, rowIds: ["000000"] }, "commit-cancelled")).rejects.toThrow();
  }, 90_000);
  it("resumes a partially completed batch and suppresses deleted-source replays", async () => {
    const csv = 'Name,Phone 1 - Value,Notes\nSilinecek Kişi,05381234567,Silinecek özel not\nKalacak Kişi,05391234567,Kalacak not';
    const job = await call<{ jobId: string }>("prepareContactImport", { csv }, "prepare-deletion");
    await call("commitContactImport", { jobId: job.jobId, rowIds: ["000000", "000001"] }, "commit-deletion");
    await completed(job.jobId);
    const contacts = (await call<{ contacts: Array<Contact & { id: string }> }>("listContacts", {})).contacts;
    const target = contacts.find((contact) => contact.fullName === "Silinecek Kişi")!;
    const retry = await call<{ jobId: string }>("prepareContactImport", { csv }, "prepare-resume");
    // Simulate a crash after the first row transaction but before cursor advance.
    await environment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "contactImportRows", `${retry.jobId}_000000`), { result: "merged", contactId: target.id });
      await updateDoc(doc(context.firestore(), "contactImportJobs", retry.jobId), { status: "failed", errorCode: "import_failed", selectedRows: ["000000", "000001"], processed: 1, merged: 1 });
    });
    await Promise.all([call("controlContactImport", { jobId: retry.jobId, action: "resume" }, "resume-partial"), call("controlContactImport", { jobId: retry.jobId, action: "resume" }, "resume-partial")]);
    expect((await completed(retry.jobId)).job).toMatchObject({ processed: 2, created: 0, merged: 2 });
    expect((await call<{ notes: unknown[] }>("listContactImportNotes", { contactId: target.id })).notes).toHaveLength(1);
    const pending = await call<{ jobId: string }>("prepareContactImport", { csv }, "preview-before-deletion");
    const request = await call<{ request: { id: string } }>("createDataSubjectRequest", { contactId: target.id, type: "deletion", requesterReference: "Verified test", details: "Delete imported data" }, "request-deletion");
    await call("resolveDataSubjectRequest", { requestId: request.request.id, decision: "approved", resolutionNote: "Identity verified", correctedContact: null }, "approve-deletion");
    let deleted = false;
    for (let attempt = 0; attempt < 40 && !deleted; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const current = (await call<{ contacts: Array<{ id: string }> }>("listContacts", {})).contacts;
      deleted = !current.some((contact) => contact.id === target.id);
    }
    expect(deleted).toBe(true);
    expect((await getPage(pending.jobId)).eligibleRowIds).toEqual(["000001"]);
    await environment.withSecurityRulesDisabled(async (context) => {
      const notes = await getDocs(query(collection(context.firestore(), "contactImportNotes"), where("contactId", "==", target.id)));
      expect(notes.empty).toBe(true);
      const rows = await getDocs(query(collection(context.firestore(), "contactImportRows"), where("jobId", "==", job.jobId)));
      expect(JSON.stringify(rows.docs.map((row) => row.data()))).not.toContain("Silinecek özel not");
    });
    const replay = await call<{ jobId: string }>("prepareContactImport", { csv }, "prepare-deleted-replay");
    expect((await getPage(replay.jobId)).rows[0]).toMatchObject({ status: "review", reason: "archived" });
  }, 90_000);

  it("paginates beyond the previous 1,000-contact cutoff", async () => {
    const sample = await call<{ contact: Contact & { id: string } }>("createContact", { fullName: "Pagination sample", phone: "", metAtPlace: "", source: "other", role: "unknown" }, "pagination-sample", 1);
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const originals = await getDocs(query(collection(db, "contacts"), where("ownerUid", "==", clients[1]!.auth.currentUser!.uid)));
      const data = originals.docs.find((item) => item.id === sample.contact.id)!.data();
      for (let offset = 0; offset < 1001; offset += 400) {
        const batch = writeBatch(db);
        for (let index = offset; index < Math.min(offset + 400, 1001); index++) batch.set(doc(db, "contacts", `pagination-${runId}-${String(index).padStart(4, "0")}`), { ...data, fullName: `Pagination ${index}` });
        await batch.commit();
      }
    });
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { contacts: Array<{ id: string }>; nextCursor: string | null } = await call("listContacts", cursor ? { cursor } : {}, undefined, 1);
      ids.push(...page.contacts.map((contact) => contact.id));
      cursor = page.nextCursor;
    } while (cursor);
    const overview = await call<{ overview: { stages: { acquaintance: number; relationship: number } } }>("getTodayOverview", undefined, undefined, 1);
    expect(overview.overview.stages.acquaintance).toBe(1002);
    expect(overview.overview.stages.relationship).toBe(0);
    expect(ids).toHaveLength(1002);
    expect(new Set(ids).size).toBe(1002);
  }, 90_000);

  it("binds Google completion to its original Spherepath owner and rejects invalid callback state", async () => {
    const state = randomBytes(32).toString("base64url");
    const id = createHash("sha256").update(JSON.stringify([state])).digest("hex");
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "contactImportOAuthStates", id), { officeId, ownerUid: clients[0]!.auth.currentUser!.uid, jobId: "unreachable-job", platform: "web", verifier: "test-verifier", used: false, expiresAt: Timestamp.fromMillis(Date.now() + 60_000) });
    });
    await expect(call("finishGoogleContactImport", { state, code: "test-code" }, "wrong-owner-google", 1)).rejects.toMatchObject({ code: "functions/not-found" });
    const response = await fetch(`http://127.0.0.1:${functionsPort}/${projectId}/europe-west8/googleContactImportCallback?state=invalid&code=test`);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("previews, selects and completes 5,000 address-book rows with their communication fields", async () => {
    const csv = "First Name,Last Name,Display Name,Home Phone,Mobile Phone,E-mail Address,Notes\n" + Array.from({ length: 5_000 }, (_, index) => `Kişi,${index},,${5360000000 + index},${5370000000 + index},large${index}@example.test,Not ${index}`).join("\n");
    await expect(call("prepareContactImport", { csv: csv + "\nFazla,Kişi,,,,," }, "prepare-over-limit")).rejects.toThrow("too_many_contacts");
    const prepared = await call<{ jobId: string }>("prepareContactImport", { csv }, "prepare-5000");
    const first = await getPage(prepared.jobId);
    expect(first.job).toMatchObject({ status: "preview", total: 5_000, processed: 0 });
    expect(first.eligibleRowIds).toHaveLength(5_000);
    expect(first.rows).toHaveLength(50);
    const last = await getPage(prepared.jobId, "004949");
    expect(last.nextCursor).toBeNull();
    expect(last.rows.at(-1)).toMatchObject({ id: "004999", fullName: "Kişi 4999", phones: ["5360004999", "5370004999"], emails: ["large4999@example.test"], note: "Not 4999" });
    const selection = { jobId: prepared.jobId, rowIds: first.eligibleRowIds };
    await call("commitContactImport", selection, "commit-5000");
    expect((await completed(prepared.jobId, 900)).job).toMatchObject({ total: 5_000, processed: 5_000, created: 5_000, merged: 0, skipped: 0, conflicts: 0 });
    await call("commitContactImport", selection, "commit-5000");
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const rows = await getDocs(query(collection(db, "contactImportRows"), where("jobId", "==", prepared.jobId)));
      expect(rows.size).toBe(5_000);
      expect(rows.docs.every((row) => row.data().result === "created")).toBe(true);
      expect(new Set(rows.docs.map((row) => row.data().contactId)).size).toBe(5_000);
      const notes = await getDocs(query(collection(db, "contactImportNotes"), where("jobId", "==", prepared.jobId)));
      expect(notes.size).toBe(5_000);
    });
  }, 600_000);

});
