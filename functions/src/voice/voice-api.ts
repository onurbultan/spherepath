import { v2 as speech } from "@google-cloud/speech";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  applyInteractionToRelationship,
  contactMemorySchema,
  confirmVoiceNoteSchema,
  createOpportunity as createOpportunityEntity,
  createInteraction,
  discardVoiceNoteSchema,
  mergeVoiceInsightsIntoContactMemory,
  getVoiceNoteSchema,
  registerInteractionTextSchema,
  registerVoiceTextTestSchema,
  registerVoiceNoteSchema,
  type Contact,
  type VoiceNoteStatus,
  type VoiceNoteView,
  voiceExtractionSchema,
} from "../../../packages/shared/src/index.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims } from "../auth/claims.js";
import { extractVoiceDraft, maskSensitiveTranscript, sanitizeVoiceExtraction } from "./privacy.js";
import { extractVoiceDraftWithVertex } from "./vertex-extraction.js";
import { normalizeVoiceActionTiming } from "./temporal.js";
import { normalizeVoiceExtraction } from "./normalization.js";

const speechClient = new speech.SpeechClient();

function timestamp(value: number | null): Timestamp | null {
  return value === null ? null : Timestamp.fromMillis(value);
}

function milliseconds(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

function voiceView(id: string, data: FirebaseFirestore.DocumentData): VoiceNoteView {
  const extraction = voiceExtractionSchema.safeParse(data.extraction);
  return {
    id,
    contactId: data.contactId as string,
    inputMode: data.inputMode === "manual_text" ? "manual_text" : data.inputMode === "text_test" ? "text_test" : "audio",
    status: data.status as VoiceNoteStatus,
    durationMs: data.durationMs as number,
    maskedTranscript: typeof data.maskedTranscript === "string" ? data.maskedTranscript : null,
    maskedCategories: Array.isArray(data.maskedCategories) ? data.maskedCategories : [],
    extraction: extraction.success ? extraction.data : null,
    interactionId: typeof data.interactionId === "string" ? data.interactionId : null,
    errorCode: typeof data.errorCode === "string" ? data.errorCode : null,
    createdAt: milliseconds(data.createdAt),
    updatedAt: milliseconds(data.updatedAt),
  };
}

function canManage(data: FirebaseFirestore.DocumentData, claims: { officeId: string; uid: string; role: "agent" | "broker" }) {
  return data.officeId === claims.officeId && (data.ownerUid === claims.uid || claims.role === "broker");
}

function inferredContactRole(opportunityType: "seller_listing" | "landlord_listing" | "buyer_requirement" | "tenant_requirement" | undefined) {
  if (opportunityType === "seller_listing") return "seller" as const;
  if (opportunityType === "landlord_listing") return "landlord" as const;
  if (opportunityType === "buyer_requirement") return "buyer" as const;
  if (opportunityType === "tenant_requirement") return "tenant" as const;
  return null;
}

async function transcribe(storagePath: string): Promise<string> {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error("speech_project_missing");
  const [content] = await getStorage().bucket().file(storagePath).download();
  const [response] = await speechClient.recognize({
    recognizer: `projects/${projectId}/locations/global/recognizers/_`,
    config: {
      autoDecodingConfig: {},
      languageCodes: ["tr-TR"],
      model: "short",
      features: { enableAutomaticPunctuation: true },
    },
    content,
  });
  return (response.results ?? [])
    .map((result) => result.alternatives?.[0]?.transcript?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();
}

async function processVoiceNoteDocument(voiceNoteId: string, eventId: string, rawOverride?: string) {
  const firestore = getFirestore();
  const noteRef = firestore.collection("voiceNotes").doc(voiceNoteId);
  const acquired = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(noteRef);
    if (!snapshot.exists) return null;
    const data = snapshot.data()!;
    if (["needs_review", "confirmed", "discarded", "failed"].includes(data.status as string)) return null;
    // Written notes are processed synchronously by their callable with a raw
    // transcript. The Firestore create trigger can race that callable, but it
    // must never try to download a non-existent audio object.
    if (data.inputMode !== "audio" && rawOverride === undefined) return null;
    if ((data.emulatorImmediate === true || data.textTestImmediate === true || data.textImmediate === true) && rawOverride === undefined) return null;
    const now = Timestamp.now();
    transaction.update(noteRef, {
      status: "processing",
      processingEventId: eventId,
      attempts: Number(data.attempts ?? 0) + 1,
      updatedAt: now,
    });
    return {
      storagePath: data.storagePath as string,
      contactId: data.contactId as string,
      attempts: Number(data.attempts ?? 0) + 1,
    };
  });
  if (!acquired) return;

  try {
    const processingDate = new Date();
    const rawTranscript = rawOverride ?? await transcribe(acquired.storagePath);
    const masked = maskSensitiveTranscript(rawTranscript);
    let extraction = extractVoiceDraft(masked.text);
    const contact = await firestore.collection("contacts").doc(acquired.contactId).get();
    const profilingObjected = contact.data()?.privacy?.profilingObjection === true;
    const shouldUseVertex = process.env.FUNCTIONS_EMULATOR !== "true" && !profilingObjected;
    if (shouldUseVertex && !extraction.isUnclear) {
      try {
        extraction = sanitizeVoiceExtraction(await extractVoiceDraftWithVertex(masked.text, processingDate));
      } catch (error) {
        logger.warn("Vertex voice extraction failed; deterministic fallback retained", {
          voiceNoteId,
          eventId,
          error,
        });
      }
    }
    extraction = normalizeVoiceExtraction(extraction, masked.text);
    extraction = normalizeVoiceActionTiming(extraction, masked.text, processingDate);
    if (!rawOverride) await getStorage().bucket().file(acquired.storagePath).delete({ ignoreNotFound: true });
    await noteRef.update({
      status: "needs_review",
      maskedTranscript: masked.text,
      maskedCategories: masked.categories,
      maskedRanges: masked.maskedRanges,
      extraction,
      sourceAudioDeletedAt: Timestamp.now(),
      processingEventId: null,
      errorCode: null,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    logger.error("Voice note processing failed", { voiceNoteId, eventId, attempts: acquired.attempts, error });
    if (rawOverride === undefined && acquired.attempts < 3) {
      await noteRef.update({ status: "queued", processingEventId: null, errorCode: "processing_retry", updatedAt: Timestamp.now() });
      throw error;
    }
    if (acquired.storagePath) {
      await getStorage().bucket().file(acquired.storagePath).delete({ ignoreNotFound: true }).catch((deleteError) => {
        logger.error("Voice source deletion failed", { voiceNoteId, deleteError });
      });
    }
    await noteRef.update({
      status: "failed",
      processingEventId: null,
      sourceAudioDeletedAt: Timestamp.now(),
      errorCode: "processing_failed",
      updatedAt: Timestamp.now(),
    });
  }
}

export const registerVoiceNote = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 60 },
  async (request): Promise<{ voiceNoteId: string }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<unknown>(request.data, { command: true });
    const parsed = registerVoiceNoteSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Voice note input is invalid.", parsed.error.flatten());
    const input = parsed.data;
    const expectedPrefix = `offices/${claims.officeId}/voice/${claims.uid}/`;
    if (!input.storagePath.startsWith(expectedPrefix) || !/^[A-Za-z0-9_-]+\.(m4a|webm|wav)$/u.test(input.storagePath.slice(expectedPrefix.length))) {
      throw new HttpsError("permission-denied", "Voice storage path is outside your workspace.");
    }
    const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
    if (input.emulatorTranscript && !isEmulator) throw new HttpsError("invalid-argument", "Emulator transcript is not available.");

    const firestore = getFirestore();
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const existingCommand = await commandRef.get();
    if (existingCommand.exists) {
      const receipt = existingCommand.data()!;
      if (!canManage(receipt, claims) || receipt.type !== "registerVoiceNote") {
        throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
      }
      return { voiceNoteId: receipt.voiceNoteId as string };
    }

    if (!input.emulatorTranscript) {
      const [metadata] = await getStorage().bucket().file(input.storagePath).getMetadata().catch(() => {
        throw new HttpsError("not-found", "Voice source was not found.");
      });
      if (Number(metadata.size ?? 0) <= 0 || Number(metadata.size ?? 0) >= 25 * 1024 * 1024 || metadata.contentType !== input.mimeType) {
        throw new HttpsError("failed-precondition", "Voice source metadata is invalid.");
      }
      if (metadata.metadata?.contactId !== input.contactId || Number(metadata.metadata?.durationMs) !== input.durationMs) {
        throw new HttpsError("failed-precondition", "Voice source ownership metadata is invalid.");
      }
    }

    const contactRef = firestore.collection("contacts").doc(input.contactId);
    const noteRef = firestore.collection("voiceNotes").doc();
    const result = await observeApiRequest("registerVoiceNote", envelope.requestId, () => firestore.runTransaction(async (transaction) => {
      const [commandSnapshot, contactSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(contactRef)]);
      if (commandSnapshot.exists) {
        const receipt = commandSnapshot.data()!;
        if (!canManage(receipt, claims) || receipt.type !== "registerVoiceNote") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return { voiceNoteId: receipt.voiceNoteId as string, created: false };
      }
      if (!contactSnapshot.exists || !canManage(contactSnapshot.data()!, claims) || contactSnapshot.data()!.deletedAt !== null) {
        throw new HttpsError("not-found", "Contact was not found.");
      }
      const now = Timestamp.now();
      transaction.create(noteRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        contactId: input.contactId,
        storagePath: input.storagePath,
        durationMs: input.durationMs,
        mimeType: input.mimeType,
        inputMode: "audio",
        conversationEndedConfirmed: true,
        status: "queued",
        attempts: 0,
        processingEventId: null,
        maskedTranscript: null,
        maskedCategories: [],
        maskedRanges: [],
        extraction: null,
        corrections: [],
        interactionId: null,
        sourceAudioDeletedAt: null,
        errorCode: null,
        emulatorImmediate: Boolean(input.emulatorTranscript),
        createdAt: now,
        updatedAt: now,
      });
      transaction.create(commandRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        type: "registerVoiceNote",
        voiceNoteId: noteRef.id,
        createdAt: now,
      });
      return { voiceNoteId: noteRef.id, created: true };
    }));
    if (result.created && input.emulatorTranscript) {
      await processVoiceNoteDocument(result.voiceNoteId, `emulator-${envelope.requestId}`, input.emulatorTranscript);
    }
    return { voiceNoteId: result.voiceNoteId };
  },
);

