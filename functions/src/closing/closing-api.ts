import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  assertDealTransition, assertListingTransition, assertPresentationTransition, canMarketOnChannel, createDeal as createDealEntity,
  createPresentation as createPresentationEntity, dealDraftSchema, dealTransitionSchema, presentationDraftSchema,
  presentationTransitionSchema, type Deal, type DealDraft, type DealStage, type DealTransition, type Presentation,
  type ListingStatus, type PresentationDraft, type PresentationStatus,
} from "../../../packages/shared/src/index";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims } from "../auth/claims.js";

interface PresentationRecord extends Presentation { id: string; contactName: string; listingAddress: string }
interface DealRecord extends Deal { id: string; buyerContactName: string | null; listingAddress: string }
const options = { region: "europe-west8" as const, cors: true, maxInstances: 10, memory: "256MiB" as const, timeoutSeconds: 60 };
const millis = (value: unknown): number | null => value instanceof Timestamp ? value.toMillis() : null;
const stamp = (value: number | null): Timestamp | null => value === null ? null : Timestamp.fromMillis(value);
function presentationRecord(id: string, data: DocumentData, contactName: string, listingAddress: string): PresentationRecord { return { ...(data as Presentation), id, contactName, listingAddress, userConfirmedSentAt: millis(data.userConfirmedSentAt), sentAt: millis(data.sentAt), deliveredAt: millis(data.deliveredAt), readAt: millis(data.readAt), repliedAt: millis(data.repliedAt), deletedAt: millis(data.deletedAt), createdAt: millis(data.createdAt) ?? 0, updatedAt: millis(data.updatedAt) ?? 0 }; }
function dealRecord(id: string, data: DocumentData, buyerContactName: string | null, listingAddress: string): DealRecord { const createdAt = millis(data.createdAt) ?? 0; const updatedAt = millis(data.updatedAt) ?? 0; return { ...(data as Deal), id, buyerContactName, listingAddress, buyerOpportunityId: typeof data.buyerOpportunityId === "string" ? data.buyerOpportunityId : null, source: data.source ?? "other", sourcePresentationId: typeof data.sourcePresentationId === "string" ? data.sourcePresentationId : null, sourceNote: typeof data.sourceNote === "string" ? data.sourceNote : null, stageEnteredAt: millis(data.stageEnteredAt) ?? updatedAt ?? createdAt, lastStageNote: typeof data.lastStageNote === "string" ? data.lastStageNote : null, nextActionAt: millis(data.nextActionAt), nextActionType: data.nextActionType ?? null, actualAmount: typeof data.actualAmount === "number" ? data.actualAmount : null, commissionAmount: typeof data.commissionAmount === "number" ? data.commissionAmount : null, closedAt: millis(data.closedAt), deletedAt: millis(data.deletedAt), createdAt, updatedAt }; }
function manageable(data: DocumentData, claims: ReturnType<typeof requireSpherepathClaims>) { return data.officeId === claims.officeId && (data.ownerUid === claims.uid || claims.role === "broker") && data.deletedAt === null; }

export const getClosingOverview = onCall(options, async (request): Promise<{ presentations: PresentationRecord[]; deals: DealRecord[] }> => {
  const claims = requireSpherepathClaims(request); const envelope = readApiEnvelope<undefined>(request.data);
  return observeApiRequest("getClosingOverview", envelope.requestId, async () => {
    const db = getFirestore(); let presentationsQuery: FirebaseFirestore.Query = db.collection("presentations").where("officeId", "==", claims.officeId); let dealsQuery: FirebaseFirestore.Query = db.collection("deals").where("officeId", "==", claims.officeId); if (claims.role !== "broker") { presentationsQuery = presentationsQuery.where("ownerUid", "==", claims.uid); dealsQuery = dealsQuery.where("ownerUid", "==", claims.uid); }
    const [presentationsSnapshot, dealsSnapshot] = await Promise.all([presentationsQuery.limit(200).get(), dealsQuery.limit(200).get()]); const presentationDocs = presentationsSnapshot.docs.filter((item) => item.data().deletedAt === null); const dealDocs = dealsSnapshot.docs.filter((item) => item.data().deletedAt === null); const listingIds = [...new Set([...presentationDocs, ...dealDocs].map((item) => item.data().listingId as string))]; const contactIds = [...new Set([...presentationDocs.map((item) => item.data().contactId), ...dealDocs.map((item) => item.data().buyerContactId)].filter((id): id is string => typeof id === "string"))];
    const [listings, contacts] = await Promise.all([listingIds.length ? db.getAll(...listingIds.map((id) => db.collection("listings").doc(id))) : [], contactIds.length ? db.getAll(...contactIds.map((id) => db.collection("contacts").doc(id))) : []]); const addresses = new Map(listings.map((item) => [item.id, item.data()?.propertySummary?.address ?? "Portföy"])); const names = new Map(contacts.map((item) => [item.id, item.data()?.fullName ?? item.data()?.label ?? "İsimsiz kişi"]));
    return { presentations: presentationDocs.map((item) => presentationRecord(item.id, item.data(), names.get(item.data().contactId) ?? "İsimsiz kişi", addresses.get(item.data().listingId) ?? "Portföy")).sort((a, b) => b.updatedAt - a.updatedAt), deals: dealDocs.map((item) => dealRecord(item.id, item.data(), names.get(item.data().buyerContactId) ?? null, addresses.get(item.data().listingId) ?? "Portföy")).sort((a, b) => b.updatedAt - a.updatedAt) };
  });
});

