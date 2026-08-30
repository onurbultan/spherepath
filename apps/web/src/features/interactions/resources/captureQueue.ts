import {
  ApiError,
  createCommandId,
  type ManualInteractionDraft,
  type RegisterVoiceNoteInput,
} from "@spherepath/shared";
import { ref, uploadBytes } from "firebase/storage";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";
import { firebaseServices } from "@/shared/firebase/client";

const databaseName = "spherepath-offline";
const storeName = "captureQueue";

type CaptureQueueItem = {
  id: string;
  ownerUid: string;
  officeId: string;
  commandId: string;
  createdAt: number;
} & (
  | { kind: "interaction"; interaction: ManualInteractionDraft }
  | { kind: "voice"; contactId: string; audio: Blob; durationMs: number; mimeType: RegisterVoiceNoteInput["mimeType"] }
);

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Çevrimdışı kayıt alanı açılamadı."));
  });
}

async function allItems(): Promise<CaptureQueueItem[]> {
  if (typeof indexedDB === "undefined") return [];
  const database = await openDatabase();
  return new Promise<CaptureQueueItem[]>((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as CaptureQueueItem[]);
    request.onerror = () => reject(request.error ?? new Error("Çevrimdışı kayıtlar okunamadı."));
  }).finally(() => database.close());
}

async function putItem(item: CaptureQueueItem): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Çevrimdışı kayıt saklanamadı."));
  }).finally(() => database.close());
  window.dispatchEvent(new Event("spherepath-offline-queue"));
}

async function deleteItem(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Çevrimdışı kayıt temizlenemedi."));
  }).finally(() => database.close());
  window.dispatchEvent(new Event("spherepath-offline-queue"));
}

const isOnline = () => typeof navigator === "undefined" || navigator.onLine;
const isNetworkFailure = (error: unknown) => !isOnline() || (error instanceof ApiError && error.category === "network");

async function sendVoice(item: Extract<CaptureQueueItem, { kind: "voice" }>): Promise<string> {
  const extension = item.mimeType === "audio/mp4" || item.mimeType === "audio/m4a" ? "m4a" : item.mimeType.includes("wav") ? "wav" : "webm";
  const fileId = item.commandId.replace(/[^A-Za-z0-9_-]/gu, "-");
  const storagePath = `offices/${item.officeId}/voice/${item.ownerUid}/${fileId}.${extension}`;
  await uploadBytes(ref(firebaseServices().storage, storagePath), item.audio, {
    contentType: item.mimeType,
    customMetadata: { contactId: item.contactId, durationMs: String(item.durationMs) },
  });
  const input: RegisterVoiceNoteInput = {
    contactId: item.contactId,
    storagePath,
    durationMs: item.durationMs,
    mimeType: item.mimeType,
    conversationEndedConfirmed: true,
    emulatorTranscript: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
      ? "Çevrimdışı sesli not testi. Urla'da bir portföy duyuldu."
      : undefined,
  };
  return (await apiClient.command<RegisterVoiceNoteInput, { voiceNoteId: string }>("registerVoiceNote", input, item.commandId)).voiceNoteId;
}

export async function saveOrQueueInteraction(session: WorkspaceSession, interaction: ManualInteractionDraft): Promise<string> {
  const commandId = createCommandId(session.uid);
  const item: CaptureQueueItem = { id: commandId, ownerUid: session.uid, officeId: session.officeId, commandId, createdAt: Date.now(), kind: "interaction", interaction };
  if (!isOnline()) { await putItem(item); return `queued-${commandId}`; }
  try { return (await apiClient.command<ManualInteractionDraft, { interactionId: string }>("recordInteraction", interaction, commandId)).interactionId; }
  catch (error) { if (!isNetworkFailure(error)) throw error; await putItem(item); return `queued-${commandId}`; }
}

export async function saveOrQueueVoice(session: WorkspaceSession, contactId: string, audio: Blob, durationMs: number): Promise<string | null> {
  const commandId = createCommandId(session.uid);
  const mimeType = (audio.type.split(";")[0] || "audio/webm") as RegisterVoiceNoteInput["mimeType"];
  const item: CaptureQueueItem = { id: commandId, ownerUid: session.uid, officeId: session.officeId, commandId, createdAt: Date.now(), kind: "voice", contactId, audio, durationMs, mimeType };
  if (!isOnline()) { await putItem(item); return null; }
  try { return await sendVoice(item); }
  catch (error) { if (!isNetworkFailure(error)) throw error; await putItem(item); return null; }
}

export async function flushCaptureQueue(session: WorkspaceSession): Promise<number> {
  if (!isOnline()) return captureQueueCount(session.uid);
  for (const item of await allItems()) {
    if (item.ownerUid !== session.uid || item.officeId !== session.officeId) continue;
    try {
      if (item.kind === "interaction") await apiClient.command<ManualInteractionDraft, { interactionId: string }>("recordInteraction", item.interaction, item.commandId);
      else await sendVoice(item);
      await deleteItem(item.id);
    } catch {
      // Retain the original idempotent command for the next online attempt.
    }
  }
  return captureQueueCount(session.uid);
}

export async function captureQueueCount(ownerUid?: string): Promise<number> {
  const items = await allItems();
  return ownerUid ? items.filter((item) => item.ownerUid === ownerUid).length : items.length;
}
