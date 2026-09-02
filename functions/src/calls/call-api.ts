import { randomBytes, timingSafeEqual } from "node:crypto";
import { FieldPath, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import {
  createContact as createContactEntity,
  listCallsSchema,
  joinPhone,
  normalizePhone,
  shouldIngestRecording,
  splitPhone,
  startContactCallSchema,
  toDialableNumber,
  type CallRecordView,
  type CallRecordingStatus,
} from "../../../packages/shared/src/index";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims } from "../auth/claims.js";
import { contactPhoneFields, phoneLookupHash } from "../contacts/phone-index.js";
import { toStoredContact } from "../contacts/contact-store.js";
import { createVerimorSource } from "./verimor.js";
import type { CallRecordingSource, ParsedCallEvent } from "./provider.js";

export const verimorApiKey = defineSecret("VERIMOR_API_KEY");

const integrationCollection = "callIntegrations";
const callCollection = "calls";
const callableOptions = { region: "europe-west8" as const, cors: true, maxInstances: 10, memory: "256MiB" as const, timeoutSeconds: 60 };

function secretValue(secret: { value(): string }, environmentName: string): string {
  // Mirrors the WhatsApp integration: `defineSecret` is not reliably hydrated
  // inside the emulator, where a disposable environment value stands in.
  const localRuntime = process.env.FUNCTIONS_EMULATOR === "true"
    || Boolean(process.env.FIREBASE_EMULATOR_HUB)
    || Boolean(process.env.FIRESTORE_EMULATOR_HOST)
    || !process.env.K_SERVICE;
  return localRuntime ? process.env[environmentName] ?? "" : secret.value();
}

const sources: Record<string, () => CallRecordingSource> = {
  verimor: () => createVerimorSource(() => secretValue(verimorApiKey, "VERIMOR_API_KEY")),
};

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function timestamp(value: number | null): Timestamp | null {
  return value === null ? null : Timestamp.fromMillis(value);
}

function callView(id: string, data: FirebaseFirestore.DocumentData): CallRecordView {
  return {
    id,
    provider: data.provider,
    providerCallId: data.providerCallId,
    direction: data.direction,
    fromNumber: data.fromNumber ?? null,
    toNumber: data.toNumber ?? null,
    extension: data.extension ?? null,
    contactId: data.contactId ?? null,
    contactCreatedFromCall: data.contactCreatedFromCall === true,
    answered: data.answered === true,
    startedAt: millis(data.startedAt),
    answeredAt: millis(data.answeredAt),
    endedAt: millis(data.endedAt),
    durationMs: typeof data.durationMs === "number" ? data.durationMs : 0,
    talkDurationMs: typeof data.talkDurationMs === "number" ? data.talkDurationMs : 0,
    queueWaitMs: typeof data.queueWaitMs === "number" ? data.queueWaitMs : 0,
    hangupCause: data.hangupCause ?? null,
    recordingStatus: data.recordingStatus,
    voiceNoteId: data.voiceNoteId ?? null,
    errorCode: data.errorCode ?? null,
    createdAt: millis(data.createdAt) ?? 0,
    updatedAt: millis(data.updatedAt) ?? 0,
  };
}

/**
 * The counterparty is whichever leg is not the office: the caller on the way in,
 * the dialled number on the way out. That number is what identifies the contact.
 */
function counterpartyNumber(event: ParsedCallEvent): string | null {
  return event.direction === "outbound" ? event.toNumber : event.fromNumber;
}

function contactsByPhone(officeId: string, hash: string) {
  return getFirestore().collection("contacts")
    .where("officeId", "==", officeId)
    .where("phoneHash", "==", hash)
    .where("deletedAt", "==", null)
    .limit(2);
}

async function resolveContact(officeId: string, phone: string | null) {
  const hash = phoneLookupHash(phone);
  if (!hash) return null;
  const matches = await contactsByPhone(officeId, hash).get();
  // Two contacts on one number cannot be attributed without guessing, so the
  // call stays unassigned and a person decides.
  if (matches.size !== 1) {
    if (matches.size > 1) logger.warn("Call number matched multiple contacts", { officeId, matchCount: matches.size });
    return null;
  }
  const match = matches.docs[0]!;
  return { id: match.id, ownerUid: match.data().ownerUid as string };
}