export const registerVoiceTextTest = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 60 },
  async (request): Promise<{ voiceNoteId: string }> => {
    const claims = requireSpherepathClaims(request);
    const enabled = process.env.FUNCTIONS_EMULATOR === "true" || process.env.ENABLE_VOICE_TEXT_TESTING === "true";
    if (!enabled) throw new HttpsError("failed-precondition", "Voice text testing is disabled.");
    const envelope = readApiEnvelope<unknown>(request.data, { command: true });
    const parsed = registerVoiceTextTestSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Voice text test input is invalid.", parsed.error.flatten());
    const input = parsed.data;
    const firestore = getFirestore();
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const contactRef = firestore.collection("contacts").doc(input.contactId);
    const noteRef = firestore.collection("voiceNotes").doc();
    const result = await observeApiRequest("registerVoiceTextTest", envelope.requestId, () => firestore.runTransaction(async (transaction) => {
      const [commandSnapshot, contactSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(contactRef)]);
      if (commandSnapshot.exists) {
        const receipt = commandSnapshot.data()!;
        if (!canManage(receipt, claims) || receipt.type !== "registerVoiceTextTest") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return { voiceNoteId: receipt.voiceNoteId as string, created: false };
      }
      if (!contactSnapshot.exists || !canManage(contactSnapshot.data()!, claims) || contactSnapshot.data()!.deletedAt !== null) {
        throw new HttpsError("not-found", "Contact was not found.");
      }
      const now = Timestamp.now();
      transaction.create(noteRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        contactId: input.contactId,
        storagePath: null,
        durationMs: Math.max(10_000, Math.min(45_000, input.transcript.length * 50)),
        mimeType: "text/plain",
        conversationEndedConfirmed: true,
        inputMode: "text_test",
        status: "queued",
        attempts: 0,
        processingEventId: null,
        maskedTranscript: null,
        maskedCategories: [],
        maskedRanges: [],
        extraction: null,
        corrections: [],
        interactionId: null,
        sourceAudioDeletedAt: null,
        errorCode: null,
        emulatorImmediate: false,
        textTestImmediate: true,
        createdAt: now,
        updatedAt: now,
      });
      transaction.create(commandRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        type: "registerVoiceTextTest",
        voiceNoteId: noteRef.id,
        createdAt: now,
      });
      return { voiceNoteId: noteRef.id, created: true };
    }));
    if (result.created) await processVoiceNoteDocument(result.voiceNoteId, `text-test-${envelope.requestId}`, input.transcript);
    return { voiceNoteId: result.voiceNoteId };
  },
);

