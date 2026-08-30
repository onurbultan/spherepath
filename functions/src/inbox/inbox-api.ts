import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  analyzeInboxItemSchema,
  classifyInboxText,
  contactMemorySchema,
  createContact as createContactEntity,
  createOpportunity as createOpportunityEntity,
  createPortfolioItem,
  createInboxItemSchema,
  emptyVoiceInsights,
  inboxItemIdSchema,
  inboxItemKinds,
  inboxPageQuerySchema,
  opportunityTypeLabels,
  mergeVoiceInsightsIntoContactMemory,
  processInboxItemSchema,
  updateInboxItemSchema,
  type InboxAppliedAction,
  type InboxItem,
  type InboxItemRecord,
  type InboxItemAnalysis,
} from "../../../packages/shared/src/index.js";
import { requireSpherepathClaims, type SpherepathClaims } from "../auth/claims.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { normalizeVoiceExtraction } from "../voice/normalization.js";
import { extractVoiceDraft, sanitizeVoiceExtraction } from "../voice/privacy.js";
import { normalizeVoiceActionTiming } from "../voice/temporal.js";
import { extractVoiceDraftWithVertex } from "../voice/vertex-extraction.js";

const callableOptions = { region: "europe-west8" as const, cors: true, maxInstances: 10, memory: "256MiB" as const, timeoutSeconds: 60 };
const millis = (value: unknown): number | null => value instanceof Timestamp ? value.toMillis() : null;
const timestamp = (value: number | null): Timestamp | null => value === null ? null : Timestamp.fromMillis(value);

function actionAtFrom(daysFromNow: number | null, actionTime: string | null, now: Date): number | null {
  if (daysFromNow === null) return null;
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(local.find((item) => item.type === type)?.value ?? 0);
  const [hour, minute] = (actionTime ?? "10:00").split(":").map(Number);
  // Türkiye uses UTC+3 year-round. Date.UTC also safely carries day overflow.
  return Date.UTC(part("year"), part("month") - 1, part("day") + daysFromNow, (hour ?? 10) - 3, minute ?? 0);
}

async function analyzeText(text: string): Promise<InboxItemAnalysis> {
  const now = new Date();
  let extraction = extractVoiceDraft(text);
  if (process.env.FUNCTIONS_EMULATOR !== "true") {
    try { extraction = sanitizeVoiceExtraction(await extractVoiceDraftWithVertex(text, now)); } catch { /* Rules remain a safe fallback. */ }
  }
  extraction = normalizeVoiceExtraction(extraction, text);
  extraction = normalizeVoiceActionTiming(extraction, text, now);
  const transaction = extraction.insights.propertyPreferences.transactionType;
  return {
    insights: extraction.insights,
    nextActionType: extraction.interaction.nextActionType,
    nextActionAt: actionAtFrom(extraction.interaction.daysFromNow, extraction.interaction.actionTime, now),
    opportunityType: transaction === "rent" ? "tenant_requirement" : "buyer_requirement",
    engine: extraction.provenance.engine,
  };
}

function canManage(data: DocumentData, claims: SpherepathClaims): boolean {
  return data.officeId === claims.officeId && (data.ownerUid === claims.uid || claims.role === "broker" || data.source === "whatsapp");
}

function toRecord(id: string, data: DocumentData): InboxItemRecord {
  return {
    ...(data as InboxItem), id,
    createdAt: millis(data.createdAt) ?? 0,
    updatedAt: millis(data.updatedAt) ?? 0,
    archivedAt: millis(data.archivedAt),
    appliedActions: ((data.appliedActions ?? []) as DocumentData[]).map((action) => ({
      ...action,
      appliedAt: millis(action.appliedAt) ?? 0,
      undoneAt: millis(action.undoneAt),
    })) as InboxAppliedAction[],
  };
}