/**
 * A stranger calling the office line is a lead, and the whole point of the switch
 * is that the advisor does not have to write anything down. Giving that call a
 * contact immediately lets the recording run through the same transcription and
 * review path as any other; the record starts named by its number and the advisor
 * renames it when confirming what the transcript found.
 *
 * The lookup is repeated inside the transaction so two calls arriving from the
 * same number at once cannot produce two contacts.
 */
async function createLeadContact(officeId: string, ownerUid: string, phone: string, now: number) {
  const hash = phoneLookupHash(phone);
  if (!hash) return null;
  const firestore = getFirestore();
  const reference = firestore.collection("contacts").doc();
  return firestore.runTransaction(async (transaction) => {
    const existing = await transaction.get(contactsByPhone(officeId, hash));
    const match = existing.docs[0];
    if (match) return { id: match.id, ownerUid: match.data().ownerUid as string, created: false };
    const contact = createContactEntity(
      { fullName: normalizePhone(phone) ?? phone, phone, metAtPlace: "", source: "inbound_call", role: "unknown" },
      { officeId, ownerUid },
      now,
    );
    transaction.create(reference, { ...toStoredContact(contact), ...contactPhoneFields(phone) });
    return { id: reference.id, ownerUid, created: true };
  });
}

// ---------------------------------------------------------------- webhook

export const verimorCallWebhook = onRequest(
  { region: "europe-west8", maxInstances: 20, memory: "256MiB", timeoutSeconds: 60, secrets: [verimorApiKey] },
  async (request, response) => {
    if (request.method !== "POST") { response.sendStatus(405); return; }
    const integrationId = String(request.query.integration ?? "");
    const integration = await loadIntegration(integrationId, String(request.query.token ?? ""));
    if (!integration) { response.sendStatus(401); return; }

    const source = sources[integration.provider as string]?.();
    if (!source) { response.sendStatus(400); return; }
    const event = source.parseEvent(request.body as Record<string, unknown>);
    if (!event) {
      // Field names have to be confirmed against the switch's real payload, so an
      // unreadable body is recorded rather than silently dropped.
      logger.warn("Call event payload was not understood", { integrationId, body: request.body });
      response.sendStatus(200);
      return;
    }

    // Ringing and answer carry nothing that outlives the call yet; only the
    // hangup produces a durable record.
    if (event.eventType !== "hangup") { response.sendStatus(200); return; }

    try {
      await storeCallEvent(integrationId, integration, source.provider, event);
    } catch (error) {
      logger.error("Call event could not be stored", { integrationId, providerCallId: event.providerCallId, error });
      response.sendStatus(500);
      return;
    }
    response.sendStatus(200);
  },
);

async function storeCallEvent(
  integrationId: string,
  integration: FirebaseFirestore.DocumentData,
  provider: string,
  event: ParsedCallEvent,
) {
  const firestore = getFirestore();
  const officeId = integration.officeId as string;
  const counterparty = counterpartyNumber(event);
  const extensionOwners = (integration.extensionOwners ?? {}) as Record<string, string>;
  let contact = await resolveContact(officeId, counterparty);
  // The contact's advisor is the most reliable owner; the extension that handled
  // the call and the office default only stand in when the caller is unknown.
  const ownerUid = contact?.ownerUid
    ?? (event.extension ? extensionOwners[event.extension] : undefined)
    ?? (integration.defaultOwnerUid as string | undefined);
  if (!ownerUid) throw new Error("call_owner_unresolved");

  const now = Timestamp.now();
  const ingest = shouldIngestRecording(event.answered, event.talkDurationMs);
  // A stranger who called in and talked long enough is a lead worth keeping, so
  // the record is opened now and the transcript arrives against it.
  let leadCreated = false;
  if (!contact && ingest && event.direction === "inbound" && counterparty) {
    const lead = await createLeadContact(officeId, ownerUid, counterparty, now.toMillis());
    if (lead) {
      contact = { id: lead.id, ownerUid: lead.ownerUid };
      leadCreated = lead.created;
    }
  }
  const recordingStatus: CallRecordingStatus = ingest && contact ? "pending" : "none";
  // The switch's call id is the document id, so a redelivered event lands on the
  // same record instead of creating a second one.
  const callRef = firestore.collection(callCollection).doc(`${provider}_${event.providerCallId}`);
  await firestore.runTransaction(async (transaction) => {
    if ((await transaction.get(callRef)).exists) return;
    transaction.create(callRef, {
      officeId,
      ownerUid,
      integrationId,
      provider,
      providerCallId: event.providerCallId,
      direction: event.direction,
      fromNumber: event.fromNumber,
      toNumber: event.toNumber,
      extension: event.extension,
      contactId: contact?.id ?? null,
      contactCreatedFromCall: leadCreated,
      answered: event.answered,
      startedAt: timestamp(event.startedAt),
      answeredAt: timestamp(event.answeredAt),
      endedAt: timestamp(event.endedAt),
      durationMs: event.durationMs,
      talkDurationMs: event.talkDurationMs,
      queueWaitMs: event.queueWaitMs,
      hangupCause: event.hangupCause,
      recordingPresent: event.recordingPresent,
      recordingStatus,
      voiceNoteId: null,
      attempts: 0,
      errorCode: ingest && !contact ? "contact_unresolved" : null,
      createdAt: now,
      updatedAt: now,
    });
  });
}