export const registerInteractionText = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 60 },
  async (request): Promise<{ voiceNoteId: string }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<unknown>(request.data, { command: true });
    const parsed = registerInteractionTextSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Interaction text input is invalid.", parsed.error.flatten());
    const input = parsed.data;
    const firestore = getFirestore();
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const contactRef = firestore.collection("contacts").doc(input.contactId);
    const noteRef = firestore.collection("voiceNotes").doc();
    const result = await observeApiRequest("registerInteractionText", envelope.requestId, () => firestore.runTransaction(async (transaction) => {
      const [commandSnapshot, contactSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(contactRef)]);
      if (commandSnapshot.exists) {
        const receipt = commandSnapshot.data()!;
        if (!canManage(receipt, claims) || receipt.type !== "registerInteractionText") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return { voiceNoteId: receipt.voiceNoteId as string, created: false };
      }
      if (!contactSnapshot.exists || !canManage(contactSnapshot.data()!, claims) || contactSnapshot.data()!.deletedAt !== null) {
        throw new HttpsError("not-found", "Contact was not found.");
      }
      const now = Timestamp.now();
      transaction.create(noteRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        contactId: input.contactId,
        storagePath: null,
        durationMs: Math.max(10_000, Math.min(45_000, input.transcript.length * 50)),
        mimeType: "text/plain",
        conversationEndedConfirmed: true,
        inputMode: "manual_text",
        status: "queued",
        attempts: 0,
        processingEventId: null,
        maskedTranscript: null,
        maskedCategories: [],
        maskedRanges: [],
        extraction: null,
        corrections: [],
        interactionId: null,
        sourceAudioDeletedAt: null,
        errorCode: null,
        emulatorImmediate: false,
        textImmediate: true,
        createdAt: now,
        updatedAt: now,
      });
      transaction.create(commandRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        type: "registerInteractionText",
        voiceNoteId: noteRef.id,
        createdAt: now,
      });
      return { voiceNoteId: noteRef.id, created: true };
    }));
    if (result.created) await processVoiceNoteDocument(result.voiceNoteId, `manual-text-${envelope.requestId}`, input.transcript);
    return { voiceNoteId: result.voiceNoteId };
  },
);

