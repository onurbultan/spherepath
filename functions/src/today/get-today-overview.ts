import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { buildTodayOverview, dailyTaskOutcomeSchema, todayOverviewQuerySchema, type DailyTaskOutcome, type OpportunityStage, type TodayOverview } from "../../../packages/shared/src/index";
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
    const envelope = readApiEnvelope<unknown>(request.data);
    const parsedQuery = todayOverviewQuerySchema.safeParse(envelope.data);
    if (!parsedQuery.success) throw new HttpsError("invalid-argument", "Reporting period is invalid.", parsedQuery.error.flatten());
    return observeApiRequest("getTodayOverview", envelope.requestId, async () => {
    const firestore = getFirestore();
    let contactsQuery: FirebaseFirestore.Query = firestore.collection("contacts").where("officeId", "==", claims.officeId);
    let opportunitiesQuery: FirebaseFirestore.Query = firestore.collection("opportunities").where("officeId", "==", claims.officeId);
    let listingsQuery: FirebaseFirestore.Query = firestore.collection("listings").where("officeId", "==", claims.officeId);
    let dealsQuery: FirebaseFirestore.Query = firestore.collection("deals").where("officeId", "==", claims.officeId);
    let interactionsQuery: FirebaseFirestore.Query = firestore.collection("interactions").where("officeId", "==", claims.officeId);
    let completionsQuery: FirebaseFirestore.Query = firestore.collection("dailyTaskCompletions").where("officeId", "==", claims.officeId);
    if (claims.role !== "broker") {
      contactsQuery = contactsQuery.where("ownerUid", "==", claims.uid);
      opportunitiesQuery = opportunitiesQuery.where("ownerUid", "==", claims.uid);
      listingsQuery = listingsQuery.where("ownerUid", "==", claims.uid);
      dealsQuery = dealsQuery.where("ownerUid", "==", claims.uid);
      interactionsQuery = interactionsQuery.where("ownerUid", "==", claims.uid);
      completionsQuery = completionsQuery.where("ownerUid", "==", claims.uid);
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
          lastTouchAt: millis(data.relationship?.lastTouchAt),
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
          createdAt: millis(data.createdAt) ?? 0,
          deletedAt: millis(data.deletedAt),
        };
      })
      .filter((opportunity) => opportunity.deletedAt === null);

    const listings = listingsSnapshot.docs.map((item) => ({ id: item.id, status: item.data().status, createdAt: millis(item.data().createdAt) ?? 0, deletedAt: millis(item.data().deletedAt) })).filter((item) => item.deletedAt === null);
    const deals = dealsSnapshot.docs.map((item) => ({ id: item.id, stage: item.data().stage, closedAt: millis(item.data().closedAt), deletedAt: millis(item.data().deletedAt) })).filter((item) => item.deletedAt === null);
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
    const completedTaskIds = new Set(completionsSnapshot.docs.filter((item) => { const data = item.data(); return data.dayKey === dayKey && ["completed", "skipped", "rescheduled"].includes(data.status as string) && (claims.role === "broker" || data.ownerUid === claims.uid); }).map((item) => item.data().taskId as string));
    return { overview: buildTodayOverview(contacts, opportunities, Date.now(), listings, deals, completedTaskIds, interactions, parsedQuery.data.period) };
    });
  },
);

