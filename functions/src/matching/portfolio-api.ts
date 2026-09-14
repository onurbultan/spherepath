import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { readQueryPages } from "../api/paged-query.js";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  listingMatchCandidate, voicePropertyPreferencesSchema, opportunityCriteriaSummary,
  type Listing, type OpportunityType,
  buildMatchMessageFallback,
  contactMemorySchema,
  customerFacingContactName,
  createPortfolioItem,
  matchMessageRequestSchema,
  matchNotificationCommandSchema,
  portfolioItemDraftSchema,
  portfolioItemCarriesMandate,
  portfolioItemCommandSchema,
  portfolioTextInputSchema,
  unverifiedPortfolioOutreachMessage,
  scorePortfolioItem,
  type PortfolioItem,
  type PortfolioItemDraft,
  type PortfolioItemRecord,
  type PortfolioMatchNotificationRecord,
  type MatchMessageDraft,
  type PortfolioMatchRecord,
} from "../../../packages/shared/src/index.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims, type SpherepathClaims } from "../auth/claims.js";
import { maskSensitiveTranscript } from "../voice/privacy.js";
import { draftMatchMessageWithVertex } from "./vertex-match-message.js";
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
  const documents = (await readQueryPages(getFirestore().collection("portfolioItems").where("officeId", "==", officeId))).filter((document) => document.data().availability === "available");
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

async function loadMatchCandidates(claims: SpherepathClaims): Promise<PortfolioItemRecord[]> {
  const db = getFirestore();
  let listingQuery: FirebaseFirestore.Query = db.collection("listings").where("officeId", "==", claims.officeId);
  if (claims.role !== "broker") listingQuery = listingQuery.where("ownerUid", "==", claims.uid);
  const [pool, listings] = await Promise.all([loadOfficePortfolio(claims.officeId), readQueryPages(listingQuery)]);
  const names = await displayNamesFor(listings.map((doc) => doc.data().ownerUid as string));
  const sourceIds = [...new Set(listings.map((doc) => doc.data().opportunityId as string).filter(Boolean))];
  const sources = sourceIds.length ? await db.getAll(...sourceIds.map((id) => db.collection("opportunities").doc(id))) : [];
  const sourceTypes = new Map(sources.filter((doc) => doc.data()?.officeId === claims.officeId).map((doc) => [doc.id, doc.data()?.type]));
  const owned = listings.flatMap((doc) => {
    const data = doc.data();
    const sourceType = sourceTypes.get(data.opportunityId as string);
    if (sourceType !== "seller_listing" && sourceType !== "landlord_listing") return [];
    const candidate = listingMatchCandidate({ ...data, id: doc.id, createdAt: millis(data.createdAt), updatedAt: millis(data.updatedAt) } as Listing & { id: string }, sourceType === "landlord_listing" ? "let" : "sell", names.get(data.ownerUid as string) ?? "Ofis danışmanı");
    return candidate ? [candidate] : [];
  });
  const ownIds = new Set(owned.map((item) => item.sourceListingId));
  const propertyIds = new Set(owned.map((item) => item.sourcePropertyId));
  return [...owned, ...pool.filter((item) => !(item.sourceListingId && ownIds.has(item.sourceListingId)) && !(item.sourcePropertyId && propertyIds.has(item.sourcePropertyId)))];
}