export const processVoiceNote = onDocumentCreated(
  { document: "voiceNotes/{voiceNoteId}", region: "europe-west8", retry: true, memory: "512MiB", timeoutSeconds: 120 },
  async (event) => processVoiceNoteDocument(event.params.voiceNoteId, event.id),
);

export const getVoiceNote = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 30 },
  async (request): Promise<{ voiceNote: VoiceNoteView }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<unknown>(request.data);
    const parsed = getVoiceNoteSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Voice note query is invalid.", parsed.error.flatten());
    return observeApiRequest("getVoiceNote", envelope.requestId, async () => {
      const snapshot = await getFirestore().collection("voiceNotes").doc(parsed.data.voiceNoteId).get();
      if (!snapshot.exists || !canManage(snapshot.data()!, claims)) throw new HttpsError("not-found", "Voice note was not found.");
      return { voiceNote: voiceView(snapshot.id, snapshot.data()!) };
    });
  },
);

export const getLatestReviewableVoiceNote = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 30 },
  async (request): Promise<{ voiceNote: VoiceNoteView | null }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<unknown>(request.data);
    return observeApiRequest("getLatestReviewableVoiceNote", envelope.requestId, async () => {
      const snapshot = await getFirestore()
        .collection("voiceNotes")
        .where("ownerUid", "==", claims.uid)
        .limit(100)
        .get();
      const note = snapshot.docs
        .filter((document) => {
          const data = document.data();
          return data.officeId === claims.officeId && ["queued", "processing", "needs_review"].includes(data.status as string);
        })
        .sort((left, right) => milliseconds(right.data().createdAt) - milliseconds(left.data().createdAt))[0];
      return { voiceNote: note ? voiceView(note.id, note.data()) : null };
    });
  },
);

