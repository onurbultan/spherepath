import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { buildFunnelCoaching, reportingPeriodSchema, type FunnelOverview, type ReportingPeriod } from "../../../packages/shared/src/index.js";
import { requireSpherepathClaims } from "../auth/claims.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";

const periodDays: Record<ReportingPeriod, number> = { "30d": 30, "90d": 90, "1y": 365 };
const millis = (value: unknown): number | null => value instanceof Timestamp ? value.toMillis() : null;

export const getFunnelOverview = onCall(
  { region: "europe-west8", cors: true, maxInstances: 10, memory: "256MiB", timeoutSeconds: 60 },
  async (request): Promise<{ overview: FunnelOverview }> => {
    const claims = requireSpherepathClaims(request);
    const envelope = readApiEnvelope<{ period?: unknown }>(request.data);
    const parsed = reportingPeriodSchema.safeParse(envelope.data?.period ?? "30d");
    if (!parsed.success) throw new HttpsError("invalid-argument", "Reporting period is invalid.");
    return observeApiRequest("getFunnelOverview", envelope.requestId, async () => {
      const db = getFirestore(); const windowStart = Date.now() - periodDays[parsed.data] * 86_400_000;
      const scoped = (collection: string) => {
        let query: FirebaseFirestore.Query = db.collection(collection).where("officeId", "==", claims.officeId);
        if (claims.role !== "broker") query = query.where("ownerUid", "==", claims.uid);
        return query;
      };
      const [contacts, opportunities, listings, deals, events] = await Promise.all([
        scoped("contacts").limit(500).get(), scoped("opportunities").limit(500).get(), scoped("listings").limit(500).get(), scoped("deals").limit(500).get(), scoped("stageEvents").limit(1_000).get(),
      ]);
      const active = (data: FirebaseFirestore.DocumentData) => data.deletedAt === null || data.deletedAt === undefined;
      const eventDocs = events.docs.filter((doc) => (millis(doc.data().occurredAt) ?? 0) >= windowStart);
      const uniqueEvents = (entityType: string, stages: readonly string[]) => new Set(eventDocs.filter((doc) => doc.data().entityType === entityType && stages.includes(doc.data().toStage as string)).map((doc) => doc.data().entityId as string)).size;
      const counts = {
        newPeople: contacts.docs.filter((doc) => active(doc.data()) && (millis(doc.data().createdAt) ?? 0) >= windowStart).length,
        leads: new Set([
          ...opportunities.docs.filter((doc) => active(doc.data()) && (millis(doc.data().createdAt) ?? 0) >= windowStart).map((doc) => doc.id),
          ...eventDocs.filter((doc) => doc.data().entityType === "opportunity" && doc.data().toStage === "new_lead").map((doc) => doc.data().entityId as string),
        ]).size,
        appointments: uniqueEvents("opportunity", ["appointment", "valuation", "mandate_offer", "won"]),
        portfolioMeetings: uniqueEvents("opportunity", ["valuation", "mandate_offer", "won"]),
        authorizedListings: new Set([
          ...listings.docs.filter((doc) => active(doc.data()) && (millis(doc.data().acquiredAt) ?? millis(doc.data().createdAt) ?? 0) >= windowStart).map((doc) => doc.id),
          ...eventDocs.filter((doc) => doc.data().entityType === "listing" && ["preparing", "active"].includes(doc.data().toStage as string)).map((doc) => doc.data().entityId as string),
        ]).size,
        negotiations: uniqueEvents("deal", ["offer", "contract"]),
        closings: deals.docs.filter((doc) => active(doc.data()) && doc.data().stage === "closed" && (millis(doc.data().closedAt) ?? 0) >= windowStart).length,
      };
      return { overview: { period: parsed.data, counts, coaching: buildFunnelCoaching(counts) } };
    });
  },
);
