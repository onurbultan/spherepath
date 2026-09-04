import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { buildEarningsSummary, buildFunnelCoaching, buildFunnelMetrics, buildFunnelTargetProgress, opportunityStageLabel, reportingPeriodSchema, type ContactSource, type CurrencyCode, type DealStage, type EarningsDeal, type FunnelClosedDeal, type FunnelCoachingSubject, type FunnelInteraction, type FunnelOverview, type FunnelStageEvent, type FunnelSubjects, type OpportunityStage, type OpportunityType, type ReportingPeriod } from "../../../packages/shared/src/index.js";
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
      const [contacts, opportunities, listings, deals, events, interactions, advisor] = await Promise.all([
        scoped("contacts").limit(1_000).get(), scoped("opportunities").limit(1_000).get(), scoped("listings").limit(1_000).get(), scoped("deals").limit(1_000).get(), scoped("stageEvents").limit(5_000).get(),
        scoped("interactions").limit(2_000).get(),
        db.collection("users").doc(claims.uid).get(),
      ]);
      const active = (data: FirebaseFirestore.DocumentData) => data.deletedAt === null || data.deletedAt === undefined;
      const eventDocs = events.docs.filter((doc) => (millis(doc.data().occurredAt) ?? 0) >= windowStart);
      const uniqueEvents = (entityType: string, stages: readonly string[]) => new Set(eventDocs.filter((doc) => doc.data().entityType === entityType && stages.includes(doc.data().toStage as string)).map((doc) => doc.data().entityId as string)).size;
      const verifiedListingIds = new Set(listings.docs
        .filter((doc) => active(doc.data()) && doc.data().authorizationType !== "unknown")
        .map((doc) => doc.id));
      const counts = {
        newPeople: contacts.docs.filter((doc) => active(doc.data()) && (millis(doc.data().createdAt) ?? 0) >= windowStart).length,
        leads: new Set([
          ...opportunities.docs.filter((doc) => active(doc.data()) && (millis(doc.data().createdAt) ?? 0) >= windowStart).map((doc) => doc.id),
          ...eventDocs.filter((doc) => doc.data().entityType === "opportunity" && doc.data().toStage === "new_lead").map((doc) => doc.data().entityId as string),
        ]).size,
        appointments: uniqueEvents("opportunity", ["appointment", "valuation", "mandate_offer", "won"]),
        portfolioMeetings: uniqueEvents("opportunity", ["valuation", "mandate_offer", "won"]),
        authorizedListings: new Set([
          ...listings.docs.filter((doc) => verifiedListingIds.has(doc.id) && (millis(doc.data().acquiredAt) ?? millis(doc.data().createdAt) ?? 0) >= windowStart).map((doc) => doc.id),
          ...eventDocs.filter((doc) => doc.data().entityType === "listing" && verifiedListingIds.has(doc.data().entityId as string) && ["preparing", "active"].includes(doc.data().toStage as string)).map((doc) => doc.data().entityId as string),
        ]).size,
        negotiations: uniqueEvents("deal", ["offer", "contract"]),
        closings: deals.docs.filter((doc) => active(doc.data()) && doc.data().stage === "closed" && (millis(doc.data().closedAt) ?? 0) >= windowStart).length,
      };
      const earningsDeals: EarningsDeal[] = deals.docs.filter((doc) => active(doc.data())).map((doc) => {
        const data = doc.data();
        return {
          stage: data.stage as DealStage,
          offerAmount: typeof data.offerAmount === "number" ? data.offerAmount : null,
          actualAmount: typeof data.actualAmount === "number" ? data.actualAmount : null,
          commissionAmount: typeof data.commissionAmount === "number" ? data.commissionAmount : null,
          currency: typeof data.currency === "string" ? data.currency as CurrencyCode : null,
          closedAt: millis(data.closedAt),
        };
      });
      // The advice used to say "1 randevuya rağmen…" without naming which one. These
      // candidates let each branch point at the record the advisor should open.
      const daysSince = (value: number | null): number => value === null ? 0 : Math.max(0, Math.round((Date.now() - value) / 86_400_000));
      const contactName = (doc: FirebaseFirestore.QueryDocumentSnapshot): string => (doc.data().fullName ?? doc.data().label ?? "İsimsiz kişi") as string;
      const activeOpportunities = opportunities.docs
        .filter((doc) => active(doc.data()) && doc.data().stage !== "lost" && doc.data().stage !== "won")
        .sort((left, right) => (millis(left.data().stageEnteredAt) ?? 0) - (millis(right.data().stageEnteredAt) ?? 0));
      const contactNames = new Map(contacts.docs.map((doc) => [doc.id, contactName(doc)]));
      const opportunitySubject = (stages: readonly string[]): FunnelCoachingSubject | null => {
        const found = activeOpportunities.find((doc) => stages.includes(doc.data().stage as string));
        if (!found) return null;
        const stage = found.data().stage as OpportunityStage;
        const type = found.data().type as OpportunityType;
        return {
          kind: "opportunity", id: found.id,
          name: contactNames.get(found.data().subjectContactId as string) ?? "İsimsiz kişi",
          detail: `${daysSince(millis(found.data().stageEnteredAt))} gündür ${opportunityStageLabel(stage, type).toLocaleLowerCase("tr-TR")} aşamasında`,
          opportunityType: type,
          introduced: typeof found.data().sourceContactId === "string" || typeof found.data().referralId === "string",
        };
      };
      const contactsWithOpportunity = new Set(activeOpportunities.map((doc) => doc.data().subjectContactId as string));
      const newestUncontacted = contacts.docs
        .filter((doc) => active(doc.data()) && !contactsWithOpportunity.has(doc.id))
        .sort((left, right) => (millis(right.data().createdAt) ?? 0) - (millis(left.data().createdAt) ?? 0))[0];
      const oldestListing = listings.docs
        .filter((doc) => active(doc.data()) && ["active", "reserved"].includes(doc.data().status as string))
        .sort((left, right) => (millis(left.data().acquiredAt) ?? millis(left.data().createdAt) ?? 0) - (millis(right.data().acquiredAt) ?? millis(right.data().createdAt) ?? 0))[0];
      const oldestUnreadyListing = listings.docs
        .filter((doc) => active(doc.data()) && (doc.data().status === "preparing" || doc.data().authorizationType === "unknown" || !(typeof doc.data().askingPrice === "number" && doc.data().askingPrice > 0)))
        .sort((left, right) => (millis(left.data().acquiredAt) ?? millis(left.data().createdAt) ?? 0) - (millis(right.data().acquiredAt) ?? millis(right.data().createdAt) ?? 0))[0];
      const subjects: FunnelSubjects = {
        newestUncontactedContact: newestUncontacted
          ? { kind: "contact", id: newestUncontacted.id, name: contactName(newestUncontacted), detail: `${daysSince(millis(newestUncontacted.data().createdAt))} gündür talebi yok` }
          : null,
        oldestOpportunityWithoutAppointment: opportunitySubject(["new_lead", "first_contact"]),
        oldestAppointmentWithoutMandate: opportunitySubject(["appointment", "valuation"]),
        oldestUnreadyListing: oldestUnreadyListing
          ? { kind: "listing", id: oldestUnreadyListing.id, name: (oldestUnreadyListing.data().propertySummary?.address as string) ?? "Portföy", detail: typeof oldestUnreadyListing.data().askingPrice === "number" ? "hazırlanıyor" : "fiyat bekliyor" }
          : null,
        oldestActiveListing: oldestListing
          ? { kind: "listing", id: oldestListing.id, name: (oldestListing.data().propertySummary?.address as string) ?? "Portföy", detail: `${daysSince(millis(oldestListing.data().acquiredAt) ?? millis(oldestListing.data().createdAt))} gündür portföyde` }
          : null,
      };

      const monthlyTarget = typeof advisor.data()?.monthlyPortfolioTarget === "number" ? advisor.data()!.monthlyPortfolioTarget as number : null;

      const contactSources = new Map(contacts.docs.map((doc) => [doc.id, (doc.data().source ?? null) as ContactSource | null]));
      const metricEvents: FunnelStageEvent[] = events.docs.map((doc) => {
        const data = doc.data();
        return {
          entityType: data.entityType as string,
          entityId: data.entityId as string,
          fromStage: (data.fromStage ?? null) as string | null,
          toStage: data.toStage as string,
          occurredAt: millis(data.occurredAt) ?? 0,
          correction: data.correction === true,
        };
      });
      const metricInteractions: FunnelInteraction[] = interactions.docs.map((doc) => {
        const data = doc.data();
        return {
          contactId: data.contactId as string,
          channel: data.channel,
          objective: data.objective,
          askOutcome: data.askOutcome,
          occurredAt: millis(data.occurredAt) ?? 0,
          nextActionAt: millis(data.nextActionAt),
        };
      });
      const metricLostReasons = opportunities.docs
        .filter((doc) => active(doc.data()) && doc.data().stage === "lost")
        .map((doc) => (doc.data().lostReason ?? null) as string | null);
      const metricDeals: FunnelClosedDeal[] = deals.docs.filter((doc) => active(doc.data()) && doc.data().stage === "closed").map((doc) => {
        const data = doc.data();
        return {
          buyerSource: typeof data.buyerContactId === "string" ? contactSources.get(data.buyerContactId) ?? null : null,
          commissionAmount: typeof data.commissionAmount === "number" ? data.commissionAmount : null,
          currency: typeof data.currency === "string" ? data.currency as CurrencyCode : null,
          closedAt: millis(data.closedAt),
        };
      });
      return {
        overview: {
          period: parsed.data,
          counts,
          coaching: buildFunnelCoaching(counts, subjects),
          earnings: buildEarningsSummary(earningsDeals, parsed.data, Date.now()),
          target: buildFunnelTargetProgress(counts, parsed.data, monthlyTarget),
          metrics: buildFunnelMetrics(metricEvents, metricInteractions, metricLostReasons, metricDeals, parsed.data, Date.now()),
        },
      };
    });
  },
);
