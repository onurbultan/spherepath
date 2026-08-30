import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  contactMemorySchema,
  createPortfolioItem,
  matchNotificationCommandSchema,
  portfolioItemDraftSchema,
  portfolioItemCommandSchema,
  portfolioTextInputSchema,
  scorePortfolioItem,
  type PortfolioItem,
  type PortfolioItemDraft,
  type PortfolioItemRecord,
  type PortfolioMatchNotificationRecord,
  type PortfolioMatchRecord,
} from "../../../packages/shared/src/index.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims, type SpherepathClaims } from "../auth/claims.js";
import { extractPortfolioDraftWithVertex } from "./vertex-portfolio-extraction.js";

const callableOptions = { region: "europe-west8" as const, cors: true, maxInstances: 10, memory: "256MiB" as const, timeoutSeconds: 60 };
const millis = (value: unknown): number => value instanceof Timestamp ? value.toMillis() : 0;

function toRecord(id: string, data: DocumentData, sharedByName: string): PortfolioItemRecord {
  return { ...(data as PortfolioItem), id, sharedByName, createdAt: millis(data.createdAt), updatedAt: millis(data.updatedAt) };
}

async function displayNamesFor(ownerUids: string[]): Promise<Map<string, string>> {
  const firestore = getFirestore();
  const unique = [...new Set(ownerUids)];
  if (!unique.length) return new Map();
  const snapshots = await firestore.getAll(...unique.map((uid) => firestore.collection("users").doc(uid)));
  return new Map(snapshots.map((snapshot) => [snapshot.id, (snapshot.data()?.displayName ?? "Ofis danışmanı") as string]));
}

async function loadOfficePortfolio(officeId: string): Promise<PortfolioItemRecord[]> {
  const snapshot = await getFirestore().collection("portfolioItems").where("officeId", "==", officeId).limit(500).get();
  const documents = snapshot.docs.filter((document) => document.data().availability === "available");
  const names = await displayNamesFor(documents.map((document) => document.data().ownerUid as string));
  return documents
    .map((document) => toRecord(document.id, document.data(), names.get(document.data().ownerUid as string) ?? "Ofis danışmanı"))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

interface OwnedPortfolioMatch {
  match: PortfolioMatchRecord;
  ownerUid: string;
  /** "near_miss" rows are shown on request but never raised as notifications. */
  tier: "match" | "near_miss";
}

const matchScoreFloor = 60;
const nearMissScoreFloor = 35;
const minimumCoverage = 40;

async function loadPortfolioMatches(claims: SpherepathClaims): Promise<OwnedPortfolioMatch[]> {
  const firestore = getFirestore();
  let query: FirebaseFirestore.Query = firestore.collection("contacts").where("officeId", "==", claims.officeId);
  if (claims.role !== "broker") query = query.where("ownerUid", "==", claims.uid);
  const [contactsSnapshot, portfolioItems] = await Promise.all([query.limit(200).get(), loadOfficePortfolio(claims.officeId)]);
  const matches: OwnedPortfolioMatch[] = [];
  for (const document of contactsSnapshot.docs) {
    const data = document.data();
    if (data.deletedAt !== null || data.privacy?.profilingObjection === true) continue;
    const rawMemory = (data.memory ?? {}) as DocumentData;
    const memory = contactMemorySchema.safeParse({ ...rawMemory, updatedAt: rawMemory.updatedAt instanceof Timestamp ? rawMemory.updatedAt.toMillis() : null });
    if (!memory.success || !memory.data.propertyPreferences.transactionType) continue;
    for (const portfolioItem of portfolioItems) {
      const result = scorePortfolioItem(memory.data.propertyPreferences, portfolioItem);
      if (!result.eligible || result.coverage < minimumCoverage || result.score < nearMissScoreFloor) continue;
      matches.push({
        ownerUid: data.ownerUid as string,
        tier: result.score >= matchScoreFloor ? "match" : "near_miss",
        match: {
          ...result,
          contactId: document.id,
          contactName: (data.fullName ?? data.label ?? "İsimsiz kişi") as string,
          portfolioItem,
        },
      });
    }
  }
  matches.sort((left, right) => right.match.score - left.match.score || right.match.coverage - left.match.coverage || right.match.portfolioItem.updatedAt - left.match.portfolioItem.updatedAt);
  // Each tier is capped on its own so a flood of near misses cannot push out real matches.
  return [...matches.filter((item) => item.tier === "match").slice(0, 100), ...matches.filter((item) => item.tier === "near_miss").slice(0, 50)];
}

export const extractPortfolioText = onCall(callableOptions, async (request): Promise<{ draft: PortfolioItemDraft }> => {
  requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data);
  const parsed = portfolioTextInputSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Portfolio note is invalid.", parsed.error.flatten());
  return observeApiRequest("extractPortfolioText", envelope.requestId, async () => {
    try { return { draft: await extractPortfolioDraftWithVertex(parsed.data.text, parsed.data.source) }; }
    catch { throw new HttpsError("internal", "Portfolio note could not be analyzed."); }
  });
});