export const completeDailyTask = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 60 },
  async (request): Promise<{ taskId: string; status: "completed" | "skipped" | "rescheduled" }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<DailyTaskOutcome>(request.data, { command: true });
    const parsed = dailyTaskOutcomeSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Daily task outcome is invalid.", parsed.error.flatten());
    if (!/^(next-action|first-interaction|opportunity-action)-/.test(parsed.data.taskId)) throw new HttpsError("invalid-argument", "Daily task identifier is invalid.");
    return observeApiRequest("completeDailyTask", envelope.requestId, async () => {
      const db = getFirestore();
      const commandRef = db.collection("commands").doc(envelope.commandId!);
      const completionRef = db.collection("dailyTaskCompletions").doc(`${claims.uid}-${istanbulDayKey()}-${parsed.data.taskId}`.replace(/[^a-zA-Z0-9_-]/g, "_"));
      const opportunityPrefix = "opportunity-action-";
      const contactPrefixes = ["next-action-", "first-interaction-"] as const;
      const opportunityId = parsed.data.taskId.startsWith(opportunityPrefix) ? parsed.data.taskId.slice(opportunityPrefix.length) : null;
      const contactPrefix = contactPrefixes.find((prefix) => parsed.data.taskId.startsWith(prefix));
      const contactId = contactPrefix ? parsed.data.taskId.slice(contactPrefix.length) : null;
      const targetRef = opportunityId
        ? db.collection("opportunities").doc(opportunityId)
        : contactId
          ? db.collection("contacts").doc(contactId)
          : null;

      await db.runTransaction(async (transaction) => {
        const [receipt, target] = await Promise.all([
          transaction.get(commandRef),
          targetRef ? transaction.get(targetRef) : Promise.resolve(null),
        ]);
        if (receipt.exists) {
          const data = receipt.data()!;
          if (data.officeId !== claims.officeId || data.ownerUid !== claims.uid || data.type !== "completeDailyTask") {
            throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
          }
          return;
        }
        if (!targetRef || !target?.exists) throw new HttpsError("not-found", "Daily task target was not found.");
        const targetData = target.data()!;
        if (targetData.officeId !== claims.officeId || (targetData.ownerUid !== claims.uid && claims.role !== "broker") || targetData.deletedAt instanceof Timestamp) {
          throw new HttpsError("permission-denied", "Daily task target is outside your workspace.");
        }

        let linkedContactRef: FirebaseFirestore.DocumentReference | null = null;
        let linkedContactData: FirebaseFirestore.DocumentData | null = null;
        if (opportunityId && typeof targetData.subjectContactId === "string") {
          const contactRef = db.collection("contacts").doc(targetData.subjectContactId);
          const contactSnapshot = await transaction.get(contactRef);
          const contactData = contactSnapshot.data();
          const contactActionAt = contactData?.relationship?.nextActionAt;
          const opportunityActionAt = targetData.nextActionAt;
          const sameAction = contactSnapshot.exists
            && contactData?.officeId === claims.officeId
            && (contactData?.ownerUid === claims.uid || claims.role === "broker")
            && !(contactData?.deletedAt instanceof Timestamp)
            && contactData?.relationship?.nextActionType === targetData.nextActionType
            && contactActionAt instanceof Timestamp
            && opportunityActionAt instanceof Timestamp
            && Math.abs(contactActionAt.toMillis() - opportunityActionAt.toMillis()) <= 5 * 60 * 1_000;
          if (sameAction) {
            linkedContactRef = contactRef;
            linkedContactData = contactData ?? null;
          }
        }

        const now = Timestamp.now();
        if (opportunityId) {
          transaction.update(targetRef, {
            nextActionAt: parsed.data.status === "rescheduled" ? Timestamp.fromMillis(parsed.data.rescheduledAt!) : null,
            nextActionType: parsed.data.status === "rescheduled" ? parsed.data.rescheduledActionType : null,
            updatedAt: now,
          });
          if (linkedContactRef && linkedContactData) {
            transaction.update(linkedContactRef, {
              "relationship.nextActionAt": parsed.data.status === "rescheduled" ? Timestamp.fromMillis(parsed.data.rescheduledAt!) : null,
              "relationship.nextActionType": parsed.data.status === "rescheduled" ? parsed.data.rescheduledActionType : null,
              updatedAt: now,
            });
          }
        } else if (contactId && (contactPrefix === "next-action-" || parsed.data.status === "rescheduled")) {
          transaction.update(targetRef, {
            "relationship.nextActionAt": parsed.data.status === "rescheduled" ? Timestamp.fromMillis(parsed.data.rescheduledAt!) : null,
            "relationship.nextActionType": parsed.data.status === "rescheduled" ? parsed.data.rescheduledActionType : null,
            updatedAt: now,
          });
        }
        transaction.set(completionRef, {
          officeId: claims.officeId,
          ownerUid: claims.uid,
          taskId: parsed.data.taskId,
          dayKey: istanbulDayKey(),
          status: parsed.data.status,
          outcomeNote: parsed.data.outcomeNote,
          skippedReason: parsed.data.skippedReason,
          rescheduledAt: parsed.data.rescheduledAt === null ? null : Timestamp.fromMillis(parsed.data.rescheduledAt),
          rescheduledActionType: parsed.data.rescheduledActionType,
          completedAt: parsed.data.status === "completed" ? now : null,
          resolvedAt: now,
          createdAt: now,
          updatedAt: now,
        }, { merge: true });
        transaction.create(commandRef, {
          officeId: claims.officeId,
          ownerUid: claims.uid,
          type: "completeDailyTask",
          taskId: parsed.data.taskId,
          status: parsed.data.status,
          createdAt: now,
        });
      });
      return { taskId: parsed.data.taskId, status: parsed.data.status };
    });
  },
);