export const discardVoiceNote = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 30 },
  async (request): Promise<{ voiceNoteId: string }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<unknown>(request.data, { command: true });
    const parsed = discardVoiceNoteSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Voice note discard input is invalid.", parsed.error.flatten());
    const firestore = getFirestore();
    const noteRef = firestore.collection("voiceNotes").doc(parsed.data.voiceNoteId);
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    return observeApiRequest("discardVoiceNote", envelope.requestId, () => firestore.runTransaction(async (transaction) => {
      const [commandSnapshot, noteSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(noteRef)]);
      if (commandSnapshot.exists) {
        const receipt = commandSnapshot.data()!;
        if (!canManage(receipt, claims) || receipt.type !== "discardVoiceNote") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return { voiceNoteId: receipt.voiceNoteId as string };
      }
      if (!noteSnapshot.exists || !canManage(noteSnapshot.data()!, claims)) throw new HttpsError("not-found", "Voice note was not found.");
      const note = noteSnapshot.data()!;
      if (note.status !== "needs_review" && note.status !== "discarded") {
        throw new HttpsError("failed-precondition", "Only a reviewable voice note can be discarded.");
      }
      const now = Timestamp.now();
      if (note.status !== "discarded") {
        transaction.update(noteRef, {
          status: "discarded",
          maskedTranscript: null,
          maskedCategories: [],
          maskedRanges: [],
          extraction: null,
          corrections: [],
          processingEventId: null,
          errorCode: null,
          discardedAt: now,
          updatedAt: now,
        });
      }
      transaction.create(commandRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        type: "discardVoiceNote",
        voiceNoteId: noteRef.id,
        createdAt: now,
      });
      return { voiceNoteId: noteRef.id };
    }));
  },
);