export const createPortfolioItemFromDraft = onCall(callableOptions, async (request): Promise<{ portfolioItem: PortfolioItemRecord }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = portfolioItemDraftSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Portfolio item is invalid.", parsed.error.flatten());
  return observeApiRequest("createPortfolioItemFromDraft", envelope.requestId, async () => {
    const firestore = getFirestore();
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const itemRef = firestore.collection("portfolioItems").doc();
    const itemId = await firestore.runTransaction(async (transaction) => {
      const receipt = await transaction.get(commandRef);
      if (receipt.exists) {
        const data = receipt.data()!;
        if (data.officeId !== claims.officeId || data.ownerUid !== claims.uid || data.type !== "createPortfolioItemFromDraft") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return data.portfolioItemId as string;
      }
      const now = Date.now();
      const item = createPortfolioItem(parsed.data, { officeId: claims.officeId, ownerUid: claims.uid }, now);
      transaction.create(itemRef, { ...item, createdAt: Timestamp.fromMillis(now), updatedAt: Timestamp.fromMillis(now) });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "createPortfolioItemFromDraft", portfolioItemId: itemRef.id, createdAt: Timestamp.fromMillis(now) });
      return itemRef.id;
    });
    const [snapshot, userSnapshot] = await Promise.all([firestore.collection("portfolioItems").doc(itemId).get(), firestore.collection("users").doc(claims.uid).get()]);
    return { portfolioItem: toRecord(snapshot.id, snapshot.data()!, (userSnapshot.data()?.displayName ?? "Ofis danışmanı") as string) };
  });
});

export const listPortfolioItems = onCall(callableOptions, async (request): Promise<{ portfolioItems: PortfolioItemRecord[] }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<undefined>(request.data);
  return observeApiRequest("listPortfolioItems", envelope.requestId, async () => ({ portfolioItems: await loadOfficePortfolio(claims.officeId) }));
});

export const listPortfolioMatches = onCall(callableOptions, async (request): Promise<{ matches: PortfolioMatchRecord[]; nearMisses: PortfolioMatchRecord[] }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<undefined>(request.data);
  return observeApiRequest("listPortfolioMatches", envelope.requestId, async () => {
    const scored = await loadPortfolioMatches(claims);
    return {
      matches: scored.filter((item) => item.tier === "match").map((item) => item.match),
      nearMisses: scored.filter((item) => item.tier === "near_miss").map((item) => item.match),
    };
  });
});