// ------------------------------------------------------- recording worker

export const processCallRecording = onDocumentCreated(
  { document: "calls/{callId}", region: "europe-west8", retry: true, memory: "512MiB", timeoutSeconds: 300, secrets: [verimorApiKey] },
  async (event) => {
    const callId = event.params.callId;
    const firestore = getFirestore();
    const callRef = firestore.collection(callCollection).doc(callId);
    const snapshot = await callRef.get();
    const call = snapshot.data();
    if (!call || call.recordingStatus !== "pending" || !call.contactId) return;

    const source = sources[call.provider as string]?.();
    if (!source) return;

    try {
      const recording = await source.fetchRecording(call.providerCallId as string);
      if (!recording) {
        await callRef.update({ recordingStatus: "none", errorCode: "recording_unavailable", updatedAt: Timestamp.now() });
        return;
      }
      const storagePath = `offices/${call.officeId}/calls/${callId}.${recording.extension}`;
      await getStorage().bucket().file(storagePath).save(recording.bytes, { contentType: recording.contentType });

      const noteRef = firestore.collection("voiceNotes").doc();
      const now = Timestamp.now();
      // The note is queued exactly as an in-app recording is, so transcription,
      // masking, extraction and review run through one pipeline.
      await noteRef.set({
        officeId: call.officeId,
        ownerUid: call.ownerUid,
        contactId: call.contactId,
        storagePath,
        durationMs: call.talkDurationMs,
        mimeType: recording.contentType,
        inputMode: "call",
        callId,
        conversationEndedConfirmed: true,
        status: "queued",
        attempts: 0,
        processingEventId: null,
        maskedTranscript: null,
        maskedCategories: [],
        maskedRanges: [],
        transcriptionModel: null,
        transcriptionLocation: null,
        transcriptionWarning: null,
        transcriptionWordCount: null,
        extraction: null,
        corrections: [],
        interactionId: null,
        sourceAudioDeletedAt: null,
        errorCode: null,
        createdAt: now,
        updatedAt: now,
      });
      await callRef.update({ recordingStatus: "stored", voiceNoteId: noteRef.id, errorCode: null, updatedAt: now });
      logger.info("Call recording queued for transcription", { callId, voiceNoteId: noteRef.id, byteLength: recording.bytes.length });
    } catch (error) {
      const attempts = Number(call.attempts ?? 0) + 1;
      logger.error("Call recording ingestion failed", { callId, attempts, error });
      // The switch finishes writing the file a minute or two after the call
      // ends, so the first attempts are expected to miss. With the trigger's
      // exponential backoff this spans several minutes before giving up.
      if (attempts < 6) {
        await callRef.update({ attempts, updatedAt: Timestamp.now() });
        throw error;
      }
      await callRef.update({ attempts, recordingStatus: "failed", errorCode: "recording_ingest_failed", updatedAt: Timestamp.now() });
    }
  },
);

// ------------------------------------------------------------- callables

