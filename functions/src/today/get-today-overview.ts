import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { buildTodayOverview, dailyTaskOutcomeSchema, type DailyTaskOutcome, type OpportunityStage, type TodayOverview } from "../../../packages/shared/src/index";
import { requireSpherepathClaims } from "../auth/claims.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function istanbulDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const getTodayOverview = onCall(
  {
    region: "europe-west8",
    cors: true,
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request): Promise<{ overview: TodayOverview }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<undefined>(request.data);
    return observeApiRequest("getTodayOverview", envelope.requestId, async () => {
    const firestore = getFirestore();
    let contactsQuery: FirebaseFirestore.Query = firestore.collection("contacts").where("officeId", "==", claims.officeId);
    let opportunitiesQuery: FirebaseFirestore.Query = firestore.collection("opportunities").where("officeId", "==", claims.officeId);
    let listingsQuery: FirebaseFirestore.Query = firestore.collection("listings").where("officeId", "==", claims.officeId);
    let dealsQuery: FirebaseFirestore.Query = firestore.collection("deals").where("officeId", "==", claims.officeId);
    let interactionsQuery: FirebaseFirestore.Query = firestore.collection("interactions").where("officeId", "==", claims.officeId);
    const completionsQuery: FirebaseFirestore.Query = firestore.collection("dailyTaskCompletions").where("officeId", "==", claims.officeId);
    if (claims.role !== "broker") {
      contactsQuery = contactsQuery.where("ownerUid", "==", claims.uid);
      opportunitiesQuery = opportunitiesQuery.where("ownerUid", "==", claims.uid);
      listingsQuery = listingsQuery.where("ownerUid", "==", claims.uid);
      dealsQuery = dealsQuery.where("ownerUid", "==", claims.uid);
      interactionsQuery = interactionsQuery.where("ownerUid", "==", claims.uid);
    }

    const [contactsSnapshot, opportunitiesSnapshot, listingsSnapshot, dealsSnapshot, completionsSnapshot, interactionsSnapshot] = await Promise.all([
      contactsQuery.limit(200).get(),
      opportunitiesQuery.limit(200).get(),
      listingsQuery.limit(200).get(),
      dealsQuery.limit(200).get(),
      completionsQuery.limit(200).get(),
      interactionsQuery.limit(200).get(),
    ]);
    const contacts = contactsSnapshot.docs
      .map((item) => {
        const data = item.data();
        return {
          id: item.id,
          name: (data.fullName ?? data.label ?? "İsimsiz kişi") as string,
          createdAt: millis(data.createdAt) ?? 0,
          meaningfulTouchCount: Number(data.relationship?.meaningfulTouchCount ?? 0),
          nextActionAt: millis(data.relationship?.nextActionAt),
          nextActionType: data.relationship?.nextActionType ?? null,
          deletedAt: millis(data.deletedAt),
        };
      })
      .filter((contact) => contact.deletedAt === null);
    const contactNames = new Map(contacts.map((contact) => [contact.id, contact.name]));
    const opportunities = opportunitiesSnapshot.docs
      .map((item) => {
        const data = item.data();
        return {
          id: item.id,
          subjectContactId: data.subjectContactId as string,
          subjectContactName: contactNames.get(data.subjectContactId as string) ?? "İsimsiz kişi",
          stage: data.stage as OpportunityStage,
          nextActionAt: millis(data.nextActionAt),
          nextActionType: data.nextActionType ?? null,
          deletedAt: millis(data.deletedAt),
        };
      })
      .filter((opportunity) => opportunity.deletedAt === null);

    const listings = listingsSnapshot.docs.map((item) => ({ id: item.id, status: item.data().status, deletedAt: millis(item.data().deletedAt) })).filter((item) => item.deletedAt === null);
    const deals = dealsSnapshot.docs.map((item) => ({ id: item.id, stage: item.data().stage, deletedAt: millis(item.data().deletedAt) })).filter((item) => item.deletedAt === null);
    const interactions = interactionsSnapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        contactId: data.contactId as string,
        contactName: contactNames.get(data.contactId as string) ?? "İsimsiz kişi",
        outcome: typeof data.outcome === "string" && data.outcome.trim() ? data.outcome : "Temas kaydedildi.",
        occurredAt: millis(data.occurredAt) ?? 0,
      };
    });
    const dayKey = istanbulDayKey();
    const completedTaskIds = new Set(completionsSnapshot.docs.filter((item) => { const data = item.data(); return data.dayKey === dayKey && data.status === "completed" && (claims.role === "broker" || data.ownerUid === claims.uid); }).map((item) => item.data().taskId as string));
    return { overview: buildTodayOverview(contacts, opportunities, Date.now(), listings, deals, completedTaskIds, interactions) };
    });
  },
);

export const completeDailyTask = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 60 },
  async (request): Promise<{ taskId: string; status: "completed" | "skipped" }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<DailyTaskOutcome>(request.data, { command: true });
    const parsed = dailyTaskOutcomeSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Daily task outcome is invalid.", parsed.error.flatten());
    if (!/^(next-action|first-interaction|opportunity-action)-/.test(parsed.data.taskId)) throw new HttpsError("invalid-argument", "Daily task identifier is invalid.");
    return observeApiRequest("completeDailyTask", envelope.requestId, async () => {
      const db = getFirestore(); const commandRef = db.collection("commands").doc(envelope.commandId!); const completionRef = db.collection("dailyTaskCompletions").doc(`${claims.uid}-${istanbulDayKey()}-${parsed.data.taskId}`.replace(/[^a-zA-Z0-9_-]/g, "_"));
      await db.runTransaction(async (transaction) => { const receipt = await transaction.get(commandRef); if (receipt.exists) { const data = receipt.data()!; if (data.officeId !== claims.officeId || data.ownerUid !== claims.uid || data.type !== "completeDailyTask") throw new HttpsError("permission-denied", "Command receipt is outside your workspace."); return; } const now = Timestamp.now(); transaction.set(completionRef, { officeId: claims.officeId, ownerUid: claims.uid, taskId: parsed.data.taskId, dayKey: istanbulDayKey(), status: parsed.data.status, skippedReason: parsed.data.skippedReason, completedAt: parsed.data.status === "completed" ? now : null, createdAt: now, updatedAt: now }, { merge: true }); transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "completeDailyTask", taskId: parsed.data.taskId, status: parsed.data.status, createdAt: now }); });
      return { taskId: parsed.data.taskId, status: parsed.data.status };
    });
  },
);