export const confirmVoiceNote = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 60 },
  async (request): Promise<{ interactionId: string; opportunityId: string | null }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<unknown>(request.data, { command: true });
    const parsed = confirmVoiceNoteSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Voice note confirmation is invalid.", parsed.error.flatten());
    const firestore = getFirestore();
    const noteRef = firestore.collection("voiceNotes").doc(parsed.data.voiceNoteId);
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const interactionRef = firestore.collection("interactions").doc();
    const opportunityRef = parsed.data.opportunity ? firestore.collection("opportunities").doc() : null;
    const stageEventRef = parsed.data.opportunity ? firestore.collection("stageEvents").doc() : null;

    return observeApiRequest("confirmVoiceNote", envelope.requestId, () => firestore.runTransaction(async (transaction) => {
      const [commandSnapshot, noteSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(noteRef)]);
      if (commandSnapshot.exists) {
        const receipt = commandSnapshot.data()!;
        if (!canManage(receipt, claims) || receipt.type !== "confirmVoiceNote") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return {
          interactionId: receipt.interactionId as string,
          opportunityId: typeof receipt.opportunityId === "string" ? receipt.opportunityId : null,
        };
      }
      if (!noteSnapshot.exists || !canManage(noteSnapshot.data()!, claims)) throw new HttpsError("not-found", "Voice note was not found.");
      const note = noteSnapshot.data()!;
      if (note.status !== "needs_review") throw new HttpsError("failed-precondition", "Voice note is not ready for review.");
      if (parsed.data.interaction.contactId !== note.contactId) throw new HttpsError("failed-precondition", "Voice note contact cannot be changed.");
      const contactRef = firestore.collection("contacts").doc(note.contactId as string);
      const contactSnapshot = await transaction.get(contactRef);
      if (!contactSnapshot.exists || !canManage(contactSnapshot.data()!, claims)) throw new HttpsError("not-found", "Contact was not found.");
      const contact = contactSnapshot.data()!;
      const now = Date.now();
      const interaction = createInteraction(parsed.data.interaction, { officeId: note.officeId as string, ownerUid: note.ownerUid as string }, now);
      interaction.voiceNoteId = noteRef.id;
      const storedRelationship = contact.relationship as FirebaseFirestore.DocumentData;
      const relationship = applyInteractionToRelationship({
        ...(storedRelationship as Contact["relationship"]),
        lastTouchAt: milliseconds(storedRelationship.lastTouchAt) || null,
        nextActionAt: milliseconds(storedRelationship.nextActionAt) || null,
      }, interaction);
      const nowTimestamp = Timestamp.fromMillis(now);
      transaction.create(interactionRef, {
        ...interaction,
        voiceInsights: parsed.data.approvedInsights,
        occurredAt: nowTimestamp,
        nextActionAt: timestamp(interaction.nextActionAt),
        createdAt: nowTimestamp,
      });
      const storedMemory = (contact.memory ?? {}) as FirebaseFirestore.DocumentData;
      const currentMemory = contactMemorySchema.parse({
        keyThingsToRemember: storedMemory.keyThingsToRemember ?? [],
        propertyPreferences: storedMemory.propertyPreferences ?? {
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
        updatedAt: milliseconds(storedMemory.updatedAt) || null,
      });
      const memory = mergeVoiceInsightsIntoContactMemory(currentMemory, parsed.data.approvedInsights, now);
      const inferredRole = inferredContactRole(parsed.data.opportunity?.type);
      const existingRoles = Array.isArray(contact.roles) ? contact.roles as string[] : [];
      const roles = inferredRole ? [inferredRole, ...existingRoles.filter((role) => role !== inferredRole && role !== "unknown")].slice(0, 8) : existingRoles;
      transaction.update(contactRef, {
        relationship: { ...relationship, lastTouchAt: timestamp(relationship.lastTouchAt), nextActionAt: timestamp(relationship.nextActionAt) },
        memory: { ...memory, updatedAt: timestamp(memory.updatedAt) },
        roles,
        updatedAt: nowTimestamp,
      });
      if (parsed.data.opportunity && opportunityRef && stageEventRef) {
        const opportunity = createOpportunityEntity({
          subjectContactId: note.contactId as string,
          ...parsed.data.opportunity,
        }, { officeId: note.officeId as string, ownerUid: note.ownerUid as string }, now);
        transaction.create(opportunityRef, {
          ...opportunity,
          qualifiedAt: nowTimestamp,
          stageEnteredAt: nowTimestamp,
          nextActionAt: Timestamp.fromMillis(parsed.data.opportunity.nextActionAt),
          closedAt: null,
          deletedAt: null,
          createdAt: nowTimestamp,
          updatedAt: nowTimestamp,
        });
        transaction.create(stageEventRef, {
          officeId: note.officeId,
          ownerUid: note.ownerUid,
          entityType: "opportunity",
          entityId: opportunityRef.id,
          fromStage: null,
          toStage: "new_lead",
          reason: "Görüşme onayıyla fırsat oluşturuldu",
          commandId: envelope.commandId,
          occurredAt: nowTimestamp,
          createdAt: nowTimestamp,
        });
      }
      const extracted = note.extraction?.interaction ?? {};
      const reviewed = parsed.data.interaction;
      const corrections: Array<{ path: string; value: unknown }> = Object.entries(reviewed)
        .filter(([key, value]) => key !== "contactId" && JSON.stringify(value) !== JSON.stringify(extracted[key]))
        .map(([path, value]) => ({ path: `interaction.${path}`, value }));
      if (JSON.stringify(parsed.data.approvedInsights) !== JSON.stringify(note.extraction?.insights ?? null)) {
        corrections.push({ path: "insights", value: parsed.data.approvedInsights });
      }
      transaction.update(noteRef, { status: "confirmed", interactionId: interactionRef.id, corrections, updatedAt: nowTimestamp });
      transaction.create(commandRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        type: "confirmVoiceNote",
        voiceNoteId: noteRef.id,
        interactionId: interactionRef.id,
        opportunityId: opportunityRef?.id ?? null,
        createdAt: nowTimestamp,
      });
      return { interactionId: interactionRef.id, opportunityId: opportunityRef?.id ?? null };
    }));
  },
);