export const createPresentation = onCall(options, async (request): Promise<{ presentationId: string }> => {
  const claims = requireSpherepathClaims(request); const envelope = readApiEnvelope<PresentationDraft>(request.data, { command: true }); const parsed = presentationDraftSchema.safeParse(envelope.data); if (!parsed.success) throw new HttpsError("invalid-argument", "Presentation input is invalid.", parsed.error.flatten());
  return observeApiRequest("createPresentation", envelope.requestId, async () => {
    const db = getFirestore(); const listingRef = db.collection("listings").doc(parsed.data.listingId); const contactRef = db.collection("contacts").doc(parsed.data.contactId); const presentationRef = db.collection("presentations").doc(); const commandRef = db.collection("commands").doc(envelope.commandId!);
    const id = await db.runTransaction(async (transaction) => { const [receipt, listingSnapshot, contactSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(listingRef), transaction.get(contactRef)]); if (receipt.exists) { const data = receipt.data()!; if (data.officeId !== claims.officeId || data.ownerUid !== claims.uid || data.type !== "createPresentation") throw new HttpsError("permission-denied", "Command receipt is outside your workspace."); return data.presentationId as string; } if (!listingSnapshot.exists || !manageable(listingSnapshot.data()!, claims)) throw new HttpsError("permission-denied", "Listing is outside your workspace."); if (!["active", "reserved"].includes(listingSnapshot.data()!.status)) throw new HttpsError("failed-precondition", "Listing is not marketable."); if (!contactSnapshot.exists || !manageable(contactSnapshot.data()!, claims)) throw new HttpsError("permission-denied", "Contact is outside your workspace."); const gate = canMarketOnChannel(contactSnapshot.data()!.privacy, parsed.data.channel); if (!gate.allowed) throw new HttpsError("failed-precondition", gate.reason ?? "Marketing compliance is incomplete."); const now = Date.now(); const entity = createPresentationEntity(parsed.data, { officeId: listingSnapshot.data()!.officeId, ownerUid: listingSnapshot.data()!.ownerUid }, now); const nowTimestamp = Timestamp.fromMillis(now); transaction.create(presentationRef, { ...entity, userConfirmedSentAt: null, sentAt: null, deliveredAt: null, readAt: null, repliedAt: null, deletedAt: null, createdAt: nowTimestamp, updatedAt: nowTimestamp }); transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "createPresentation", presentationId: presentationRef.id, createdAt: nowTimestamp }); return presentationRef.id; }); return { presentationId: id };
  });
});

