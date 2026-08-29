import { createHash } from "node:crypto";
import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import {
  classifyInboxText,
  emptyWhatsAppGroupIntegration,
  parseWhatsAppGroupConfigurationRecord,
  whatsappGroupConfigurationSchema,
  type WhatsAppGroupConfiguration,
  type WhatsAppGroupIntegrationView,
  type WhatsAppGroupStatus,
} from "../../../packages/shared/src/index.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims } from "../auth/claims.js";
import { buildWhatsAppGroupCreateBody, extractWhatsAppGroupLifecycleEvents, extractWhatsAppGroupMessages, verifyMetaSignature, type WhatsAppGroupLifecycleEvent } from "./webhook-payload.js";

export const whatsappAccessToken = defineSecret("WHATSAPP_GRAPH_ACCESS_TOKEN");
export const whatsappAppSecret = defineSecret("WHATSAPP_APP_SECRET");
export const whatsappVerifyToken = defineSecret("WHATSAPP_WEBHOOK_VERIFY_TOKEN");

const callableOptions = { region: "europe-west8" as const, cors: true, maxInstances: 10, memory: "256MiB" as const, timeoutSeconds: 60 };
const integrationCollection = "whatsappGroupIntegrations";
const graphVersion = "v26.0";
const millis = (value: unknown): number | null => value instanceof Timestamp ? value.toMillis() : null;

function integrationView(officeId: string, data?: DocumentData): WhatsAppGroupIntegrationView {
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "spherepath-96ecd";
  const webhookUrl = `https://europe-west8-${projectId}.cloudfunctions.net/whatsappGroupsWebhook`;
  if (!data) return { ...emptyWhatsAppGroupIntegration(officeId), webhookUrl };
  return {
    officeId,
    webhookUrl,
    businessPhoneNumberId: typeof data.businessPhoneNumberId === "string" ? data.businessPhoneNumberId : "",
    subject: typeof data.subject === "string" ? data.subject : "Spherepath Ofis Havuzu",
    description: typeof data.description === "string" ? data.description : "",
    joinApprovalMode: data.joinApprovalMode === "auto_approve" ? "auto_approve" : "approval_required",
    status: (["configured", "creating", "active", "error"] as WhatsAppGroupStatus[]).includes(data.status as WhatsAppGroupStatus) ? data.status as WhatsAppGroupStatus : "not_configured",
    groupId: typeof data.groupId === "string" ? data.groupId : null,
    inviteLink: typeof data.inviteLink === "string" ? data.inviteLink : null,
    lastMessageAt: millis(data.lastMessageAt),
    lastError: typeof data.lastError === "string" ? data.lastError : null,
    updatedAt: millis(data.updatedAt),
  };
}

function requireBroker(role: "agent" | "broker") {
  if (role !== "broker") throw new HttpsError("permission-denied", "Only the office broker can configure the WhatsApp group.");
}

