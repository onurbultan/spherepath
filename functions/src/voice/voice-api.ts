import { v2 as speech } from "@google-cloud/speech";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  applyInteractionToRelationship,
  confirmVoiceNoteSchema,
  createInteraction,
  getVoiceNoteSchema,
  registerVoiceNoteSchema,
  type Contact,
  type VoiceNoteStatus,
  type VoiceNoteView,
} from "../../../packages/shared/src/index.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims } from "../auth/claims.js";
import { extractVoiceDraft, maskSensitiveTranscript } from "./privacy.js";

const speechClient = new speech.SpeechClient();

function timestamp(value: number | null): Timestamp | null {
  return value === null ? null : Timestamp.fromMillis(value);
}

function milliseconds(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

function voiceView(id: string, data: FirebaseFirestore.DocumentData): VoiceNoteView {
  return {
    id,
    contactId: data.contactId as string,
    status: data.status as VoiceNoteStatus,
    durationMs: data.durationMs as number,
    maskedTranscript: typeof data.maskedTranscript === "string" ? data.maskedTranscript : null,
    maskedCategories: Array.isArray(data.maskedCategories) ? data.maskedCategories : [],
    extraction: data.extraction ?? null,
    interactionId: typeof data.interactionId === "string" ? data.interactionId : null,
    errorCode: typeof data.errorCode === "string" ? data.errorCode : null,
    createdAt: milliseconds(data.createdAt),
    updatedAt: milliseconds(data.updatedAt),
  };
}

function canManage(data: FirebaseFirestore.DocumentData, claims: { officeId: string; uid: string; role: "agent" | "broker" }) {
  return data.officeId === claims.officeId && (data.ownerUid === claims.uid || claims.role === "broker");
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
    if (["needs_review", "confirmed", "failed"].includes(data.status as string)) return null;
    if (data.emulatorImmediate === true && rawOverride === undefined) return null;
    const now = Timestamp.now();
    transaction.update(noteRef, {
      status: "processing",
      processingEventId: eventId,
      attempts: Number(data.attempts ?? 0) + 1,
      updatedAt: now,
    });
    return { storagePath: data.storagePath as string, attempts: Number(data.attempts ?? 0) + 1 };
  });
  if (!acquired) return;

  try {
    const rawTranscript = rawOverride ?? await transcribe(acquired.storagePath);
    const masked = maskSensitiveTranscript(rawTranscript);
    const extraction = extractVoiceDraft(masked.text);
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
    if (acquired.attempts < 3) {
      await noteRef.update({ status: "queued", processingEventId: null, errorCode: "processing_retry", updatedAt: Timestamp.now() });
      throw error;
    }
    await getStorage().bucket().file(acquired.storagePath).delete({ ignoreNotFound: true }).catch((deleteError) => {
      logger.error("Voice source deletion failed", { voiceNoteId, deleteError });
    });
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

export const confirmVoiceNote = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 60 },
  async (request): Promise<{ interactionId: string }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<unknown>(request.data, { command: true });
    const parsed = confirmVoiceNoteSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Voice note confirmation is invalid.", parsed.error.flatten());
    const firestore = getFirestore();
    const noteRef = firestore.collection("voiceNotes").doc(parsed.data.voiceNoteId);
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const interactionRef = firestore.collection("interactions").doc();

    return observeApiRequest("confirmVoiceNote", envelope.requestId, () => firestore.runTransaction(async (transaction) => {
      const [commandSnapshot, noteSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(noteRef)]);
      if (commandSnapshot.exists) {
        const receipt = commandSnapshot.data()!;
        if (!canManage(receipt, claims) || receipt.type !== "confirmVoiceNote") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return { interactionId: receipt.interactionId as string };
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
        occurredAt: nowTimestamp,
        nextActionAt: timestamp(interaction.nextActionAt),
        createdAt: nowTimestamp,
      });
      transaction.update(contactRef, {
        relationship: { ...relationship, lastTouchAt: timestamp(relationship.lastTouchAt), nextActionAt: timestamp(relationship.nextActionAt) },
        updatedAt: nowTimestamp,
      });
      const extracted = note.extraction?.interaction ?? {};
      const reviewed = parsed.data.interaction;
      const corrections = Object.entries(reviewed)
        .filter(([key, value]) => key !== "contactId" && JSON.stringify(value) !== JSON.stringify(extracted[key]))
        .map(([path, value]) => ({ path: `interaction.${path}`, value }));
      transaction.update(noteRef, { status: "confirmed", interactionId: interactionRef.id, corrections, updatedAt: nowTimestamp });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "confirmVoiceNote", voiceNoteId: noteRef.id, interactionId: interactionRef.id, createdAt: nowTimestamp });
      return { interactionId: interactionRef.id };
    }));
  },
);