export const advancePresentation = onCall(options, async (request): Promise<{ presentationId: string; toStatus: PresentationStatus }> => {
  const claims = requireSpherepathClaims(request); const envelope = readApiEnvelope<unknown>(request.data, { command: true }); const parsed = presentationTransitionSchema.safeParse(envelope.data); if (!parsed.success) throw new HttpsError("invalid-argument", "Presentation transition is invalid.");
  return observeApiRequest("advancePresentation", envelope.requestId, async () => { const db = getFirestore(); const ref = db.collection("presentations").doc(parsed.data.presentationId); const commandRef = db.collection("commands").doc(envelope.commandId!); return db.runTransaction(async (transaction) => { const [receipt, snapshot] = await Promise.all([transaction.get(commandRef), transaction.get(ref)]); if (receipt.exists) return { presentationId: receipt.data()!.presentationId as string, toStatus: receipt.data()!.toStatus as PresentationStatus }; if (!snapshot.exists || !manageable(snapshot.data()!, claims)) throw new HttpsError("permission-denied", "Presentation is outside your workspace."); try { assertPresentationTransition(snapshot.data()!.status, parsed.data.toStatus); } catch { throw new HttpsError("failed-precondition", "Presentation status transition is invalid."); } const now = Timestamp.now(); const updates: DocumentData = { status: parsed.data.toStatus, statusSource: "user_confirmation", updatedAt: now }; if (parsed.data.toStatus === "sent") { updates.sentAt = now; updates.userConfirmedSentAt = now; } if (parsed.data.toStatus === "replied") updates.repliedAt = now; transaction.update(ref, updates); transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "advancePresentation", presentationId: ref.id, toStatus: parsed.data.toStatus, createdAt: now }); return { presentationId: ref.id, toStatus: parsed.data.toStatus }; }); });
});