async function graphRequest(path: string, token: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${path}`, {
    ...init,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = typeof payload.error === "object" && payload.error !== null ? payload.error as Record<string, unknown> : {};
    throw new Error(typeof error.message === "string" ? error.message.slice(0, 500) : `Meta Graph API ${response.status}`);
  }
  return payload;
}

export const getWhatsAppGroupIntegration = onCall(callableOptions, async (request): Promise<{ integration: WhatsAppGroupIntegrationView }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<undefined>(request.data);
  return observeApiRequest("getWhatsAppGroupIntegration", envelope.requestId, async () => {
    const snapshot = await getFirestore().collection(integrationCollection).doc(claims.officeId).get();
    return { integration: integrationView(claims.officeId, snapshot.data()) };
  });
});

export const configureWhatsAppGroupIntegration = onCall(callableOptions, async (request): Promise<{ integration: WhatsAppGroupIntegrationView }> => {
  const claims = requireSpherepathClaims(request);
  requireBroker(claims.role);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = whatsappGroupConfigurationSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "WhatsApp group configuration is invalid.", parsed.error.flatten());
  const input: WhatsAppGroupConfiguration = parsed.data;
  return observeApiRequest("configureWhatsAppGroupIntegration", envelope.requestId, async () => {
    const db = getFirestore(); const ref = db.collection(integrationCollection).doc(claims.officeId); const commandRef = db.collection("commands").doc(envelope.commandId!);
    await db.runTransaction(async (transaction) => {
      const [snapshot, receipt] = await Promise.all([transaction.get(ref), transaction.get(commandRef)]);
      if (receipt.exists) return;
      const now = Timestamp.now(); const previous = snapshot.data();
      transaction.set(ref, {
        officeId: claims.officeId, ownerUid: claims.uid, ...input,
        status: previous?.groupId ? previous.status : "configured",
        groupId: previous?.groupId ?? null, inviteLink: previous?.inviteLink ?? null,
        lastMessageAt: previous?.lastMessageAt ?? null, lastError: null,
        createdAt: previous?.createdAt ?? now, updatedAt: now,
      });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "configureWhatsAppGroupIntegration", createdAt: now });
    });
    const snapshot = await ref.get(); return { integration: integrationView(claims.officeId, snapshot.data()) };
  });
});

export const createWhatsAppOfficeGroup = onCall({ ...callableOptions, secrets: [whatsappAccessToken] }, async (request): Promise<{ integration: WhatsAppGroupIntegrationView }> => {
  const claims = requireSpherepathClaims(request); requireBroker(claims.role);
  const envelope = readApiEnvelope<undefined>(request.data, { command: true });
  return observeApiRequest("createWhatsAppOfficeGroup", envelope.requestId, async () => {
    const db = getFirestore(); const ref = db.collection(integrationCollection).doc(claims.officeId); const commandRef = db.collection("commands").doc(envelope.commandId!);
    const configuration = await db.runTransaction(async (transaction): Promise<WhatsAppGroupConfiguration | null> => {
      const [snapshot, receipt] = await Promise.all([transaction.get(ref), transaction.get(commandRef)]);
      if (receipt.exists) {
        if (receipt.data()?.status === "failed") {
          throw new HttpsError("failed-precondition", "The previous WhatsApp group creation attempt failed.");
        }
        return null;
      }
      if (!snapshot.exists) throw new HttpsError("failed-precondition", "Save the WhatsApp group configuration first.");
      const data = snapshot.data()!;
      if (data.groupId && data.status === "active") {
        transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "createWhatsAppOfficeGroup", status: "completed", createdAt: Timestamp.now() });
        return null;
      }
      const parsed = parseWhatsAppGroupConfigurationRecord(data);
      if (!parsed.success) throw new HttpsError("failed-precondition", "WhatsApp group configuration is incomplete.");
      const now = Timestamp.now();
      transaction.update(ref, { status: "creating", lastError: null, updatedAt: now });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "createWhatsAppOfficeGroup", status: "processing", createdAt: now });
      return parsed.data;
    });
    if (!configuration) {
      const current = await ref.get();
      return { integration: integrationView(claims.officeId, current.data()) };
    }
    try {
      const created = await graphRequest(`${configuration.businessPhoneNumberId}/groups`, whatsappAccessToken.value(), {
        method: "POST",
        body: JSON.stringify(buildWhatsAppGroupCreateBody(configuration)),
      });
      const groupId = typeof created.group_id === "string" ? created.group_id : null;
      const pendingRequestId = typeof created.request_id === "string" ? created.request_id : typeof created.id === "string" ? created.id : null;
      let inviteLink: string | null = null;
      if (groupId) {
        const invite = await graphRequest(`${groupId}/invite_link`, whatsappAccessToken.value());
        inviteLink = typeof invite.invite_link === "string" ? invite.invite_link : null;
      }
      const now = Timestamp.now();
      await db.runTransaction(async (transaction) => {
        transaction.update(ref, { status: groupId ? "active" : "creating", groupId, pendingRequestId, inviteLink, lastError: null, updatedAt: now });
        transaction.update(commandRef, { status: "completed", completedAt: now });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Meta group creation failed.";
      const now = Timestamp.now();
      await db.runTransaction(async (transaction) => {
        transaction.update(ref, { status: "error", lastError: message, updatedAt: now });
        transaction.update(commandRef, { status: "failed", failedAt: now });
      });
      throw new HttpsError("unavailable", "WhatsApp grubu oluşturulamadı. Meta ayarlarını kontrol edin.");
    }
    const result = await ref.get(); return { integration: integrationView(claims.officeId, result.data()) };
  });
});

async function storeGroupMessage(message: ReturnType<typeof extractWhatsAppGroupMessages>[number]): Promise<void> {
  const db = getFirestore();
  const integrationSnapshot = await db.collection(integrationCollection).where("groupId", "==", message.groupId).limit(1).get();
  if (integrationSnapshot.empty) return;
  const integration = integrationSnapshot.docs[0]!.data();
  if (integration.status !== "active" || integration.businessPhoneNumberId !== message.businessPhoneNumberId) return;
  const eventId = createHash("sha256").update(message.messageId).digest("hex");
  const eventRef = db.collection("whatsappWebhookEvents").doc(eventId); const inboxRef = db.collection("inboxItems").doc(`whatsapp-${eventId}`); const integrationRef = integrationSnapshot.docs[0]!.ref;
  const classification = classifyInboxText(message.text); const occurredAt = Timestamp.fromMillis(message.occurredAt); const now = Timestamp.now();
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(eventRef); if (existing.exists) return;
    transaction.create(inboxRef, {
      officeId: integration.officeId, ownerUid: integration.ownerUid, source: "whatsapp",
      safeText: classification.safeText, summary: classification.summary, kind: classification.kind,
      status: "needs_review", confidence: classification.confidence, linkedContactId: null,
      sourceEntityId: eventId, appliedActions: [], pinned: false, needsLocation: classification.needsLocation,
      errorCode: null, archivedAt: null, createdAt: occurredAt, updatedAt: now,
    });
    transaction.create(eventRef, { officeId: integration.officeId, ownerUid: integration.ownerUid, providerMessageHash: eventId, inboxItemId: inboxRef.id, receivedAt: now });
    transaction.update(integrationRef, { lastMessageAt: occurredAt, lastError: null, updatedAt: now });
  });
}

async function applyLifecycleEvent(event: WhatsAppGroupLifecycleEvent): Promise<void> {
  const db = getFirestore(); const snapshot = await db.collection(integrationCollection).where("businessPhoneNumberId", "==", event.businessPhoneNumberId).limit(10).get();
  const target = snapshot.docs.find((doc) => {
    const data = doc.data();
    return (!data.pendingRequestId || !event.requestId || data.pendingRequestId === event.requestId) && (!data.groupId || !event.groupId || data.groupId === event.groupId);
  });
  if (!target) return;
  if (event.type === "group_delete") {
    await target.ref.update({ status: "configured", groupId: null, pendingRequestId: null, inviteLink: null, lastError: event.error, updatedAt: Timestamp.now() }); return;
  }
  if (event.error || !event.groupId) {
    await target.ref.update({ status: "error", pendingRequestId: null, lastError: event.error ?? "Meta group creation did not return a group identifier.", updatedAt: Timestamp.now() }); return;
  }
  await target.ref.update({ status: "active", groupId: event.groupId, pendingRequestId: null, inviteLink: event.inviteLink, lastError: null, updatedAt: Timestamp.now() });
}

export const whatsappGroupsWebhook = onRequest({ region: "europe-west8", maxInstances: 20, memory: "256MiB", timeoutSeconds: 60, secrets: [whatsappAppSecret, whatsappVerifyToken] }, async (request, response) => {
  if (request.method === "GET") {
    const mode = request.query["hub.mode"]; const token = request.query["hub.verify_token"]; const challenge = request.query["hub.challenge"];
    if (mode === "subscribe" && token === whatsappVerifyToken.value() && typeof challenge === "string") { response.status(200).send(challenge); return; }
    response.sendStatus(403); return;
  }
  if (request.method !== "POST") { response.sendStatus(405); return; }
  const signature = request.header("x-hub-signature-256");
  if (!verifyMetaSignature(request.rawBody, signature, whatsappAppSecret.value())) { response.sendStatus(401); return; }
  const messages = extractWhatsAppGroupMessages(request.body);
  const lifecycleEvents = extractWhatsAppGroupLifecycleEvents(request.body);
  await Promise.all([...messages.map(storeGroupMessage), ...lifecycleEvents.map(applyLifecycleEvent)]);
  response.sendStatus(200);
});