export const listMatchNotifications = onCall(callableOptions, async (request): Promise<{ notifications: PortfolioMatchNotificationRecord[] }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<undefined>(request.data);
  return observeApiRequest("listMatchNotifications", envelope.requestId, async () => {
    const firestore = getFirestore();
    // Near misses are shown when asked for; they must never raise a notification.
    const personalMatches = (await loadPortfolioMatches(claims)).filter((item) => item.ownerUid === claims.uid && item.tier === "match");
    const existingSnapshot = await firestore.collection("matchNotifications").where("recipientUid", "==", claims.uid).limit(200).get();
    const existing = new Map(existingSnapshot.docs.map((document) => [document.id, document.data()]));
    const now = Timestamp.now();
    const batch = firestore.batch();
    let hasWrites = false;
    const notifications = personalMatches.map<PortfolioMatchNotificationRecord>(({ match }) => {
      const id = `${match.contactId}_${match.portfolioItem.id}`.replace(/[^a-zA-Z0-9_-]/gu, "_");
      const stored = existing.get(id);
      if (!stored) {
        batch.set(firestore.collection("matchNotifications").doc(id), {
          officeId: claims.officeId,
          recipientUid: claims.uid,
          contactId: match.contactId,
          portfolioItemId: match.portfolioItem.id,
          score: match.score,
          coverage: match.coverage,
          readAt: null,
          createdAt: now,
          updatedAt: now,
        });
        hasWrites = true;
      }
      return {
        id,
        match,
        createdAt: stored ? millis(stored.createdAt) : now.toMillis(),
        readAt: stored?.readAt instanceof Timestamp ? stored.readAt.toMillis() : null,
      };
    });
    if (hasWrites) await batch.commit();
    return { notifications };
  });
});

export const markMatchNotificationsRead = onCall(callableOptions, async (request): Promise<{ markedCount: number }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = matchNotificationCommandSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Match notification command is invalid.", parsed.error.flatten());
  return observeApiRequest("markMatchNotificationsRead", envelope.requestId, async () => {
    const firestore = getFirestore();
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const refs = parsed.data.notificationIds.map((id) => firestore.collection("matchNotifications").doc(id));
    await firestore.runTransaction(async (transaction) => {
      const [receipt, ...snapshots] = await Promise.all([transaction.get(commandRef), ...refs.map((ref) => transaction.get(ref))]);
      if (receipt.exists) {
        const data = receipt.data()!;
        if (data.officeId !== claims.officeId || data.ownerUid !== claims.uid || data.type !== "markMatchNotificationsRead") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return;
      }
      const now = Timestamp.now();
      snapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) return;
        const data = snapshot.data()!;
        if (data.officeId !== claims.officeId || data.recipientUid !== claims.uid) throw new HttpsError("permission-denied", "Match notification is outside your workspace.");
        transaction.update(refs[index]!, { readAt: now, updatedAt: now });
      });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "markMatchNotificationsRead", markedCount: snapshots.filter((snapshot) => snapshot.exists).length, createdAt: now });
    });
    return { markedCount: parsed.data.notificationIds.length };
  });
});

export const withdrawPortfolioItem = onCall(callableOptions, async (request): Promise<{ portfolioItemId: string }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = portfolioItemCommandSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Portfolio item command is invalid.", parsed.error.flatten());
  return observeApiRequest("withdrawPortfolioItem", envelope.requestId, async () => {
    const firestore = getFirestore();
    const itemRef = firestore.collection("portfolioItems").doc(parsed.data.portfolioItemId);
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    await firestore.runTransaction(async (transaction) => {
      const [receipt, itemSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(itemRef)]);
      if (receipt.exists) {
        const data = receipt.data()!;
        if (data.officeId !== claims.officeId || data.ownerUid !== claims.uid || data.type !== "withdrawPortfolioItem" || data.portfolioItemId !== parsed.data.portfolioItemId) throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return;
      }
      if (!itemSnapshot.exists) throw new HttpsError("not-found", "Portfolio item was not found.");
      const item = itemSnapshot.data()!;
      const canManage = item.officeId === claims.officeId && (item.ownerUid === claims.uid || claims.role === "broker");
      if (!canManage) throw new HttpsError("permission-denied", "Portfolio item is outside your workspace.");
      const now = Timestamp.now();
      transaction.update(itemRef, { availability: "withdrawn", updatedAt: now });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "withdrawPortfolioItem", portfolioItemId: itemRef.id, createdAt: now });
    });
    return { portfolioItemId: parsed.data.portfolioItemId };
  });
});