export const createDeal = onCall(options, async (request): Promise<{ dealId: string }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<DealDraft>(request.data, { command: true });
  const parsed = dealDraftSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Deal input is invalid.", parsed.error.flatten());
  return observeApiRequest("createDeal", envelope.requestId, async () => {
    const db = getFirestore();
    const listingRef = db.collection("listings").doc(parsed.data.listingId);
    const buyerRef = parsed.data.buyerContactId ? db.collection("contacts").doc(parsed.data.buyerContactId) : null;
    const dealRef = db.collection("deals").doc();
    const initialEventRef = db.collection("stageEvents").doc();
    const commandRef = db.collection("commands").doc(envelope.commandId!);

    // Preserve command idempotency before any source discovery. A replay must return
    // the original result even if the presentation or opportunity changed meanwhile.
    const existingReceipt = await commandRef.get();
    if (existingReceipt.exists) {
      const data = existingReceipt.data()!;
      if (data.officeId !== claims.officeId || data.ownerUid !== claims.uid || data.type !== "createDeal") {
        throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
      }
      return { dealId: data.dealId as string };
    }

    const preflightListing = await listingRef.get();
    const preflightOpportunity = preflightListing.exists && typeof preflightListing.data()?.opportunityId === "string"
      ? await db.collection("opportunities").doc(preflightListing.data()!.opportunityId as string).get()
      : null;
    const expectedBuyerType = preflightOpportunity?.data()?.type === "landlord_listing" ? "tenant_requirement" : "buyer_requirement";
    let buyerOpportunityRef: FirebaseFirestore.DocumentReference | null = parsed.data.buyerOpportunityId
      ? db.collection("opportunities").doc(parsed.data.buyerOpportunityId)
      : null;
    if (!buyerOpportunityRef && parsed.data.buyerContactId) {
      const candidates = await db.collection("opportunities").where("officeId", "==", claims.officeId).limit(500).get();
      const found = candidates.docs
        .filter((item) => {
          const data = item.data();
          return data.subjectContactId === parsed.data.buyerContactId && data.type === expectedBuyerType
            && data.stage !== "won" && data.stage !== "lost" && data.deletedAt === null
            && (data.ownerUid === claims.uid || claims.role === "broker");
        })
        .sort((left, right) => (millis(right.data().updatedAt) ?? 0) - (millis(left.data().updatedAt) ?? 0))[0];
      buyerOpportunityRef = found?.ref ?? null;
    }

    let sourcePresentationRef: FirebaseFirestore.DocumentReference | null = parsed.data.sourcePresentationId
      ? db.collection("presentations").doc(parsed.data.sourcePresentationId)
      : null;
    if (parsed.data.source === "presentation" && !sourcePresentationRef && parsed.data.buyerContactId) {
      const candidates = await db.collection("presentations").where("officeId", "==", claims.officeId).limit(500).get();
      const found = candidates.docs
        .filter((item) => {
          const data = item.data();
          return data.listingId === parsed.data.listingId && data.contactId === parsed.data.buyerContactId
            && ["sent", "delivered", "read", "replied"].includes(data.status as string)
            && data.deletedAt === null && (data.ownerUid === claims.uid || claims.role === "broker");
        })
        .sort((left, right) => (millis(right.data().updatedAt) ?? 0) - (millis(left.data().updatedAt) ?? 0))[0];
      sourcePresentationRef = found?.ref ?? null;
    }
    if (parsed.data.source === "presentation" && !sourcePresentationRef) {
      throw new HttpsError("failed-precondition", "İşlem için önce bu kişiye gönderilmiş bir sunumu doğrula veya farklı işlem kaynağı seç.");
    }

    const id = await db.runTransaction(async (transaction) => {
      const [receipt, listingSnapshot, buyerSnapshot, buyerOpportunitySnapshot, sourcePresentationSnapshot] = await Promise.all([
        transaction.get(commandRef),
        transaction.get(listingRef),
        buyerRef ? transaction.get(buyerRef) : Promise.resolve(null),
        buyerOpportunityRef ? transaction.get(buyerOpportunityRef) : Promise.resolve(null),
        sourcePresentationRef ? transaction.get(sourcePresentationRef) : Promise.resolve(null),
      ]);
      if (receipt.exists) return receipt.data()!.dealId as string;
      if (!listingSnapshot.exists || !manageable(listingSnapshot.data()!, claims)) throw new HttpsError("permission-denied", "Listing is outside your workspace.");
      if (!["active", "reserved"].includes(listingSnapshot.data()!.status as string)) throw new HttpsError("failed-precondition", "Listing is not marketable.");
      if (buyerRef && (!buyerSnapshot?.exists || !manageable(buyerSnapshot.data()!, claims))) throw new HttpsError("permission-denied", "Buyer is outside your workspace.");
      if (buyerOpportunitySnapshot) {
        const opportunity = buyerOpportunitySnapshot.data();
        if (!buyerOpportunitySnapshot.exists || !opportunity || !manageable(opportunity, claims)
          || opportunity.subjectContactId !== parsed.data.buyerContactId || opportunity.type !== expectedBuyerType
          || opportunity.stage === "won" || opportunity.stage === "lost") {
          throw new HttpsError("failed-precondition", "Linked buyer requirement is unavailable.");
        }
      }
      if (parsed.data.source === "presentation") {
        const presentation = sourcePresentationSnapshot?.data();
        if (!sourcePresentationSnapshot?.exists || !presentation || !manageable(presentation, claims)
          || presentation.listingId !== parsed.data.listingId || presentation.contactId !== parsed.data.buyerContactId
          || !["sent", "delivered", "read", "replied"].includes(presentation.status as string)) {
          throw new HttpsError("failed-precondition", "İşlem kaynağı olan sunum henüz gönderilmiş değil.");
        }
      }
      const now = Date.now();
      const entity = createDealEntity({
        ...parsed.data,
        buyerOpportunityId: buyerOpportunityRef?.id ?? null,
        sourcePresentationId: sourcePresentationRef?.id ?? null,
      }, { officeId: listingSnapshot.data()!.officeId, ownerUid: listingSnapshot.data()!.ownerUid }, now);
      const nowTimestamp = Timestamp.fromMillis(now);
      transaction.create(dealRef, { ...entity, stageEnteredAt: nowTimestamp, nextActionAt: Timestamp.fromMillis(parsed.data.nextActionAt), closedAt: null, deletedAt: null, createdAt: nowTimestamp, updatedAt: nowTimestamp });
      transaction.create(initialEventRef, {
        officeId: entity.officeId,
        ownerUid: entity.ownerUid,
        entityType: "deal",
        entityId: dealRef.id,
        fromStage: null,
        toStage: "presentation",
        reason: entity.lastStageNote,
        commandId: envelope.commandId,
        occurredAt: nowTimestamp,
        createdAt: nowTimestamp,
      });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "createDeal", dealId: dealRef.id, createdAt: nowTimestamp });
      return dealRef.id;
    });
    return { dealId: id };
  });
});