export const configureCallIntegration = onCall(callableOptions, async (request): Promise<{ integrationId: string; webhookToken: string }> => {
  const claims = requireSpherepathClaims(request);
  if (claims.role !== "broker") throw new HttpsError("permission-denied", "Only a broker can configure telephony.");
  const envelope = readApiEnvelope<{
    extensionOwners?: unknown;
    rotateToken?: unknown;
    outboundCallerId?: unknown;
    defaultRoutingTarget?: unknown;
    recordingNoticeAnnouncementId?: unknown;
  }>(request.data, { command: true });
  const extensionOwners = envelope.data?.extensionOwners;
  if (extensionOwners !== undefined && (typeof extensionOwners !== "object" || extensionOwners === null || Array.isArray(extensionOwners))) {
    throw new HttpsError("invalid-argument", "Extension owners must be a mapping of extension to user.");
  }
  const routingTarget = envelope.data?.defaultRoutingTarget;
  // The switch only accepts its own destination grammar, and an unroutable value
  // would silently drop calls that reach the fallback.
  if (routingTarget !== undefined && (typeof routingTarget !== "string" || !/^(user|queue|ivr|voicemail|external|announcement|hangup)\/[A-Za-z0-9_-]{1,32}$/u.test(routingTarget))) {
    throw new HttpsError("invalid-argument", "Default routing target is not a valid switch destination.");
  }

  return observeApiRequest("configureCallIntegration", envelope.requestId, async () => {
    const firestore = getFirestore();
    const reference = firestore.collection(integrationCollection).doc(claims.officeId);
    const existing = await reference.get();
    const now = Timestamp.now();
    const webhookToken = !existing.exists || envelope.data?.rotateToken === true
      ? randomBytes(32).toString("base64url")
      : existing.data()!.webhookToken as string;
    await reference.set({
      officeId: claims.officeId,
      provider: "verimor",
      webhookToken,
      defaultOwnerUid: claims.uid,
      extensionOwners: (extensionOwners as Record<string, string> | undefined) ?? existing.data()?.extensionOwners ?? {},
      outboundCallerId: (envelope.data?.outboundCallerId as string | undefined) ?? existing.data()?.outboundCallerId ?? null,
      defaultRoutingTarget: (routingTarget as string | undefined) ?? existing.data()?.defaultRoutingTarget ?? null,
      recordingNoticeAnnouncementId: typeof envelope.data?.recordingNoticeAnnouncementId === "number"
        ? envelope.data.recordingNoticeAnnouncementId
        : existing.data()?.recordingNoticeAnnouncementId ?? null,
      active: true,
      createdAt: existing.data()?.createdAt ?? now,
      updatedAt: now,
    }, { merge: true });
    return { integrationId: reference.id, webhookToken };
  });
});

export const getCallIntegration = onCall(callableOptions, async (request): Promise<{ integrationId: string; webhookToken: string; extensionOwners: Record<string, string>; active: boolean } | null> => {
  const claims = requireSpherepathClaims(request);
  if (claims.role !== "broker") throw new HttpsError("permission-denied", "Only a broker can read telephony settings.");
  const envelope = readApiEnvelope<unknown>(request.data);
  return observeApiRequest("getCallIntegration", envelope.requestId, async () => {
    const snapshot = await getFirestore().collection(integrationCollection).doc(claims.officeId).get();
    const data = snapshot.data();
    if (!data) return null;
    return {
      integrationId: snapshot.id,
      webhookToken: data.webhookToken as string,
      extensionOwners: (data.extensionOwners ?? {}) as Record<string, string>,
      active: data.active === true,
    };
  });
});

/**
 * The address the switch has to call back on. Built here rather than typed into
 * a panel by hand: the token is 43 random characters, and a single wrong one
 * fails closed with a 401 that looks, from the switch's side, like silence.
 */
function eventWebhookUrl(integrationId: string, webhookToken: string): string {
  const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "";
  const query = new URLSearchParams({ integration: integrationId, token: webhookToken });
  return `https://${callableOptions.region}-${project}.cloudfunctions.net/verimorCallWebhook?${query.toString()}`;
}

/**
 * Points the switch at us over its own API, then reads back what it stored. The
 * read-back matters: a POST that returns OK is not proof the address took, and
 * the difference between "connected" and "silently not connected" is every call
 * the office makes.
 */
