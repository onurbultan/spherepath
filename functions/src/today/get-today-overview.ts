import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { buildTodayOverview, dailyTaskOutcomeSchema, istanbulDayKey, replaceDailyPlanItemSchema, replaceDailyPlanTask, selectDailyPlanTasks, todayOverviewQuerySchema, topUpDailyPlanTasks, type DailyTaskOutcome, type OpportunityStage, type ReplaceDailyPlanItemInput, type TodayOverview, type TodayTask } from "../../../packages/shared/src/index";
import { requireSpherepathClaims } from "../auth/claims.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
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
      contactsQuery.limit(1_000).get(),
      opportunitiesQuery.limit(1_000).get(),
      listingsQuery.limit(1_000).get(),
      dealsQuery.limit(1_000).get(),
      completionsQuery.limit(1_000).get(),
      interactionsQuery.limit(1_000).get(),
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
          estimatedValue: data.estimatedValue && typeof data.estimatedValue.amount === "number" && typeof data.estimatedValue.currency === "string"
            ? { amount: data.estimatedValue.amount as number, currency: data.estimatedValue.currency as string }
            : null,
          deletedAt: millis(data.deletedAt),
        };
      })
      .filter((opportunity) => opportunity.deletedAt === null);

    const listings = listingsSnapshot.docs.map((item) => ({ id: item.id, status: item.data().status, createdAt: millis(item.data().createdAt) ?? 0, askingPrice: (item.data().askingPrice ?? null) as number | null, ownerContactId: (item.data().ownerContactId ?? null) as string | null, deletedAt: millis(item.data().deletedAt) })).filter((item) => item.deletedAt === null);
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
    const now = Date.now();
    const dayKey = istanbulDayKey(now);
    const completions = completionsSnapshot.docs.filter((item) => { const data = item.data(); return data.dayKey === dayKey && ["completed", "skipped", "rescheduled", "contact_opt_out"].includes(data.status as string) && data.ownerUid === claims.uid; });
    const resolutionById = new Map(completions.map((item) => {
      const data = item.data();
      return [data.taskId as string, {
        status: data.status as "completed" | "skipped" | "rescheduled" | "contact_opt_out",
        note: typeof data.outcomeNote === "string" ? data.outcomeNote : typeof data.skippedReason === "string" ? data.skippedReason : null,
      }] as const;
    }));
    const optOutResolutionByContactId = new Map(completions.flatMap((item) => {
      const data = item.data();
      if (data.status !== "contact_opt_out") return [];
      const taskId = data.taskId as string;
      const legacyContactId = taskId.startsWith("next-action-")
        ? taskId.slice("next-action-".length)
        : taskId.startsWith("first-interaction-")
          ? taskId.slice("first-interaction-".length)
          : null;
      const resolvedContactId = typeof data.contactId === "string" ? data.contactId : legacyContactId;
      if (!resolvedContactId) return [];
      return [[resolvedContactId, {
        status: "contact_opt_out" as const,
        note: typeof data.skippedReason === "string" ? data.skippedReason : null,
      }] as const];
    }));
    const candidateOverview = buildTodayOverview(contacts, opportunities, now, listings, deals, new Set(), interactions, parsedQuery.data.period);
    const planRef = firestore.collection("dailyPlans").doc(`${claims.uid}-${dayKey}`.replace(/[^a-zA-Z0-9_-]/g, "_"));
    const planSnapshot = await planRef.get();
    const suppressedContactIds = planSnapshot.exists ? ((planSnapshot.data()!.suppressedContactIds ?? []) as string[]) : [];
    const visibleCandidates = candidateOverview.tasks.filter((task) => !suppressedContactIds.includes(task.contactId));
    const storedSnapshots = (planSnapshot.data()?.taskSnapshots ?? []) as TodayTask[];
    const storedTaskIds = planSnapshot.exists ? ((planSnapshot.data()!.taskIds ?? []) as string[]) : [];
    // The day's list is pinned so it does not reshuffle while it is being worked,
    // but a pinned task whose condition has since gone stops being work: "record a
    // first interaction" survives the interaction that answers it, and the list
    // then argues with the contact record. A task the advisor resolved themselves
    // stays, so the tick they gave it does not disappear.
    const candidateIds = new Set(visibleCandidates.map((task) => task.id));
    const liveStoredTaskIds = storedTaskIds.filter((taskId) => candidateIds.has(taskId) || resolutionById.has(taskId));
    const taskIds = planSnapshot.exists
      ? topUpDailyPlanTasks([...storedSnapshots, ...visibleCandidates], liveStoredTaskIds)
      : selectDailyPlanTasks(visibleCandidates).map((task) => task.id);
    const snapshotById = new Map([...storedSnapshots, ...visibleCandidates].map((task) => [task.id, task]));
    const selectedSnapshots = taskIds.flatMap((taskId) => { const task = snapshotById.get(taskId); return task ? [task] : []; });
    if (!planSnapshot.exists) {
      await planRef.set({ officeId: claims.officeId, ownerUid: claims.uid, dayKey, taskIds, taskSnapshots: selectedSnapshots, suppressedContactIds: [], createdAt: Timestamp.fromMillis(now), updatedAt: Timestamp.fromMillis(now) });
    } else if (taskIds.join("|") !== storedTaskIds.join("|")) {
      await planRef.update({ taskIds, taskSnapshots: selectedSnapshots, updatedAt: Timestamp.fromMillis(now) });
    }
    const tasksById = new Map(selectedSnapshots.map((task) => [task.id, task]));
    const plannedTasks = taskIds.flatMap((taskId) => {
      const task = tasksById.get(taskId);
      const resolution = resolutionById.get(taskId) ?? (task ? optOutResolutionByContactId.get(task.contactId) : undefined);
      return task ? [{ ...task, resolutionStatus: resolution?.status ?? null, resolutionNote: resolution?.note ?? null }] : [];
    });
    const allTasks = visibleCandidates.map((task) => {
      const resolution = resolutionById.get(task.id) ?? optOutResolutionByContactId.get(task.contactId);
      return { ...task, resolutionStatus: resolution?.status ?? null, resolutionNote: resolution?.note ?? null };
    });
    return { overview: { ...candidateOverview, tasks: plannedTasks, allTasks, completedTaskCount: plannedTasks.filter((task) => task.resolutionStatus).length } };
    });
  },
);