function storedContact(contact: ReturnType<typeof createContactEntity>) {
  return {
    ...contact,
    metAt: Timestamp.fromMillis(contact.metAt), createdAt: Timestamp.fromMillis(contact.createdAt), updatedAt: Timestamp.fromMillis(contact.updatedAt), deletedAt: null,
    relationship: { ...contact.relationship, lastTouchAt: timestamp(contact.relationship.lastTouchAt), nextActionAt: timestamp(contact.relationship.nextActionAt) },
    memory: { ...contact.memory, updatedAt: timestamp(contact.memory.updatedAt) },
    privacy: {
      ...contact.privacy,
      purposes: Object.fromEntries(Object.entries(contact.privacy.purposes).map(([key, purpose]) => [key, { ...purpose, startedAt: Timestamp.fromMillis(purpose.startedAt) }])),
      noticeAt: null, marketingConsentAt: null, marketingWithdrawnAt: null, iysCheckedAt: null, deletionRequestedAt: null,
    },
  };
}

async function backfillHistoricalInboxItems(claims: SpherepathClaims): Promise<void> {
  const db = getFirestore();
  const scoped = (collection: string) => {
    let query: FirebaseFirestore.Query = db.collection(collection).where("officeId", "==", claims.officeId);
    if (claims.role !== "broker") query = query.where("ownerUid", "==", claims.uid);
    return query;
  };
  const [interactions, portfolioItems] = await Promise.all([scoped("interactions").limit(50).get(), scoped("portfolioItems").limit(50).get()]);
  if (interactions.empty && portfolioItems.empty) return;
  const batch = db.batch();
  for (const document of interactions.docs) {
    const data = document.data(); const raw = typeof data.noteSummary === "string" && data.noteSummary.trim() ? data.noteSummary : typeof data.outcome === "string" ? data.outcome : "";
    if (!raw.trim()) continue;
    const classification = classifyInboxText(raw); const occurredAt = data.occurredAt instanceof Timestamp ? data.occurredAt : data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now();
    batch.set(db.collection("inboxItems").doc(`interaction-${document.id}`), {
      officeId: data.officeId, ownerUid: data.ownerUid, source: data.voiceNoteId ? "voice" : "typed", safeText: classification.safeText, summary: classification.summary, kind: classification.kind,
      status: "applied", confidence: classification.confidence, linkedContactId: data.contactId ?? null, sourceEntityId: document.id,
      appliedActions: [{ type: "classification", entityId: null, label: "Geçmiş kayıt sınıflandırıldı", appliedAt: occurredAt, undoneAt: null }], pinned: false, needsLocation: classification.needsLocation, errorCode: null, archivedAt: null, createdAt: occurredAt, updatedAt: occurredAt,
    }, { merge: false });
  }
  for (const document of portfolioItems.docs) {
    const data = document.data(); const raw = typeof data.summary === "string" ? data.summary : typeof data.headline === "string" ? data.headline : "";
    if (!raw.trim()) continue;
    const classification = classifyInboxText(raw, "property"); const createdAt = data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now();
    batch.set(db.collection("inboxItems").doc(`portfolio-${document.id}`), {
      officeId: data.officeId, ownerUid: data.ownerUid, source: "whatsapp", safeText: classification.safeText, summary: classification.summary, kind: "property",
      status: "applied", confidence: classification.confidence, linkedContactId: null, sourceEntityId: document.id,
      appliedActions: [{ type: "classification", entityId: document.id, label: "Ofis havuzu kaydı Akış'a eklendi", appliedAt: createdAt, undoneAt: null }], pinned: false, needsLocation: classification.needsLocation, errorCode: null, archivedAt: null, createdAt, updatedAt: createdAt,
    }, { merge: false });
  }
  await batch.commit();
}