export const connectCallProvider = onCall(
  { ...callableOptions, secrets: [verimorApiKey] },
  async (request): Promise<{ notificationUrl: string | null; events: string[]; connected: boolean }> => {
    const claims = requireSpherepathClaims(request);
    if (claims.role !== "broker") throw new HttpsError("permission-denied", "Only a broker can connect the switch.");
    const envelope = readApiEnvelope<unknown>(request.data, { command: true });

    return observeApiRequest("connectCallProvider", envelope.requestId, async () => {
      const snapshot = await getFirestore().collection(integrationCollection).doc(claims.officeId).get();
      const integration = snapshot.data();
      if (!integration) throw new HttpsError("failed-precondition", "Telefon ayarlarını önce kaydedin.");

      const source = sources[integration.provider as string]?.();
      if (!source) throw new HttpsError("failed-precondition", "Bu santral için bağlantı desteklenmiyor.");

      const expected = eventWebhookUrl(snapshot.id, integration.webhookToken as string);
      try {
        await source.connectEvents(expected);
        const stored = await source.readEventConnection();
        return { ...stored, connected: stored.notificationUrl === expected };
      } catch (error) {
        logger.error("Call provider connection failed", { officeId: claims.officeId, error });
        const reason = error instanceof Error && error.message === "verimor_api_key_missing"
          ? "Santral API anahtarı tanımlı değil."
          : "Santrala bağlanılamadı; API anahtarını ve paket durumunu kontrol edin.";
        throw new HttpsError("failed-precondition", reason);
      }
    });
  },
);

function extensionFor(integration: FirebaseFirestore.DocumentData, uid: string): string | null {
  const owners = (integration.extensionOwners ?? {}) as Record<string, string>;
  return Object.entries(owners).find(([, owner]) => owner === uid)?.[0] ?? null;
}

/**
 * Dialling starts with the advisor's own extension ringing, so the switch owns
 * both legs and records the conversation. The advisor never sees the customer's
 * number leave the app.
 */
export const startContactCall = onCall({ ...callableOptions, secrets: [verimorApiKey] }, async (request): Promise<{ providerCallId: string }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = startContactCallSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Call input is invalid.", parsed.error.flatten());

  return observeApiRequest("startContactCall", envelope.requestId, async () => {
    const firestore = getFirestore();
    const [integrationSnapshot, contactSnapshot, advisorSnapshot] = await Promise.all([
      firestore.collection(integrationCollection).doc(claims.officeId).get(),
      firestore.collection("contacts").doc(parsed.data.contactId).get(),
      firestore.collection("users").doc(claims.uid).get(),
    ]);
    const integration = integrationSnapshot.data();
    if (!integration?.active) throw new HttpsError("failed-precondition", "Telephony is not configured for this office.");
    const contact = contactSnapshot.data();
    if (!contact || contact.officeId !== claims.officeId || contact.deletedAt !== null) throw new HttpsError("not-found", "Contact was not found.");
    if (contact.ownerUid !== claims.uid && claims.role !== "broker") throw new HttpsError("permission-denied", "Contact is outside your workspace.");

    const destination = toDialableNumber(normalizePhone(contact.phone as string | null));
    if (!destination) throw new HttpsError("failed-precondition", "Contact has no dialable phone number.");
    // The advisor's own phone, set on their profile: the switch rings it first
    // and only dials the customer once a person has answered.
    const source = toDialableNumber(normalizePhone(advisorSnapshot.data()?.phone as string | null));
    if (!source) throw new HttpsError("failed-precondition", "Önce ayarlardan kendi telefon numaranızı girin.");

    const callSource = sources[integration.provider as string]?.();
    if (!callSource) throw new HttpsError("failed-precondition", "Telephony provider is not supported.");
    const providerCallId = await callSource.startCall({
      source,
      destination,
      callerId: (integration.outboundCallerId as string | undefined) ?? null,
      announcementId: typeof integration.recordingNoticeAnnouncementId === "number" ? integration.recordingNoticeAnnouncementId : null,
    });
    logger.info("Outbound call started", { officeId: claims.officeId, providerCallId });
    // The call record itself arrives on the hangup event, which carries the
    // duration and recording state this response cannot know yet.
    return { providerCallId };
  });
});

/**
 * The switch asks who should take an incoming call before it rings anyone. That
 * question is the whole product advantage: a known caller goes straight to the
 * advisor who owns the relationship instead of into a general queue.
 */