async function loadPortfolioMatches(claims: SpherepathClaims, opportunityId?: string): Promise<{ rows: OwnedPortfolioMatch[]; candidateCount: number; demandCount: number }> {
  const db = getFirestore();
  let contactQuery: FirebaseFirestore.Query = db.collection("contacts").where("officeId", "==", claims.officeId);
  let opportunityQuery: FirebaseFirestore.Query = db.collection("opportunities").where("officeId", "==", claims.officeId);
  if (claims.role !== "broker") {
    contactQuery = contactQuery.where("ownerUid", "==", claims.uid);
    opportunityQuery = opportunityQuery.where("ownerUid", "==", claims.uid);
  }
  const [contacts, opportunities, items] = await Promise.all([readQueryPages(contactQuery), readQueryPages(opportunityQuery), loadMatchCandidates(claims)]);
  const matches: OwnedPortfolioMatch[] = [];
  let demandCount = 0;
  for (const document of contacts) {
    const data = document.data();
    if (data.deletedAt !== null || data.privacy?.profilingObjection === true) continue;
    const allDemands = opportunities.filter((doc) => doc.data().subjectContactId === document.id && ["buyer_requirement", "tenant_requirement"].includes(doc.data().type as string));
    const demands: { id: string | null; preferences: import("../../../packages/shared/src/index.js").PropertyPreferences; summary: string | null }[] = [];
    for (const doc of allDemands) {
      const demand = doc.data();
      if (demand.deletedAt !== null || demand.stage === "lost" || demand.stage === "won" || (opportunityId && doc.id !== opportunityId)) continue;
      const parsed = voicePropertyPreferencesSchema.safeParse(demand.criteria);
      if (parsed.success) demands.push({ id: doc.id, preferences: parsed.data, summary: opportunityCriteriaSummary(demand.type as OpportunityType, parsed.data) });
    }
    // Legacy memory is used only when no demand has ever been created. Closed
    // demand criteria must never come back as an anonymous live search.
    if (!allDemands.length && !opportunityId) {
      const raw = data.memory ?? {};
      const memory = contactMemorySchema.safeParse({ ...raw, updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt.toMillis() : null });
      if (memory.success) {
        const searching = memory.data.propertySituations.filter((item) => item.propertyContext === "search_preference" && item.propertyPreferences.transactionType);
        if (searching.length) searching.forEach((item) => demands.push({ id: null, preferences: item.propertyPreferences, summary: item.summary }));
        else if (memory.data.propertyPreferences.transactionType) demands.push({ id: null, preferences: memory.data.propertyPreferences, summary: null });
      }
    }
    demandCount += demands.length;
    for (const demand of demands) for (const item of items) {
      const result = scorePortfolioItem(demand.preferences, item);
      if (!result.eligible || result.coverage < minimumCoverage || result.score < nearMissScoreFloor) continue;
      matches.push({ ownerUid: data.ownerUid as string, tier: result.score >= matchScoreFloor ? "match" : "near_miss", match: {
        ...result, opportunityId: demand.id, contactId: document.id, contactName: (data.fullName ?? data.label ?? "İsimsiz kişi") as string, portfolioItem: item, situationSummary: demand.summary,
      } });
    }
  }
  matches.sort((a, b) => b.match.score - a.match.score || b.match.coverage - a.match.coverage || b.match.portfolioItem.updatedAt - a.match.portfolioItem.updatedAt || `${a.match.opportunityId}:${a.match.portfolioItem.id}`.localeCompare(`${b.match.opportunityId}:${b.match.portfolioItem.id}`));
  const unique = new Map<string, OwnedPortfolioMatch>();
  for (const entry of matches) {
    const key = `${entry.match.opportunityId ?? entry.match.contactId}::${entry.match.portfolioItem.id}`;
    if (!unique.has(key)) unique.set(key, entry);
  }
  return { rows: [...unique.values()], candidateCount: items.length, demandCount };
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
  const envelope = readApiEnvelope<{ opportunityId?: string; cursor?: number } | undefined>(request.data);
  if (envelope.data?.opportunityId !== undefined && (typeof envelope.data.opportunityId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/u.test(envelope.data.opportunityId))) throw new HttpsError("invalid-argument", "Invalid requirement id.");
  return observeApiRequest("listPortfolioMatches", envelope.requestId, async () => {
    const cursor = envelope.data?.cursor ?? 0;
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new HttpsError("invalid-argument", "Invalid match cursor.");
    const result = await loadPortfolioMatches(claims, envelope.data?.opportunityId);
    const scored = result.rows.slice(cursor, cursor + 100);
    return {
      candidateCount: result.candidateCount,
      demandCount: result.demandCount,
      nextCursor: cursor + scored.length < result.rows.length ? cursor + scored.length : null,
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
    const personalMatches = (await loadPortfolioMatches(claims)).rows.filter((item) => item.ownerUid === claims.uid && item.tier === "match");
    const existingSnapshot = await readQueryPages(firestore.collection("matchNotifications").where("recipientUid", "==", claims.uid));
    const existing = new Map(existingSnapshot.map((document) => [document.id, document.data()]));
    const now = Timestamp.now();
    const writer = firestore.bulkWriter();
    const writes: Promise<unknown>[] = [];
    const notifications = personalMatches.map<PortfolioMatchNotificationRecord>(({ match }) => {
      const id = `${claims.uid}_${match.opportunityId ?? match.contactId}_${match.portfolioItem.id}`.replace(/[^a-zA-Z0-9_-]/gu, "_");
      const stored = existing.get(id);
      if (!stored || !stored.ownerUid) {
        writes.push(writer.set(firestore.collection("matchNotifications").doc(id), {
          officeId: claims.officeId,
          ownerUid: claims.uid,
          opportunityId: match.opportunityId ?? null,
          recipientUid: claims.uid,
          contactId: match.contactId,
          portfolioItemId: match.portfolioItem.id,
          score: match.score,
          coverage: match.coverage,
          readAt: stored?.readAt ?? null,
          createdAt: stored?.createdAt ?? now,
          updatedAt: now,
        }, { merge: true }));
      }
      return {
        id,
        match,
        createdAt: stored ? millis(stored.createdAt) : now.toMillis(),
        readAt: stored?.readAt instanceof Timestamp ? stored.readAt.toMillis() : null,
      };
    });
    await writer.close();
    await Promise.all(writes);
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

export const draftMatchMessage = onCall(callableOptions, async (request): Promise<MatchMessageDraft> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data);
  const parsed = matchMessageRequestSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Match message input is invalid.", parsed.error.flatten());

  return observeApiRequest("draftMatchMessage", envelope.requestId, async () => {
    const db = getFirestore();
    const [contactSnapshot, itemSnapshot, advisorSnapshot] = await Promise.all([
      db.collection("contacts").doc(parsed.data.contactId).get(),
      loadMatchCandidates(claims).then((items) => items.find((item) => item.id === parsed.data.portfolioItemId)),
      db.collection("users").doc(claims.uid).get(),
    ]);
    const contact = contactSnapshot.data();
    const item = itemSnapshot;
    if (!contactSnapshot.exists || !contact || contact.officeId !== claims.officeId || (contact.ownerUid !== claims.uid && claims.role !== "broker") || contact.deletedAt !== null) {
      throw new HttpsError("permission-denied", "Contact is outside your workspace.");
    }
    if (!item || item.officeId !== claims.officeId) {
      throw new HttpsError("permission-denied", "Portfolio item is outside your workspace.");
    }

    // A hearsay row is a lead to chase, not a property to quote. Its price came
    // from whoever mentioned it, and nobody has spoken to an owner -- so it must
    // not leave the office inside a message written under the advisor's name.
    if (!portfolioItemCarriesMandate(item)) {
      throw new HttpsError("failed-precondition", unverifiedPortfolioOutreachMessage);
    }

    const portfolioItem = item;
    const rawMemory = (contact.memory ?? {}) as DocumentData;
    const memory = contactMemorySchema.safeParse({ ...rawMemory, updatedAt: rawMemory.updatedAt instanceof Timestamp ? rawMemory.updatedAt.toMillis() : null });
    let preferences = memory.success
      ? memory.data.propertySituations.find((situation) => situation.propertyContext === "search_preference")?.propertyPreferences ?? memory.data.propertyPreferences
      : null;
    if (parsed.data.opportunityId) {
      const demand = (await db.collection("opportunities").doc(parsed.data.opportunityId).get()).data();
      if (!demand || demand.officeId !== claims.officeId || (demand.ownerUid !== claims.uid && claims.role !== "broker") || demand.subjectContactId !== parsed.data.contactId || demand.deletedAt !== null || ["won", "lost"].includes(demand.stage as string)) throw new HttpsError("permission-denied", "Requirement is unavailable.");
      const parsedPreferences = voicePropertyPreferencesSchema.safeParse(demand.criteria);
      preferences = parsedPreferences.success ? parsedPreferences.data : null;
    }
    const score = preferences ? scorePortfolioItem(preferences, portfolioItem) : null;
    if (score && !score.eligible) throw new HttpsError("failed-precondition", "Portföy zorunlu talep kriterlerini karşılamıyor.");
    const subject = {
      mismatchReasons: score?.reasons.filter((reason) => reason.status === "mismatch").map((reason) => reason.detail),
      contactName: customerFacingContactName((contact.fullName ?? contact.label) as string | null) ?? "İsimsiz kişi",
      headline: portfolioItem.headline,
      location: portfolioItem.location,
      askingPrice: portfolioItem.askingPrice,
      listingUrl: portfolioItem.listingUrl,
    };
    const fallback: MatchMessageDraft = { message: buildMatchMessageFallback(subject), source: "template" };
    if (contact.privacy?.profilingObjection === true || subject.mismatchReasons?.length) return fallback;
    const matchReasons = score?.reasons.filter((reason) => reason.status === "match").map((reason) => reason.detail) ?? [];

    try {
      const message = await draftMatchMessageWithVertex({
        ...subject,
        advisorName: (advisorSnapshot.data()?.displayName as string) ?? "Danışman",
        memoryNotes: memory.success ? memory.data.keyThingsToRemember : [],
        matchReasons,
      });
      // The model saw the contact's notes; if anything special-category surfaced in the
      // answer, the draft is discarded rather than repaired.
      if (maskSensitiveTranscript(message).maskedRanges.length > 0) return fallback;
      return { message, source: "ai" };
    } catch (error) {
      logger.warn("Match message draft fell back to the template", { error: error instanceof Error ? error.message : "unknown" });
      return fallback;
    }
  });
});