export const createInboxItem = onCall(callableOptions, async (request): Promise<{ item: InboxItemRecord }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = createInboxItemSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Inbox item input is invalid.", parsed.error.flatten());
  return observeApiRequest("createInboxItem", envelope.requestId, async () => {
    const db = getFirestore();
    const commandRef = db.collection("commands").doc(envelope.commandId!);
    const itemRef = db.collection("inboxItems").doc();
    const classification = classifyInboxText(parsed.data.text, parsed.data.requestedKind);
    if (!classification.safeText) throw new HttpsError("invalid-argument", "Safe note content is empty.");
    const now = Date.now();
    const nowStamp = Timestamp.fromMillis(now);
    const contactRef = classification.explicitContact && parsed.data.source !== "voice" && !classification.sensitiveContentMasked && classification.confidence >= 0.92
      ? db.collection("contacts").doc()
      : null;

    const itemId = await db.runTransaction(async (transaction) => {
      const receipt = await transaction.get(commandRef);
      if (receipt.exists) {
        const data = receipt.data()!;
        if (!canManage(data, claims) || data.type !== "createInboxItem" || typeof data.inboxItemId !== "string") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return data.inboxItemId as string;
      }
      if (parsed.data.linkedContactId) {
        const linked = await transaction.get(db.collection("contacts").doc(parsed.data.linkedContactId));
        if (!linked.exists || !canManage(linked.data()!, claims) || linked.data()!.deletedAt !== null) throw new HttpsError("not-found", "Linked contact was not found.");
      }
      const actions: InboxAppliedAction[] = [{ type: "classification", entityId: null, label: "Not sınıflandırıldı", appliedAt: now, undoneAt: null }];
      if (contactRef && classification.explicitContact) {
        const contact = createContactEntity({ fullName: classification.explicitContact.fullName, phone: classification.explicitContact.phone, metAtPlace: "Akış notu", source: "other", role: "unknown" }, { officeId: claims.officeId, ownerUid: claims.uid }, now);
        transaction.create(contactRef, storedContact(contact));
        actions.push({ type: "contact_created", entityId: contactRef.id, label: `${classification.explicitContact.fullName} kişi olarak eklendi`, appliedAt: now, undoneAt: null });
      }
      const item: InboxItem = {
        officeId: claims.officeId, ownerUid: claims.uid, source: parsed.data.source,
        safeText: classification.safeText, summary: classification.summary, kind: classification.kind,
        status: parsed.data.source === "voice" || classification.sensitiveContentMasked ? "needs_review" : "applied",
        confidence: classification.confidence, linkedContactId: parsed.data.linkedContactId ?? contactRef?.id ?? null,
        sourceEntityId: null, appliedActions: actions, pinned: false, needsLocation: classification.needsLocation,
        errorCode: null, archivedAt: null, createdAt: now, updatedAt: now,
      };
      transaction.create(itemRef, { ...item, createdAt: nowStamp, updatedAt: nowStamp, archivedAt: null, appliedActions: actions.map((action) => ({ ...action, appliedAt: nowStamp, undoneAt: null })) });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "createInboxItem", inboxItemId: itemRef.id, createdAt: nowStamp });
      return itemRef.id;
    });
    const snapshot = await db.collection("inboxItems").doc(itemId).get();
    return { item: toRecord(snapshot.id, snapshot.data()!) };
  });
});

export const listInboxItems = onCall(callableOptions, async (request): Promise<{ items: InboxItemRecord[]; nextCursor: string | null }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data);
  const parsed = inboxPageQuerySchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Inbox query is invalid.", parsed.error.flatten());
  return observeApiRequest("listInboxItems", envelope.requestId, async () => {
    const query: FirebaseFirestore.Query = getFirestore().collection("inboxItems").where("officeId", "==", claims.officeId);
    let snapshot = await query.limit(1_000).get();
    if (snapshot.empty && parsed.data.cursor === null) {
      await backfillHistoricalInboxItems(claims);
      snapshot = await query.limit(1_000).get();
    }
    const ordered = snapshot.docs.filter((doc) => canManage(doc.data(), claims)).map((doc) => toRecord(doc.id, doc.data())).sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.createdAt - left.createdAt);
    const start = parsed.data.cursor ? Math.max(0, ordered.findIndex((item) => item.id === parsed.data.cursor) + 1) : 0;
    const page = ordered.slice(start, start + parsed.data.limit);
    return { items: page, nextCursor: start + parsed.data.limit < ordered.length ? page.at(-1)?.id ?? null : null };
  });
});

