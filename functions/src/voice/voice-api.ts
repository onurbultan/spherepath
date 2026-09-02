import { v2 as speech } from "@google-cloud/speech";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  applyInteractionToRelationship,
  classifyInboxText,
  contactMemorySchema,
  confirmVoiceNoteSchema,
  createOpportunity as createOpportunityEntity,
  createInteraction,
  discardVoiceNoteSchema,
  mergeVoiceInsightsIntoContactMemory,
  getVoiceNoteSchema,
  registerInteractionTextSchema,
  retryVoiceNoteProcessingSchema,
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
import { buildVoiceDiscardQualitySnapshot, isPossiblyIncompleteTranscription } from "./quality.js";
import {
  emergencySpeechTarget,
  fallbackSpeechTarget,
  primarySpeechTarget,
  separateChannelRecognition,
  syncRecognitionLimitMs,
  type SpeechTarget,
} from "./transcription-config.js";

const speechClients = new Map<string, speech.SpeechClient>();
// The lease has to outlast the longest processing run, otherwise a batch
// transcription still in flight looks abandoned and is picked up twice.
const processingLeaseMs = 600_000;

function timestamp(value: number | null): Timestamp | null {
  return value === null ? null : Timestamp.fromMillis(value);
}

function milliseconds(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

function voiceView(id: string, data: FirebaseFirestore.DocumentData): VoiceNoteView {
  const parsedExtraction = voiceExtractionSchema.safeParse(data.extraction);
  const maskedTranscript = typeof data.maskedTranscript === "string" ? data.maskedTranscript : null;
  const createdAt = milliseconds(data.createdAt);
  const extraction = parsedExtraction.success && maskedTranscript
    ? normalizeVoiceActionTiming(
      normalizeVoiceExtraction(parsedExtraction.data, maskedTranscript),
      maskedTranscript,
      new Date(createdAt || Date.now()),
    )
    : parsedExtraction.success
      ? parsedExtraction.data
      : null;
  return {
    id,
    contactId: data.contactId as string,
    inputMode: data.inputMode === "manual_text" ? "manual_text"
      : data.inputMode === "text_test" ? "text_test"
        : data.inputMode === "call" ? "call" : "audio",
    status: data.status as VoiceNoteStatus,
    durationMs: data.durationMs as number,
    maskedTranscript,
    maskedCategories: Array.isArray(data.maskedCategories) ? data.maskedCategories : [],
    transcriptionWarning: data.transcriptionWarning === "possibly_incomplete" ? "possibly_incomplete" : null,
    extraction,
    interactionId: typeof data.interactionId === "string" ? data.interactionId : null,
    errorCode: typeof data.errorCode === "string" ? data.errorCode : null,
    createdAt,
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

interface TranscriptionResult {
  text: string;
  model: SpeechTarget["model"];
  location: SpeechTarget["location"];
  warning: "possibly_incomplete" | null;
}

function transcriptWordCount(value: string): number {
  const text = value.trim();
  return text ? text.split(/\s+/u).length : 0;
}

type SpeechResults = Array<{ alternatives?: Array<{ transcript?: string | null } | null> | null } | null>;

function joinTranscript(results: SpeechResults | null | undefined): string {
  return (results ?? [])
    .map((result) => result?.alternatives?.[0]?.transcript?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();
}

async function transcribe(storagePath: string, durationMs: number): Promise<TranscriptionResult> {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error("speech_project_missing");
  const bucket = getStorage().bucket();
  // A phone call runs far past the synchronous limit, so long audio is handed to
  // batchRecognize by object reference instead of being downloaded and inlined.
  const useBatch = durationMs > syncRecognitionLimitMs;
  const gcsUri = `gs://${bucket.name}/${storagePath}`;
  const [content] = useBatch ? [null] : await bucket.file(storagePath).download();
  const recognize = async (target: SpeechTarget) => {
    let client = speechClients.get(target.apiEndpoint);
    if (!client) {
      client = new speech.SpeechClient({ apiEndpoint: target.apiEndpoint });
      speechClients.set(target.apiEndpoint, client);
    }
    const recognizer = `projects/${projectId}/locations/${target.location}/recognizers/_`;
    const config = {
      autoDecodingConfig: {},
      languageCodes: ["tr-TR"],
      model: target.model,
      features: {
        enableAutomaticPunctuation: true,
        ...(separateChannelRecognition && useBatch
          ? { multiChannelMode: "SEPARATE_RECOGNITION_PER_CHANNEL" as const }
          : {}),
      },
    };
    if (!useBatch) {
      const [response] = await client.recognize({ recognizer, config, content });
      return joinTranscript(response.results as SpeechResults);
    }
    const [operation] = await client.batchRecognize({
      recognizer,
      config,
      files: [{ uri: gcsUri }],
      // Inline output keeps the transcript in the operation result, so no
      // second bucket has to be provisioned or cleaned up afterwards.
      recognitionOutputConfig: { inlineResponseConfig: {} },
    });
    const [response] = await operation.promise();
    const fileResult = response.results?.[gcsUri];
    if (fileResult?.error?.message) throw new Error(fileResult.error.message);
    return joinTranscript(fileResult?.transcript?.results as SpeechResults);
  };

  let target: SpeechTarget = primarySpeechTarget;
  let text: string;
  try {
    text = await recognize(target);
  } catch (error) {
    logger.warn("Primary voice transcription unavailable; safe fallback selected", {
      primaryModel: primarySpeechTarget.model,
      primaryLocation: primarySpeechTarget.location,
      fallbackModel: fallbackSpeechTarget.model,
      fallbackLocation: fallbackSpeechTarget.location,
      error,
    });
    target = fallbackSpeechTarget;
    try {
      text = await recognize(target);
    } catch (fallbackError) {
      logger.warn("Long voice transcription fallback unavailable; emergency model selected", {
        fallbackModel: fallbackSpeechTarget.model,
        fallbackLocation: fallbackSpeechTarget.location,
        emergencyModel: emergencySpeechTarget.model,
        emergencyLocation: emergencySpeechTarget.location,
        error: fallbackError,
      });
      target = emergencySpeechTarget;
      text = await recognize(target);
    }
  }
  if (isPossiblyIncompleteTranscription(durationMs, text)) {
    for (const candidate of [fallbackSpeechTarget, emergencySpeechTarget] as const) {
      if (candidate.model === target.model && candidate.location === target.location) continue;
      try {
        const alternative = await recognize(candidate);
        if (transcriptWordCount(alternative) > transcriptWordCount(text)) {
          text = alternative;
          target = candidate;
        }
      } catch (error) {
        logger.warn("Alternative voice transcription unavailable; best existing result retained", {
          model: candidate.model,
          location: candidate.location,
          error,
        });
      }
    }
  }
  return {
    text,
    model: target.model,
    location: target.location,
    warning: isPossiblyIncompleteTranscription(durationMs, text) ? "possibly_incomplete" : null,
  };
}

async function processVoiceNoteDocument(voiceNoteId: string, eventId: string, rawOverride?: string) {
  const firestore = getFirestore();
  const noteRef = firestore.collection("voiceNotes").doc(voiceNoteId);
  const acquired = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(noteRef);
    if (!snapshot.exists) return null;
    const data = snapshot.data()!;
    if (["needs_review", "confirmed", "discarded", "failed"].includes(data.status as string)) return null;
    if (data.status === "processing" && Date.now() - milliseconds(data.updatedAt) < processingLeaseMs) return null;
    // Written notes are processed synchronously by their callable with a raw
    // transcript. The Firestore create trigger can race that callable, but it
    // must never try to download a non-existent audio object.
    const isAudioNote = data.inputMode === "audio" || data.inputMode === "call"
      || (data.inputMode == null && typeof data.storagePath === "string" && data.storagePath.length > 0);
    if (!isAudioNote && rawOverride === undefined) return null;
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
      durationMs: typeof data.durationMs === "number" ? data.durationMs : 0,
      attempts: Number(data.attempts ?? 0) + 1,
      // A call is a two-party recording; extraction has to read it differently.
      source: data.inputMode === "call" ? "call" as const : "note" as const,
      callDirection: data.callDirection === "inbound" || data.callDirection === "outbound" ? data.callDirection : null,
    };
  });
  if (!acquired) return;
  const processingStartedAt = Date.now();

  try {
    const processingDate = new Date();
    const transcription = rawOverride === undefined
      ? await transcribe(acquired.storagePath, acquired.durationMs)
      : { text: rawOverride, model: null, location: null, warning: null };
    const rawTranscript = transcription.text;
    const masked = maskSensitiveTranscript(rawTranscript);
    let extraction = extractVoiceDraft(masked.text);
    const contact = await firestore.collection("contacts").doc(acquired.contactId).get();
    const profilingObjected = contact.data()?.privacy?.profilingObjection === true;
    const shouldUseVertex = process.env.FUNCTIONS_EMULATOR !== "true" && !profilingObjected;
    if (shouldUseVertex && !extraction.isUnclear) {
      try {
        extraction = sanitizeVoiceExtraction(await extractVoiceDraftWithVertex(masked.text, processingDate, acquired.source, acquired.callDirection));
      } catch (error) {
        // An Error's `message` is not enumerable, so logging the object alone
        // reduced a specific API complaint to `{name, status}`.
        logger.warn("Vertex voice extraction failed; deterministic fallback retained", {
          voiceNoteId,
          eventId,
          reason: error instanceof Error ? error.message : String(error),
          status: (error as { status?: unknown })?.status ?? null,
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
      transcriptionModel: transcription.model,
      transcriptionLocation: transcription.location,
      transcriptionWarning: transcription.warning,
      transcriptionWordCount: transcriptWordCount(rawTranscript),
      extraction,
      sourceAudioDeletedAt: Timestamp.now(),
      processingEventId: null,
      errorCode: null,
      updatedAt: Timestamp.now(),
    });
    logger.info("Voice note processing completed", {
      voiceNoteId,
      durationMs: Date.now() - processingStartedAt,
      recordingDurationMs: acquired.durationMs,
      transcriptionModel: transcription.model,
      transcriptionLocation: transcription.location,
      transcriptionWordCount: transcriptWordCount(rawTranscript),
      transcriptionWarning: transcription.warning,
      extractionEngine: extraction.provenance.engine,
      propertySituationCount: extraction.insights.propertySituations.length,
    });
  } catch (error) {
    logger.error("Voice note processing failed", { voiceNoteId, eventId, attempts: acquired.attempts, durationMs: Date.now() - processingStartedAt, error });
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
        transcriptionModel: null,
        transcriptionLocation: null,
        transcriptionWarning: null,
        transcriptionWordCount: null,
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
        durationMs: Math.max(5_000, Math.min(90_000, input.transcript.length * 50)),
        mimeType: "text/plain",
        conversationEndedConfirmed: true,
        inputMode: "text_test",
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
        durationMs: Math.max(5_000, Math.min(90_000, input.transcript.length * 50)),
        mimeType: "text/plain",
        conversationEndedConfirmed: true,
        inputMode: "manual_text",
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
  { document: "voiceNotes/{voiceNoteId}", region: "europe-west8", retry: true, memory: "512MiB", timeoutSeconds: 540 },
  async (event) => processVoiceNoteDocument(event.params.voiceNoteId, event.id),
);

export const retryVoiceNoteProcessing = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "512MiB", timeoutSeconds: 540 },
  async (request): Promise<{ voiceNoteId: string }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<unknown>(request.data, { command: true });
    const parsed = retryVoiceNoteProcessingSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Voice note retry input is invalid.", parsed.error.flatten());
    const input = parsed.data;
    const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
    if (input.emulatorTranscript && !isEmulator) throw new HttpsError("invalid-argument", "Emulator transcript is not available.");

    const firestore = getFirestore();
    const noteRef = firestore.collection("voiceNotes").doc(input.voiceNoteId);
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const recovery = await observeApiRequest("retryVoiceNoteProcessing", envelope.requestId, () => firestore.runTransaction(async (transaction) => {
      const [commandSnapshot, noteSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(noteRef)]);
      if (commandSnapshot.exists) {
        const receipt = commandSnapshot.data()!;
        if (!canManage(receipt, claims) || receipt.type !== "retryVoiceNoteProcessing") {
          throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        }
        return { shouldProcess: receipt.status !== "completed" };
      }
      if (!noteSnapshot.exists || !canManage(noteSnapshot.data()!, claims)) {
        throw new HttpsError("not-found", "Voice note was not found.");
      }
      transaction.create(commandRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        type: "retryVoiceNoteProcessing",
        voiceNoteId: noteRef.id,
        status: "started",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      return { shouldProcess: true };
    }));

    if (recovery.shouldProcess) {
      await processVoiceNoteDocument(input.voiceNoteId, `retry-${envelope.requestId}`, input.emulatorTranscript);
      await commandRef.update({ status: "completed", updatedAt: Timestamp.now() });
    }
    return { voiceNoteId: input.voiceNoteId };
  },
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
      // Filtering in memory over an unordered page silently loses the newest note
      // once an advisor has more than a page of them, which call volume reaches in
      // days. The index does the work instead.
      const snapshot = await getFirestore()
        .collection("voiceNotes")
        .where("officeId", "==", claims.officeId)
        .where("ownerUid", "==", claims.uid)
        .where("status", "in", ["queued", "processing", "needs_review"])
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
      const note = snapshot.docs[0];
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
        const qualitySnapshot = buildVoiceDiscardQualitySnapshot(note);
        transaction.update(noteRef, {
          status: "discarded",
          maskedTranscript: null,
          maskedCategories: [],
          maskedRanges: [],
          extraction: null,
          corrections: [],
          qualitySnapshot,
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
  async (request): Promise<{ interactionId: string; opportunityId: string | null; opportunityIds: string[] }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<unknown>(request.data, { command: true });
    const parsed = confirmVoiceNoteSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Voice note confirmation is invalid.", parsed.error.flatten());
    const firestore = getFirestore();
    const noteRef = firestore.collection("voiceNotes").doc(parsed.data.voiceNoteId);
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const interactionRef = firestore.collection("interactions").doc();
    const inboxRef = firestore.collection("inboxItems").doc(`voice-${parsed.data.voiceNoteId}`);
    const opportunityDrafts = [
      ...parsed.data.opportunities,
      ...(parsed.data.opportunity ? [parsed.data.opportunity] : []),
    ].filter((draft, index, drafts) => drafts.findIndex((candidate) => candidate.type === draft.type) === index).slice(0, 3);
    const opportunityRefs = opportunityDrafts.map(() => firestore.collection("opportunities").doc());
    const stageEventRefs = opportunityDrafts.map(() => firestore.collection("stageEvents").doc());

    return observeApiRequest("confirmVoiceNote", envelope.requestId, () => firestore.runTransaction(async (transaction) => {
      const [commandSnapshot, noteSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(noteRef)]);
      if (commandSnapshot.exists) {
        const receipt = commandSnapshot.data()!;
        if (!canManage(receipt, claims) || receipt.type !== "confirmVoiceNote") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return {
          interactionId: receipt.interactionId as string,
          opportunityId: typeof receipt.opportunityId === "string" ? receipt.opportunityId : null,
          opportunityIds: Array.isArray(receipt.opportunityIds)
            ? receipt.opportunityIds as string[]
            : typeof receipt.opportunityId === "string" ? [receipt.opportunityId as string] : [],
        };
      }
      if (!noteSnapshot.exists || !canManage(noteSnapshot.data()!, claims)) throw new HttpsError("not-found", "Voice note was not found.");
      const note = noteSnapshot.data()!;
      if (note.status !== "needs_review") throw new HttpsError("failed-precondition", "Voice note is not ready for review.");
      const originalContactId = note.contactId as string;
      const targetContactId = parsed.data.interaction.contactId;
      const contactRef = firestore.collection("contacts").doc(targetContactId);
      const contactSnapshot = await transaction.get(contactRef);
      if (!contactSnapshot.exists || !canManage(contactSnapshot.data()!, claims) || contactSnapshot.data()!.deletedAt !== null) throw new HttpsError("not-found", "Contact was not found.");
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
      const inboxClassification = classifyInboxText(interaction.noteSummary || interaction.outcome || "Görüşme kaydedildi");
      transaction.create(inboxRef, {
        officeId: note.officeId,
        ownerUid: note.ownerUid,
        source: "voice",
        safeText: inboxClassification.safeText,
        summary: inboxClassification.summary,
        kind: inboxClassification.kind,
        status: "applied",
        confidence: inboxClassification.confidence,
        linkedContactId: targetContactId,
        sourceEntityId: interactionRef.id,
        appliedActions: [{ type: "interaction_created", entityId: interactionRef.id, label: "Sesli görüşme onaylandı", appliedAt: nowTimestamp, undoneAt: null }],
        pinned: false,
        needsLocation: inboxClassification.needsLocation,
        errorCode: null,
        archivedAt: null,
        createdAt: nowTimestamp,
        updatedAt: nowTimestamp,
      });
      const storedMemory = (contact.memory ?? {}) as FirebaseFirestore.DocumentData;
      const currentMemory = contactMemorySchema.parse({
        keyThingsToRemember: storedMemory.keyThingsToRemember ?? [],
        propertySituations: storedMemory.propertySituations ?? [],
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
      const inferredRoles = opportunityDrafts.map((draft) => inferredContactRole(draft.type)).filter((role): role is NonNullable<typeof role> => role !== null);
      const existingRoles = Array.isArray(contact.roles) ? contact.roles as string[] : [];
      const roles = inferredRoles.length
        ? [...new Set([...inferredRoles, ...existingRoles.filter((role) => role !== "unknown")])].slice(0, 8)
        : existingRoles;
      transaction.update(contactRef, {
        relationship: { ...relationship, lastTouchAt: timestamp(relationship.lastTouchAt), nextActionAt: timestamp(relationship.nextActionAt) },
        memory: { ...memory, updatedAt: timestamp(memory.updatedAt) },
        roles,
        updatedAt: nowTimestamp,
      });
      for (const [index, draft] of opportunityDrafts.entries()) {
        const opportunityRef = opportunityRefs[index]!;
        const stageEventRef = stageEventRefs[index]!;
        const opportunity = createOpportunityEntity({
          subjectContactId: targetContactId,
          ...draft,
        }, { officeId: note.officeId as string, ownerUid: note.ownerUid as string }, now);
        transaction.create(opportunityRef, {
          ...opportunity,
          qualifiedAt: nowTimestamp,
          stageEnteredAt: nowTimestamp,
          nextActionAt: Timestamp.fromMillis(draft.nextActionAt),
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
      if (targetContactId !== originalContactId) corrections.unshift({ path: "contactId", value: targetContactId });
      transaction.update(noteRef, {
        status: "confirmed",
        contactId: targetContactId,
        ...(targetContactId !== originalContactId ? { reassignedFromContactId: originalContactId } : {}),
        interactionId: interactionRef.id,
        corrections,
        updatedAt: nowTimestamp,
      });
      transaction.create(commandRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        type: "confirmVoiceNote",
        voiceNoteId: noteRef.id,
        interactionId: interactionRef.id,
        opportunityId: opportunityRefs[0]?.id ?? null,
        opportunityIds: opportunityRefs.map((ref) => ref.id),
        createdAt: nowTimestamp,
      });
      return {
        interactionId: interactionRef.id,
        opportunityId: opportunityRefs[0]?.id ?? null,
        opportunityIds: opportunityRefs.map((ref) => ref.id),
      };
    }));
  },
);