export const advanceDeal = onCall(options, async (request): Promise<{ dealId: string; toStage: DealStage }> => {
  const claims = requireSpherepathClaims(request); const envelope = readApiEnvelope<DealTransition>(request.data, { command: true }); const parsed = dealTransitionSchema.safeParse(envelope.data); if (!parsed.success) throw new HttpsError("invalid-argument", "Deal transition is invalid.", parsed.error.flatten());
  return observeApiRequest("advanceDeal", envelope.requestId, async () => {
    const db = getFirestore();
    const dealRef = db.collection("deals").doc(parsed.data.dealId);
    const commandRef = db.collection("commands").doc(envelope.commandId!);
    const listingEventRef = db.collection("stageEvents").doc();
    const dealEventRef = db.collection("stageEvents").doc();
    const buyerOpportunityEventRef = db.collection("stageEvents").doc();

    return db.runTransaction(async (transaction) => {
      const [receipt, dealSnapshot] = await Promise.all([transaction.get(commandRef), transaction.get(dealRef)]);
      if (receipt.exists) {
        const data = receipt.data()!;
        if (data.officeId !== claims.officeId || data.ownerUid !== claims.uid || data.type !== "advanceDeal") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return { dealId: data.dealId as string, toStage: data.toStage as DealStage };
      }
      if (!dealSnapshot.exists || !manageable(dealSnapshot.data()!, claims)) throw new HttpsError("permission-denied", "Deal is outside your workspace.");

      const deal = dealSnapshot.data()!;
      try { assertDealTransition(deal.stage, parsed.data.toStage); }
      catch { throw new HttpsError("failed-precondition", "Deal stage transition is invalid."); }

      let listingRef: FirebaseFirestore.DocumentReference | null = null;
      let listing: DocumentData | null = null;
      let listingStatus: ListingStatus | null = null;
      let ownerContactRef: FirebaseFirestore.DocumentReference | null = null;
      let buyerContactRef: FirebaseFirestore.DocumentReference | null = null;
      let buyerOpportunityRef: FirebaseFirestore.DocumentReference | null = null;
      let buyerOpportunity: DocumentData | null = null;
      const terminalDeal = parsed.data.toStage === "closed" || parsed.data.toStage === "lost";
      if (terminalDeal) {
        listingRef = db.collection("listings").doc(deal.listingId as string);
        const listingSnapshot = await transaction.get(listingRef);
        if (!listingSnapshot.exists || !manageable(listingSnapshot.data()!, claims)) throw new HttpsError("permission-denied", "Listing is outside your workspace.");
        listing = listingSnapshot.data()!;

        const opportunityId = listing.opportunityId;
        if (typeof opportunityId !== "string" || !opportunityId) throw new HttpsError("failed-precondition", "Listing source opportunity is missing.");
        const opportunitySnapshot = await transaction.get(db.collection("opportunities").doc(opportunityId));
        if (!opportunitySnapshot.exists || !manageable(opportunitySnapshot.data()!, claims)) throw new HttpsError("failed-precondition", "Listing source opportunity is unavailable.");
        const opportunity = opportunitySnapshot.data()!;
        const opportunityType = opportunity.type;
        if (opportunityType !== "seller_listing" && opportunityType !== "landlord_listing") throw new HttpsError("failed-precondition", "Listing source opportunity type is invalid.");
        const ownerContactId = opportunitySnapshot.data()!.subjectContactId;
        if (typeof ownerContactId === "string" && ownerContactId) {
          ownerContactRef = db.collection("contacts").doc(ownerContactId);
          const ownerContactSnapshot = await transaction.get(ownerContactRef);
          const ownerContact = ownerContactSnapshot.data();
          if (!ownerContactSnapshot.exists || !ownerContact || !manageable(ownerContact, claims)
            || ownerContact.officeId !== opportunity.officeId || ownerContact.ownerUid !== opportunity.ownerUid) ownerContactRef = null;
        }

        if (parsed.data.toStage === "closed") {
          listingStatus = opportunityType === "landlord_listing" ? "rented" : "sold";
        }
        if (listingStatus && listing.status !== listingStatus) {
          try { assertListingTransition(listing.status as ListingStatus, listingStatus); }
          catch { throw new HttpsError("failed-precondition", `Listing cannot close from ${listing.status}.`); }
        }
        if (parsed.data.toStage === "closed" && typeof deal.buyerOpportunityId === "string" && deal.buyerOpportunityId) {
          buyerOpportunityRef = db.collection("opportunities").doc(deal.buyerOpportunityId as string);
          const buyerOpportunitySnapshot = await transaction.get(buyerOpportunityRef);
          const candidate = buyerOpportunitySnapshot.data();
          if (buyerOpportunitySnapshot.exists && candidate && manageable(candidate, claims)
            && candidate.subjectContactId === deal.buyerContactId
            && (candidate.type === "buyer_requirement" || candidate.type === "tenant_requirement")) {
            buyerOpportunity = candidate;
          } else {
            buyerOpportunityRef = null;
          }
        }
        if (parsed.data.toStage === "closed" && typeof deal.buyerContactId === "string" && deal.buyerContactId) {
          const candidateRef = db.collection("contacts").doc(deal.buyerContactId as string);
          const buyerContactSnapshot = await transaction.get(candidateRef);
          const buyerContact = buyerContactSnapshot.data();
          if (buyerContactSnapshot.exists && buyerContact && manageable(buyerContact, claims)) buyerContactRef = candidateRef;
        }
      }

      const now = Timestamp.now();
      const eventAt = Timestamp.fromMillis(parsed.data.occurredAt);
      const nextActionAt = terminalDeal || parsed.data.nextActionAt === null ? null : Timestamp.fromMillis(parsed.data.nextActionAt);
      transaction.update(dealRef, {
        stage: parsed.data.toStage,
        stageEnteredAt: eventAt,
        lastStageNote: parsed.data.evidenceNote,
        nextActionAt,
        nextActionType: terminalDeal ? null : parsed.data.nextActionType,
        offerAmount: parsed.data.offerAmount ?? deal.offerAmount ?? null,
        actualAmount: parsed.data.toStage === "closed" ? parsed.data.actualAmount : deal.actualAmount ?? null,
        commissionAmount: parsed.data.toStage === "closed" ? parsed.data.commissionAmount : deal.commissionAmount ?? null,
        currency: parsed.data.currency ?? deal.currency ?? null,
        lostReason: parsed.data.toStage === "lost" ? parsed.data.lostReason : null,
        closedAt: parsed.data.toStage === "closed" ? eventAt : null,
        updatedAt: now,
      });
      transaction.create(dealEventRef, {
        officeId: deal.officeId,
        ownerUid: deal.ownerUid,
        entityType: "deal",
        entityId: dealRef.id,
        fromStage: deal.stage,
        toStage: parsed.data.toStage,
        reason: parsed.data.evidenceNote,
        commandId: envelope.commandId,
        occurredAt: eventAt,
        createdAt: now,
      });
      if (listingRef && listing && listingStatus && listing.status !== listingStatus) {
        transaction.update(listingRef, { status: listingStatus, updatedAt: now });
        transaction.create(listingEventRef, {
          officeId: listing.officeId,
          ownerUid: listing.ownerUid,
          entityType: "listing",
          entityId: listingRef.id,
          fromStage: listing.status,
          toStage: listingStatus,
          reason: "Deal closed",
          commandId: envelope.commandId,
          occurredAt: eventAt,
          createdAt: now,
        });
      }
      if (ownerContactRef && terminalDeal) {
        transaction.update(ownerContactRef, { "relationship.nextActionAt": null, "relationship.nextActionType": null, updatedAt: now });
      }
      if (buyerOpportunityRef && buyerOpportunity && buyerOpportunity.stage !== "won") {
        transaction.update(buyerOpportunityRef, {
          stage: "won",
          stageEnteredAt: eventAt,
          nextActionAt: null,
          nextActionType: null,
          closedAt: eventAt,
          lostReason: null,
          updatedAt: now,
        });
        transaction.create(buyerOpportunityEventRef, {
          officeId: buyerOpportunity.officeId,
          ownerUid: buyerOpportunity.ownerUid,
          entityType: "opportunity",
          entityId: buyerOpportunityRef.id,
          fromStage: buyerOpportunity.stage,
          toStage: "won",
          reason: "Bağlı işlem kapandı",
          commandId: envelope.commandId,
          occurredAt: eventAt,
          createdAt: now,
        });
      }
      if (buyerContactRef && buyerContactRef.path !== ownerContactRef?.path) {
        transaction.update(buyerContactRef, { "relationship.nextActionAt": null, "relationship.nextActionType": null, updatedAt: now });
      }
      transaction.create(commandRef, {
        officeId: claims.officeId,
        ownerUid: claims.uid,
        type: "advanceDeal",
        dealId: dealRef.id,
        toStage: parsed.data.toStage,
        listingStatus,
        createdAt: now,
      });
      return { dealId: dealRef.id, toStage: parsed.data.toStage };
    });
  });
});