export const completeDailyTask = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 60 },
  async (request): Promise<{ taskId: string; status: "completed" | "skipped" | "rescheduled" | "contact_opt_out" }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<DailyTaskOutcome>(request.data, { command: true });
    const parsed = dailyTaskOutcomeSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Daily task outcome is invalid.", parsed.error.flatten());
    if (!/^(next-action|first-interaction|opportunity-action)-/.test(parsed.data.taskId)) throw new HttpsError("invalid-argument", "Daily task identifier is invalid.");
    return observeApiRequest("completeDailyTask", envelope.requestId, async () => {
      const db = getFirestore();
      const commandRef = db.collection("commands").doc(envelope.commandId!);
      const completionRef = db.collection("dailyTaskCompletions").doc(`${claims.uid}-${istanbulDayKey(Date.now())}-${parsed.data.taskId}`.replace(/[^a-zA-Z0-9_-]/g, "_"));
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

        let resolvedContactRef: FirebaseFirestore.DocumentReference | null = contactId ? targetRef : null;
        let resolvedContactData: FirebaseFirestore.DocumentData | null = contactId ? targetData : null;
        let linkedContactAction = false;
        if (opportunityId && typeof targetData.subjectContactId === "string") {
          const contactRef = db.collection("contacts").doc(targetData.subjectContactId);
          const contactSnapshot = await transaction.get(contactRef);
          const contactData = contactSnapshot.data();
          const manageableContact = contactSnapshot.exists
            && contactData?.officeId === claims.officeId
            && (contactData?.ownerUid === claims.uid || claims.role === "broker")
            && !(contactData?.deletedAt instanceof Timestamp);
          if (manageableContact) {
            resolvedContactRef = contactRef;
            resolvedContactData = contactData ?? null;
          }
          const contactActionAt = contactData?.relationship?.nextActionAt;
          const opportunityActionAt = targetData.nextActionAt;
          linkedContactAction = manageableContact
            && contactData?.relationship?.nextActionType === targetData.nextActionType
            && contactActionAt instanceof Timestamp
            && opportunityActionAt instanceof Timestamp
            && Math.abs(contactActionAt.toMillis() - opportunityActionAt.toMillis()) <= 5 * 60 * 1_000;
        }

        if (parsed.data.status === "contact_opt_out" && (!resolvedContactRef || !resolvedContactData)) {
          throw new HttpsError("failed-precondition", "The task is not linked to a manageable contact.");
        }
        const relatedOpportunities = parsed.data.status === "contact_opt_out" && resolvedContactRef
          ? await transaction.get(db.collection("opportunities").where("subjectContactId", "==", resolvedContactRef.id).limit(100))
          : null;

        const now = Timestamp.now();
        if (opportunityId) {
          transaction.update(targetRef, {
            nextActionAt: parsed.data.status === "rescheduled" ? Timestamp.fromMillis(parsed.data.rescheduledAt!) : null,
            nextActionType: parsed.data.status === "rescheduled" ? parsed.data.rescheduledActionType : null,
            updatedAt: now,
          });
          if (linkedContactAction && resolvedContactRef && parsed.data.status !== "contact_opt_out") {
            transaction.update(resolvedContactRef, {
              "relationship.nextActionAt": parsed.data.status === "rescheduled" ? Timestamp.fromMillis(parsed.data.rescheduledAt!) : null,
              "relationship.nextActionType": parsed.data.status === "rescheduled" ? parsed.data.rescheduledActionType : null,
              updatedAt: now,
            });
          }
        } else if (contactId && (contactPrefix === "next-action-" || parsed.data.status === "rescheduled") && parsed.data.status !== "contact_opt_out") {
          transaction.update(targetRef, {
            "relationship.nextActionAt": parsed.data.status === "rescheduled" ? Timestamp.fromMillis(parsed.data.rescheduledAt!) : null,
            "relationship.nextActionType": parsed.data.status === "rescheduled" ? parsed.data.rescheduledActionType : null,
            updatedAt: now,
          });
        }
        if (parsed.data.status === "contact_opt_out" && resolvedContactRef) {
          transaction.update(resolvedContactRef, {
            "relationship.nextActionAt": null,
            "relationship.nextActionType": null,
            "privacy.marketingConsent": "withdrawn",
            "privacy.marketingWithdrawnAt": now,
            "privacy.marketingChannels": [],
            "privacy.iysStatus": "rejected",
            "privacy.iysCheckedAt": now,
            updatedAt: now,
          });
          for (const snapshot of relatedOpportunities?.docs ?? []) {
            const opportunity = snapshot.data();
            if (opportunity.officeId === claims.officeId
              && (opportunity.ownerUid === claims.uid || claims.role === "broker")
              && !(opportunity.deletedAt instanceof Timestamp)) {
              transaction.update(snapshot.ref, { nextActionAt: null, nextActionType: null, updatedAt: now });
            }
          }
        }
        transaction.set(completionRef, {
          officeId: claims.officeId,
          ownerUid: claims.uid,
          contactId: resolvedContactRef?.id ?? null,
          taskId: parsed.data.taskId,
          dayKey: istanbulDayKey(Date.now()),
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

async function loadTaskCandidates(claims: ReturnType<typeof requireSpherepathClaims>): Promise<TodayTask[]> {
  const db = getFirestore();
  let contactsQuery: FirebaseFirestore.Query = db.collection("contacts").where("officeId", "==", claims.officeId);
  let opportunitiesQuery: FirebaseFirestore.Query = db.collection("opportunities").where("officeId", "==", claims.officeId);
  if (claims.role !== "broker") {
    contactsQuery = contactsQuery.where("ownerUid", "==", claims.uid);
    opportunitiesQuery = opportunitiesQuery.where("ownerUid", "==", claims.uid);
  }
  const [contactSnapshot, opportunitySnapshot] = await Promise.all([contactsQuery.limit(1_000).get(), opportunitiesQuery.limit(1_000).get()]);
  const contacts = contactSnapshot.docs.map((item) => {
    const data = item.data();
    return { id: item.id, name: (data.fullName ?? data.label ?? "İsimsiz kişi") as string, createdAt: millis(data.createdAt) ?? 0, meaningfulTouchCount: Number(data.relationship?.meaningfulTouchCount ?? 0), lastTouchAt: millis(data.relationship?.lastTouchAt), nextActionAt: millis(data.relationship?.nextActionAt), nextActionType: data.relationship?.nextActionType ?? null, deletedAt: millis(data.deletedAt) };
  }).filter((item) => item.deletedAt === null);
  const names = new Map(contacts.map((item) => [item.id, item.name]));
  const opportunities = opportunitySnapshot.docs.map((item) => {
    const data = item.data();
    return { id: item.id, subjectContactId: data.subjectContactId as string, subjectContactName: names.get(data.subjectContactId as string) ?? "İsimsiz kişi", stage: data.stage as OpportunityStage, nextActionAt: millis(data.nextActionAt), nextActionType: data.nextActionType ?? null, createdAt: millis(data.createdAt) ?? 0, deletedAt: millis(data.deletedAt) };
  }).filter((item) => item.deletedAt === null);
  return buildTodayOverview(contacts, opportunities, Date.now()).tasks;
}

export const replaceDailyPlanItem = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 60 },
  async (request): Promise<{ taskIds: string[] }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<ReplaceDailyPlanItemInput>(request.data, { command: true });
    const parsed = replaceDailyPlanItemSchema.safeParse(envelope.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Daily plan replacement is invalid.");
    return observeApiRequest("replaceDailyPlanItem", envelope.requestId, async () => {
      const db = getFirestore();
      const dayKey = istanbulDayKey(Date.now());
      const planRef = db.collection("dailyPlans").doc(`${claims.uid}-${dayKey}`.replace(/[^a-zA-Z0-9_-]/g, "_"));
      const commandRef = db.collection("commands").doc(envelope.commandId!);
      const candidates = await loadTaskCandidates(claims);
      let result: string[] = [];
      await db.runTransaction(async (transaction) => {
        const [plan, receipt] = await Promise.all([transaction.get(planRef), transaction.get(commandRef)]);
        if (!plan.exists) throw new HttpsError("failed-precondition", "Daily plan has not been generated yet.");
        if (receipt.exists) { result = (receipt.data()!.taskIds ?? []) as string[]; return; }
        if (plan.data()!.officeId !== claims.officeId || plan.data()!.ownerUid !== claims.uid) throw new HttpsError("permission-denied", "Daily plan is outside your workspace.");
        const previousSnapshots = (plan.data()!.taskSnapshots ?? []) as TodayTask[];
        const removedTask = [...previousSnapshots, ...candidates].find((task) => task.id === parsed.data.taskId);
        if (!removedTask) throw new HttpsError("not-found", "Bugünkü iş bulunamadı.");
        const suppressedContactIds = [...new Set([...(plan.data()!.suppressedContactIds ?? []) as string[], removedTask.contactId])];
        const replacementCandidates = candidates.filter((task) => !suppressedContactIds.includes(task.contactId));
        result = replaceDailyPlanTask(replacementCandidates, plan.data()!.taskIds as string[], parsed.data.taskId);
        if (result.join("|") === (plan.data()!.taskIds as string[]).join("|")) throw new HttpsError("failed-precondition", "Bu görevin yerine geçecek başka uygun iş yok.");
        const taskMap = new Map([...previousSnapshots, ...candidates].map((task) => [task.id, task]));
        const taskSnapshots = result.flatMap((id) => { const task = taskMap.get(id); return task ? [task] : []; });
        const now = Timestamp.now();
        transaction.update(planRef, { taskIds: result, taskSnapshots, suppressedContactIds, updatedAt: now });
        transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "replaceDailyPlanItem", taskIds: result, suppressedContactIds, createdAt: now });
      });
      return { taskIds: result };
    });
  },
);
