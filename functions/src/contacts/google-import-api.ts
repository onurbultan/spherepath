import { randomBytes, createHash } from "node:crypto";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims } from "../auth/claims.js";
import { googleContactsScope, readGoogleContacts } from "./google-contacts.js";
import { importHash, importJobRef, newImportJob, requireImportOwner, stageImport } from "./import-store.js";

const clientId = defineString("GOOGLE_CONTACTS_CLIENT_ID", { default: "" });
// CSV-only deployments must not require an unused OAuth secret. Firebase loads
// the project dotenv before discovery; configuring the client ID binds the secret
// on the next deployment, while an unconfigured endpoint stays disabled.
const clientSecret = process.env.GOOGLE_CONTACTS_CLIENT_ID ? defineSecret("GOOGLE_CONTACTS_CLIENT_SECRET") : null;
const callbackUrl = defineString("GOOGLE_CONTACTS_CALLBACK_URL", { default: "" });
const webReturnUrl = defineString("GOOGLE_CONTACTS_WEB_RETURN_URL", { default: "" });
const options = { region: "europe-west8" as const, cors: true, memory: "512MiB" as const, timeoutSeconds: 300, maxInstances: 10 };
const stateRef = (state: string) => getFirestore().collection("contactImportOAuthStates").doc(importHash(state));
const validState = (state: unknown): state is string => typeof state === "string" && /^[a-zA-Z0-9_-]{43}$/u.test(state);
function configured() {
  try { return Boolean(clientSecret && clientId.value() && new URL(callbackUrl.value()).protocol === "https:" && new URL(webReturnUrl.value()).protocol === "https:"); } catch { return false; }
}

export const getGoogleContactImportConfig = onCall(options, async (request) => {
  requireSpherepathClaims(request); readApiEnvelope(request.data);
  return { enabled: configured() };
});

export const beginGoogleContactImport = onCall(options, async (request) => {
  const claims = requireSpherepathClaims(request);
  const tenant = { officeId: claims.officeId, ownerUid: claims.uid };
  const envelope = readApiEnvelope<{ platform: unknown }>(request.data, { command: true });
  const platform = envelope.data?.platform;
  if (platform !== "web" && platform !== "mobile") throw new HttpsError("invalid-argument", "Platform is invalid.");
  if (!configured()) throw new HttpsError("failed-precondition", "Google Contacts is not configured.");
  const jobId = importHash(claims.officeId, claims.uid, "google", envelope.commandId!);
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const result = await getFirestore().runTransaction(async (tx) => {
    const ref = importJobRef(jobId);
    const existing = (await tx.get(ref)).data();
    if (existing) {
      requireImportOwner(existing, tenant);
      if (existing.platform !== platform || existing.status !== "authorizing") throw new HttpsError("failed-precondition", "Start a new Google import.");
      return { state: existing.oauthState as string, challenge: existing.challenge as string };
    }
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    tx.create(stateRef(state), { ...tenant, jobId, platform, verifier, used: false, expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60_000) });
    tx.create(ref, { ...newImportJob(tenant, "google_contacts", "authorizing"), oauthState: state, challenge, platform });
    return { state, challenge };
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  Object.entries({ client_id: clientId.value(), redirect_uri: callbackUrl.value(), response_type: "code", scope: `openid ${googleContactsScope}`, state: result.state, code_challenge: result.challenge, code_challenge_method: "S256", access_type: "online", prompt: "select_account consent" }).forEach(([key, value]) => url.searchParams.set(key, value));
  return { jobId, authorizationUrl: url.toString() };
});

/** The callback does NOT import. The original authenticated app must complete it,
 * so forwarding an authorization URL cannot import a victim's address book. */
export const googleContactImportCallback = onRequest({ region: "europe-west8", timeoutSeconds: 30 }, async (request, response) => {
  response.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  const state = request.query.state;
  if (!validState(state)) { response.status(400).send("Geçersiz Google bağlantısı."); return; }
  const data = (await stateRef(state).get()).data();
  if (!data || data.used || (data.expiresAt as Timestamp).toMillis() < Date.now()) { response.status(400).send("Google bağlantısının süresi doldu. Spherepath üzerinden yeniden başlat."); return; }
  const destination = new URL(data.platform === "mobile" ? "spherepath:///contact-imports" : webReturnUrl.value());
  destination.searchParams.set("state", state);
  destination.searchParams.set("jobId", data.jobId as string);
  if (typeof request.query.code === "string" && request.query.code.length <= 4096) destination.searchParams.set("code", request.query.code);
  else destination.searchParams.set("error", "google_failed");
  response.redirect(303, destination.toString());
});

export const finishGoogleContactImport = onCall({ ...options, secrets: clientSecret ? [clientSecret] : [] }, async (request) => {
  const claims = requireSpherepathClaims(request);
  const tenant = { officeId: claims.officeId, ownerUid: claims.uid };
  const envelope = readApiEnvelope<{ state: unknown; code: unknown }>(request.data, { command: true });
  const { state, code } = envelope.data ?? {};
  if (!validState(state) || typeof code !== "string" || !code || code.length > 4096) throw new HttpsError("invalid-argument", "OAuth response is invalid.");
  const acquired = await getFirestore().runTransaction(async (tx) => {
    const ref = stateRef(state);
    const data = (await tx.get(ref)).data();
    requireImportOwner(data, tenant);
    const job = (await tx.get(importJobRef(data.jobId as string))).data();
    requireImportOwner(job, tenant);
    if (!configured()) throw new HttpsError("failed-precondition", "Google Contacts is not configured.");
    if (data.used) {
      if (data.codeDigest !== importHash(code)) throw new HttpsError("failed-precondition", "OAuth response was already used.");
      return { jobId: data.jobId as string, verifier: null };
    }
    if (job.status !== "authorizing" || (data.expiresAt as Timestamp).toMillis() < Date.now()) throw new HttpsError("failed-precondition", "OAuth response expired.");
    tx.update(ref, { used: true, codeDigest: importHash(code), verifier: null });
    tx.update(importJobRef(data.jobId as string), { status: "preparing" });
    return { jobId: data.jobId as string, verifier: data.verifier as string };
  });
  if (!acquired.verifier) return { jobId: acquired.jobId };
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: clientId.value(), client_secret: clientSecret!.value(), code, code_verifier: acquired.verifier, grant_type: "authorization_code", redirect_uri: callbackUrl.value() }), signal: AbortSignal.timeout(30_000) });
    if (!tokenResponse.ok) throw new Error("google_failed");
    const token = await tokenResponse.json() as { access_token?: string; scope?: string };
    if (!token.access_token || !token.scope?.split(" ").includes(googleContactsScope)) throw new Error("google_failed");
    // No access/refresh token is written to Firestore, logs, analytics or clients.
    const accountResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(30_000) });
    if (!accountResponse.ok) throw new Error("google_failed");
    const account = await accountResponse.json() as { sub?: string };
    if (!account.sub) throw new Error("google_failed");
    const people = await readGoogleContacts(token.access_token);
    await stageImport(acquired.jobId, tenant, "google_contacts", importHash(account.sub), people);
  } catch (error) {
    const errorCode = error instanceof Error && ["too_many_contacts", "empty_import"].includes(error.message) ? error.message : "google_failed";
    await getFirestore().runTransaction(async (tx) => {
      const ref = importJobRef(acquired.jobId);
      const job = (await tx.get(ref)).data();
      if (job?.status === "preparing") tx.update(ref, { status: "failed", errorCode });
    });
  }
  return { jobId: acquired.jobId };
});