export const updateInboxItem = onCall(callableOptions, async (request): Promise<{ item: InboxItemRecord }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = updateInboxItemSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Inbox update is invalid.", parsed.error.flatten());
  return observeApiRequest("updateInboxItem", envelope.requestId, async () => {
    const db = getFirestore(); const ref = db.collection("inboxItems").doc(parsed.data.inboxItemId); const commandRef = db.collection("commands").doc(envelope.commandId!);
    await db.runTransaction(async (transaction) => {
      const [snapshot, receipt] = await Promise.all([transaction.get(ref), transaction.get(commandRef)]);
      if (receipt.exists) return;
      if (!snapshot.exists || !canManage(snapshot.data()!, claims)) throw new HttpsError("not-found", "Inbox item was not found.");
      if (parsed.data.linkedContactId) {
        const contact = await transaction.get(db.collection("contacts").doc(parsed.data.linkedContactId));
        if (!contact.exists || !canManage(contact.data()!, claims) || contact.data()!.deletedAt !== null) throw new HttpsError("not-found", "Linked contact was not found.");
      }
      const now = Timestamp.now();
      const edited = parsed.data.text === undefined && parsed.data.kind === undefined
        ? null
        : classifyInboxText(parsed.data.text ?? snapshot.data()!.safeText as string, (parsed.data.kind ?? snapshot.data()!.kind) as typeof inboxItemKinds[number]);
      // Adding the location rewrites the note and reclassifies it, so the card's own
      // "Nerede? Konumu ekleyince eşleştirebilirim." prompt actually leads somewhere.
      const located = parsed.data.location === undefined
        ? null
        : classifyInboxText(`${snapshot.data()!.safeText as string} Konum: ${parsed.data.location}.`, (parsed.data.kind ?? snapshot.data()!.kind) as typeof inboxItemKinds[number]);
      const locationAction: InboxAppliedAction | null = located
        ? { type: "location_added", entityId: null, label: `Konum eklendi: ${parsed.data.location}`, appliedAt: now.toMillis(), undoneAt: null }
        : null;
      transaction.update(ref, {
        ...(edited === null ? {} : {
          safeText: edited.safeText,
          summary: edited.summary,
          kind: edited.kind,
          confidence: edited.confidence,
          needsLocation: edited.needsLocation,
          status: edited.sensitiveContentMasked ? "needs_review" : snapshot.data()!.status === "archived" ? "archived" : "applied",
          errorCode: null,
        }),
        ...(parsed.data.linkedContactId === undefined ? {} : { linkedContactId: parsed.data.linkedContactId }),
        ...(parsed.data.pinned === undefined ? {} : { pinned: parsed.data.pinned }),
        ...(parsed.data.archived === undefined ? {} : { status: parsed.data.archived ? "archived" : "applied", archivedAt: parsed.data.archived ? now : null }),
        ...(located === null ? {} : {
          safeText: located.safeText, summary: located.summary, confidence: located.confidence,
          needsLocation: located.needsLocation, errorCode: null,
          appliedActions: [...((snapshot.data()!.appliedActions ?? []) as DocumentData[]), { ...locationAction!, appliedAt: now }],
        }),
        updatedAt: now,
      });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "updateInboxItem", inboxItemId: ref.id, createdAt: now });
    });
    const result = await ref.get(); return { item: toRecord(result.id, result.data()!) };
  });
});

export const analyzeInboxItem = onCall(callableOptions, async (request): Promise<{ analysis: InboxItemAnalysis }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data);
  const parsed = analyzeInboxItemSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Inbox analysis input is invalid.", parsed.error.flatten());
  return observeApiRequest("analyzeInboxItem", envelope.requestId, async () => {
    const snapshot = await getFirestore().collection("inboxItems").doc(parsed.data.inboxItemId).get();
    if (!snapshot.exists || !canManage(snapshot.data()!, claims)) throw new HttpsError("not-found", "Inbox item was not found.");
    return { analysis: await analyzeText(snapshot.data()!.safeText as string) };
  });
});

