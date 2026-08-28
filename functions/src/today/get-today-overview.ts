import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { buildTodayOverview, type OpportunityStage, type TodayOverview } from "../../../packages/shared/src/index";
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
    const envelope = readApiEnvelope<undefined>(request.data);
    return observeApiRequest("getTodayOverview", envelope.requestId, async () => {
    const firestore = getFirestore();
    let contactsQuery: FirebaseFirestore.Query = firestore.collection("contacts").where("officeId", "==", claims.officeId);
    let opportunitiesQuery: FirebaseFirestore.Query = firestore.collection("opportunities").where("officeId", "==", claims.officeId);
    if (claims.role !== "broker") {
      contactsQuery = contactsQuery.where("ownerUid", "==", claims.uid);
      opportunitiesQuery = opportunitiesQuery.where("ownerUid", "==", claims.uid);
    }

    const [contactsSnapshot, opportunitiesSnapshot] = await Promise.all([
      contactsQuery.limit(200).get(),
      opportunitiesQuery.limit(200).get(),
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
    const opportunities = opportunitiesSnapshot.docs
      .map((item) => {
        const data = item.data();
        return {
          id: item.id,
          stage: data.stage as OpportunityStage,
          nextActionAt: millis(data.nextActionAt),
          deletedAt: millis(data.deletedAt),
        };
      })
      .filter((opportunity) => opportunity.deletedAt === null);

    return { overview: buildTodayOverview(contacts, opportunities, Date.now()) };
    });
  },
);