export const verimorRoutingWebhook = onRequest(
  { region: "europe-west8", maxInstances: 20, memory: "256MiB", timeoutSeconds: 10 },
  async (request, response) => {
    const integrationId = String(request.query.integration ?? "");
    const token = String(request.query.token ?? "");
    const caller = String(request.query.cli ?? "");
    const integration = await loadIntegration(integrationId, token);
    if (!integration) { response.sendStatus(401); return; }

    const fallback = (integration.defaultRoutingTarget as string | undefined) ?? null;
    try {
      const contact = await resolveContact(integration.officeId as string, caller);
      const extension = contact ? extensionFor(integration, contact.ownerUid) : null;
      const target = extension ? `user/${extension}` : fallback;
      if (!target) { response.sendStatus(204); return; }
      const name = contact ? await contactDisplayName(contact.id) : null;
      response.json({ transfer: { ...(name ? { greet_name: name } : {}), lang: "tr-TR", target } });
    } catch (error) {
      // A routing failure must never drop a customer's call, so the switch is
      // told to fall back rather than left without an answer.
      logger.error("Call routing lookup failed", { integrationId, error });
      if (fallback) response.json({ transfer: { lang: "tr-TR", target: fallback } });
      else response.sendStatus(204);
    }
  },
);

async function loadIntegration(integrationId: string, token: string) {
  if (!integrationId || !token) return null;
  const snapshot = await getFirestore().collection(integrationCollection).doc(integrationId).get();
  const integration = snapshot.data();
  if (!integration || integration.active !== true) return null;
  const expected = Buffer.from(String(integration.webhookToken ?? ""), "utf8");
  const received = Buffer.from(token, "utf8");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return integration;
}

async function contactDisplayName(contactId: string): Promise<string | null> {
  const snapshot = await getFirestore().collection("contacts").doc(contactId).get();
  const data = snapshot.data();
  const name = (data?.fullName ?? data?.label) as string | null | undefined;
  return name?.trim() || null;
}

/**
 * Contacts saved before the phone field was split carry the number however the
 * advisor typed it and no lookup key at all, so a caller cannot be matched and
 * two records of the same person read differently. This rewrites both from the
 * stored number, skipping anything that is not a usable phone so a note in the
 * field is never destroyed.
 *
 * The pass is resumable and rewrites nothing already correct, so it is safe to
 * run again after an import.
 */
export const normalizeContactPhones = onCall(callableOptions, async (request): Promise<{ scanned: number; updated: number; done: boolean; cursor: string | null }> => {
  const claims = requireSpherepathClaims(request);
  if (claims.role !== "broker") throw new HttpsError("permission-denied", "Only a broker can run the phone normalisation.");
  const envelope = readApiEnvelope<{ cursor?: unknown }>(request.data, { command: true });
  const cursor = typeof envelope.data?.cursor === "string" ? envelope.data.cursor : null;

  return observeApiRequest("normalizeContactPhones", envelope.requestId, async () => {
    const firestore = getFirestore();
    const pageSize = 300;
    let query = firestore.collection("contacts")
      .where("officeId", "==", claims.officeId)
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();

    const writes = firestore.batch();
    let updated = 0;
    for (const document of snapshot.docs) {
      const stored = document.data().phone as string | null;
      // Anything that does not resolve to a real number is left exactly as it is;
      // an advisor may have typed a note rather than a phone.
      if (!normalizePhone(stored)) continue;
      const parts = splitPhone(stored);
      const phone = joinPhone(parts.dialCode, parts.national);
      const phoneHash = phoneLookupHash(phone);
      if (phone === stored && phoneHash === document.data().phoneHash) continue;
      writes.update(document.ref, { phone, phoneHash });
      updated += 1;
    }
    if (updated) await writes.commit();

    const done = snapshot.size < pageSize;
    logger.info("Contact phone normalisation pass complete", { officeId: claims.officeId, scanned: snapshot.size, updated, done });
    return { scanned: snapshot.size, updated, done, cursor: done ? null : snapshot.docs.at(-1)?.id ?? null };
  });
});

export const listCalls = onCall(callableOptions, async (request): Promise<{ calls: CallRecordView[] }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data);
  const parsed = listCallsSchema.safeParse(envelope.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Call listing input is invalid.", parsed.error.flatten());

  return observeApiRequest("listCalls", envelope.requestId, async () => {
    let query = getFirestore().collection(callCollection).where("officeId", "==", claims.officeId);
    if (claims.role !== "broker") query = query.where("ownerUid", "==", claims.uid);
    if (parsed.data.contactId) query = query.where("contactId", "==", parsed.data.contactId);
    const snapshot = await query.orderBy("createdAt", "desc").limit(parsed.data.limit).get();
    return { calls: snapshot.docs.map((document) => callView(document.id, document.data())) };
  });
});
