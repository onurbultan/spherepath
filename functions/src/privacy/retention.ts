import { getFirestore, Timestamp, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";

const DAY = 86_400_000;

async function olderThan(collection: string, days: number) {
  return getFirestore().collection(collection)
    .where("createdAt", "<", Timestamp.fromMillis(Date.now() - days * DAY))
    .limit(300)
    .get();
}

async function deleteDocuments(documents: QueryDocumentSnapshot[]) {
  if (documents.length === 0) return 0;
  const writer = getFirestore().bulkWriter();
  for (const document of documents) writer.delete(document.ref);
  await writer.close();
  return documents.length;
}

export const runRetentionPurge = onSchedule(
  {
    schedule: "0 3 1 * *",
    timeZone: "Europe/Istanbul",
    region: "europe-west8",
    retryCount: 3,
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const [voiceSnapshot, commandSnapshot, requestSnapshot, inboxSnapshot] = await Promise.all([
      olderThan("voiceNotes", 180),
      olderThan("commands", 90),
      olderThan("dataSubjectRequests", 180),
      olderThan("inboxItems", 365),
    ]);
    const expiredVoiceNotes = voiceSnapshot.docs.filter((item) => ["confirmed", "failed"].includes(item.data().status as string));
    await Promise.all(expiredVoiceNotes.map(async (note) => {
      const path = note.data().storagePath;
      if (typeof path === "string") await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
    }));
    const completedRequests = requestSnapshot.docs.filter((item) => ["completed", "rejected"].includes(item.data().status as string));
    const archivedInboxItems = inboxSnapshot.docs.filter((item) => item.data().status === "archived");
    const [voiceNotesDeleted, commandsDeleted, requestsDeleted, inboxItemsDeleted] = await Promise.all([
      deleteDocuments(expiredVoiceNotes),
      deleteDocuments(commandSnapshot.docs),
      deleteDocuments(completedRequests),
      deleteDocuments(archivedInboxItems),
    ]);
    logger.info("Retention purge completed", { voiceNotesDeleted, commandsDeleted, requestsDeleted, inboxItemsDeleted, policyVersion: "v2" });
  },
);