export const processInboxItem = onCall(callableOptions, async (request): Promise<{ item: InboxItemRecord; entityId: string }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = processInboxItemSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Inbox processing input is invalid.", parsed.error.flatten());
  return observeApiRequest("processInboxItem", envelope.requestId, async () => {
    const db = getFirestore();
    const itemRef = db.collection("inboxItems").doc(parsed.data.inboxItemId);
    const commandRef = db.collection("commands").doc(envelope.commandId!);
    const entityRef = parsed.data.action === "person"
      ? db.collection("contacts").doc()
      : parsed.data.action === "requirement"
        ? db.collection("opportunities").doc()
        : parsed.data.action === "portfolio"
          ? db.collection("portfolioItems").doc()
          : db.collection("contacts").doc(parsed.data.contactId);
    const stageEventRef = parsed.data.action === "requirement" ? db.collection("stageEvents").doc() : null;
    let entityId = entityRef.id;
    await db.runTransaction(async (transaction) => {
      const [itemSnapshot, receipt] = await Promise.all([transaction.get(itemRef), transaction.get(commandRef)]);
      if (receipt.exists) {
        if (!canManage(receipt.data()!, claims) || receipt.data()!.type !== "processInboxItem") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        entityId = receipt.data()!.entityId as string;
        return;
      }
      if (!itemSnapshot.exists || !canManage(itemSnapshot.data()!, claims)) throw new HttpsError("not-found", "Inbox item was not found.");
      if (itemSnapshot.data()!.status === "archived") throw new HttpsError("failed-precondition", "Arşivlenmiş notu önce geri getir.");
      const actionType = parsed.data.action === "person" ? "contact_created" : parsed.data.action === "requirement" ? "opportunity_created" : parsed.data.action === "portfolio" ? "portfolio_created" : "follow_up_scheduled";
      const actions = (itemSnapshot.data()!.appliedActions ?? []) as DocumentData[];
      if (actions.some((action) => action.type === actionType && action.undoneAt === null)) throw new HttpsError("already-exists", "Bu not daha önce işlendi.");
      const contactId = parsed.data.action === "person" ? null : parsed.data.contactId;
      const contactSnapshot = contactId ? await transaction.get(db.collection("contacts").doc(contactId)) : null;
      if (contactSnapshot && (!contactSnapshot.exists || !canManage(contactSnapshot.data()!, claims) || contactSnapshot.data()!.deletedAt !== null)) throw new HttpsError("not-found", "Contact was not found.");
      const now = Date.now(); const nowStamp = Timestamp.fromMillis(now);
      let label: string;
      let linkedContactId = itemSnapshot.data()!.linkedContactId ?? null;
      if (parsed.data.action === "person") {
        const contact = createContactEntity(parsed.data.contact, { officeId: claims.officeId, ownerUid: claims.uid }, now);
        transaction.create(entityRef, storedContact(contact));
        linkedContactId = entityRef.id;
        label = `${parsed.data.contact.fullName} kişi olarak oluşturuldu`;
      } else if (parsed.data.action === "requirement") {
        const opportunity = createOpportunityEntity({ subjectContactId: parsed.data.contactId, type: parsed.data.opportunityType, nextActionType: parsed.data.nextActionType, nextActionAt: parsed.data.nextActionAt }, { officeId: claims.officeId, ownerUid: claims.uid }, now);
        transaction.create(entityRef, { ...opportunity, qualifiedAt: nowStamp, stageEnteredAt: nowStamp, nextActionAt: Timestamp.fromMillis(parsed.data.nextActionAt), closedAt: null, deletedAt: null, createdAt: nowStamp, updatedAt: nowStamp });
        transaction.create(stageEventRef!, { officeId: claims.officeId, ownerUid: claims.uid, entityType: "opportunity", entityId: entityRef.id, fromStage: null, toStage: "new_lead", reason: "Akış notundan oluşturuldu", commandId: envelope.commandId, occurredAt: nowStamp, createdAt: nowStamp });
        const currentMemory = contactMemorySchema.parse({
          ...(contactSnapshot!.data()!.memory ?? {}),
          updatedAt: millis(contactSnapshot!.data()!.memory?.updatedAt),
        });
        const nextMemory = mergeVoiceInsightsIntoContactMemory(currentMemory, parsed.data.approvedInsights ?? emptyVoiceInsights, now);
        transaction.update(contactSnapshot!.ref, {
          memory: { ...nextMemory, updatedAt: timestamp(nextMemory.updatedAt) },
          updatedAt: nowStamp,
        });
        linkedContactId = parsed.data.contactId;
        label = `${opportunityTypeLabels[parsed.data.opportunityType]} oluşturuldu`;
      } else if (parsed.data.action === "portfolio") {
        const portfolio = createPortfolioItem(parsed.data.portfolio, { officeId: claims.officeId, ownerUid: claims.uid }, now);
        transaction.create(entityRef, { ...portfolio, createdAt: nowStamp, updatedAt: nowStamp });
        linkedContactId = parsed.data.contactId ?? linkedContactId;
        label = "Ofis havuzuna portföy eklendi";
      } else {
        const relationship = contactSnapshot!.data()!.relationship as DocumentData;
        transaction.update(entityRef, { relationship: { ...relationship, nextActionType: parsed.data.nextActionType, nextActionAt: Timestamp.fromMillis(parsed.data.nextActionAt) }, updatedAt: nowStamp });
        linkedContactId = parsed.data.contactId;
        label = "Takip planlandı";
      }
      transaction.update(itemRef, {
        linkedContactId,
        status: "applied",
        appliedActions: [...actions, { type: actionType, entityId: entityRef.id, label, appliedAt: nowStamp, undoneAt: null }],
        updatedAt: nowStamp,
      });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "processInboxItem", inboxItemId: itemRef.id, action: parsed.data.action, entityId: entityRef.id, createdAt: nowStamp });
    });
    const result = await itemRef.get();
    return { item: toRecord(result.id, result.data()!), entityId };
  });
});

