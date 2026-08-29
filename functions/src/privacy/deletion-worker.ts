import { getFirestore, Timestamp, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

async function matching(collection: string, field: string, value: string, officeId: string) {
  const snapshot = await getFirestore().collection(collection).where(field, "==", value).limit(500).get();
  return snapshot.docs.filter((item) => item.data().officeId === officeId);
}

function unique(documents: QueryDocumentSnapshot[]) {
  return [...new Map(documents.map((item) => [`${item.ref.path}`, item])).values()];
}

async function processDeletion(jobId: string) {
  const firestore = getFirestore();
  const jobRef = firestore.collection("deletionJobs").doc(jobId);
  const acquired = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists) return null;
    const data = snapshot.data()!;
    if (data.status === "completed" || data.status === "failed") return null;
    const attempts = Number(data.attempts ?? 0) + 1;
    transaction.update(jobRef, { status: "processing", attempts, updatedAt: Timestamp.now() });
    return {
      officeId: data.officeId as string,
      contactId: data.contactId as string,
      requestId: data.requestId as string,
      attempts,
    };
  });
  if (!acquired) return;

  try {
    const [interactions, voiceNotes, presentations, subjectOpportunities, sourceOpportunities, sourceReferrals, referredReferrals, buyerDeals, ownedProperties, inboxItems] = await Promise.all([
      matching("interactions", "contactId", acquired.contactId, acquired.officeId),
      matching("voiceNotes", "contactId", acquired.contactId, acquired.officeId),
      matching("presentations", "contactId", acquired.contactId, acquired.officeId),
      matching("opportunities", "subjectContactId", acquired.contactId, acquired.officeId),
      matching("opportunities", "sourceContactId", acquired.contactId, acquired.officeId),
      matching("referrals", "sourceContactId", acquired.contactId, acquired.officeId),
      matching("referrals", "referredContactId", acquired.contactId, acquired.officeId),
      matching("deals", "buyerContactId", acquired.contactId, acquired.officeId),
      matching("properties", "ownerContactId", acquired.contactId, acquired.officeId),
      matching("inboxItems", "linkedContactId", acquired.contactId, acquired.officeId),
    ]);
    const opportunities = unique([...subjectOpportunities, ...sourceOpportunities]);
    const opportunityIds = opportunities.map((item) => item.id);
    const listings = unique((await Promise.all(opportunityIds.map((id) => matching("listings", "opportunityId", id, acquired.officeId)))).flat());
    const listingIds = listings.map((item) => item.id);
    const listingDeals = unique((await Promise.all(listingIds.map((id) => matching("deals", "listingId", id, acquired.officeId)))).flat());
    const stageEntityIds = [...opportunityIds, ...listingIds, ...listingDeals.map((item) => item.id)];
    const stageEvents = unique((await Promise.all(stageEntityIds.map((id) => matching("stageEvents", "entityId", id, acquired.officeId)))).flat());

    const writer = firestore.bulkWriter();
    for (const document of unique([...interactions, ...voiceNotes, ...presentations, ...opportunities, ...sourceReferrals, ...referredReferrals, ...listings, ...stageEvents, ...inboxItems])) {
      writer.delete(document.ref);
    }
    for (const deal of unique([...buyerDeals, ...listingDeals])) {
      writer.update(deal.ref, { buyerContactId: null, updatedAt: Timestamp.now() });
    }
    for (const property of ownedProperties) writer.update(property.ref, { ownerContactId: null, updatedAt: Timestamp.now() });
    writer.delete(firestore.collection("contacts").doc(acquired.contactId));
    await writer.close();

    await Promise.all(voiceNotes.map(async (note) => {
      const path = note.data().storagePath;
      if (typeof path === "string") await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
    }));

    const now = Timestamp.now();
    await Promise.all([
      jobRef.update({ status: "completed", completedAt: now, updatedAt: now }),
      firestore.collection("dataSubjectRequests").doc(acquired.requestId).update({ status: "completed", resolvedAt: now, updatedAt: now }),
      firestore.collection("auditEvents").add({
        officeId: acquired.officeId,
        actorUid: "system",
        action: "contact_deletion_propagated",
        entityType: "contact",
        entityId: acquired.contactId,
        metadata: {
          interactions: interactions.length,
          voiceNotes: voiceNotes.length,
          opportunities: opportunities.length,
          listings: listings.length,
          inboxItems: inboxItems.length,
        },
        createdAt: now,
      }),
    ]);
  } catch (error) {
    logger.error("Contact deletion propagation failed", { jobId, ...acquired, error });
    if (acquired.attempts < 3) {
      await jobRef.update({ status: "queued", errorCode: "deletion_retry", updatedAt: Timestamp.now() });
      throw error;
    }
    const now = Timestamp.now();
    await Promise.all([
      jobRef.update({ status: "failed", errorCode: "deletion_failed", updatedAt: now }),
      firestore.collection("dataSubjectRequests").doc(acquired.requestId).update({ status: "failed", updatedAt: now }),
    ]);
  }
}

export const processDeletionJob = onDocumentCreated(
  { document: "deletionJobs/{jobId}", region: "europe-west8", retry: true, memory: "512MiB", timeoutSeconds: 300 },
  async (event) => processDeletion(event.params.jobId),
);