export const retryInboxItem = onCall(callableOptions, async (request): Promise<{ item: InboxItemRecord }> => {
  const claims = requireSpherepathClaims(request); const envelope = readApiEnvelope<unknown>(request.data, { command: true }); const parsed = inboxItemIdSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Inbox item identifier is invalid.");
  const db = getFirestore(); const ref = db.collection("inboxItems").doc(parsed.data.inboxItemId); const commandRef = db.collection("commands").doc(envelope.commandId!);
  return observeApiRequest("retryInboxItem", envelope.requestId, async () => {
    await db.runTransaction(async (transaction) => {
      const [snapshot, receipt] = await Promise.all([transaction.get(ref), transaction.get(commandRef)]); if (receipt.exists) return;
      if (!snapshot.exists || !canManage(snapshot.data()!, claims)) throw new HttpsError("not-found", "Inbox item was not found.");
      const next = classifyInboxText(snapshot.data()!.safeText as string, snapshot.data()!.kind);
      const now = Timestamp.now(); transaction.update(ref, { summary: next.summary, confidence: next.confidence, needsLocation: next.needsLocation, status: next.sensitiveContentMasked ? "needs_review" : "applied", errorCode: null, updatedAt: now });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "retryInboxItem", inboxItemId: ref.id, createdAt: now });
    });
    const result = await ref.get(); return { item: toRecord(result.id, result.data()!) };
  });
});

export const undoInboxApplication = onCall(callableOptions, async (request): Promise<{ item: InboxItemRecord }> => {
  const claims = requireSpherepathClaims(request); const envelope = readApiEnvelope<unknown>(request.data, { command: true }); const parsed = inboxItemIdSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Inbox item identifier is invalid.");
  const db = getFirestore(); const ref = db.collection("inboxItems").doc(parsed.data.inboxItemId); const commandRef = db.collection("commands").doc(envelope.commandId!);
  return observeApiRequest("undoInboxApplication", envelope.requestId, async () => {
    await db.runTransaction(async (transaction) => {
      const [snapshot, receipt] = await Promise.all([transaction.get(ref), transaction.get(commandRef)]); if (receipt.exists) return;
      if (!snapshot.exists || !canManage(snapshot.data()!, claims)) throw new HttpsError("not-found", "Inbox item was not found.");
      const data = snapshot.data()!; const actions = (data.appliedActions ?? []) as DocumentData[]; const contactAction = actions.find((action) => action.type === "contact_created" && action.undoneAt === null);
      const now = Timestamp.now();
      if (contactAction?.entityId) {
        const contactRef = db.collection("contacts").doc(contactAction.entityId as string); const contact = await transaction.get(contactRef);
        if (contact.exists) {
          if (!canManage(contact.data()!, claims)) throw new HttpsError("permission-denied", "Created contact is outside your workspace.");
          const updatedAt = millis(contact.data()!.updatedAt) ?? 0; const appliedAt = millis(contactAction.appliedAt) ?? 0;
          if (updatedAt > appliedAt + 1_000) throw new HttpsError("failed-precondition", "Kişi daha sonra düzenlendi; otomatik geri alma yapılamadı.");
          transaction.update(contactRef, { deletedAt: now, updatedAt: now });
        }
      }
      transaction.update(ref, { status: "needs_review", appliedActions: actions.map((action) => action.undoneAt === null ? { ...action, undoneAt: now } : action), updatedAt: now });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "undoInboxApplication", inboxItemId: ref.id, createdAt: now });
    });
    const result = await ref.get(); return { item: toRecord(result.id, result.data()!) };
  });
});
