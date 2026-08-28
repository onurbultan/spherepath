import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  workspaceSettingsSchema,
  type WorkspaceSettingsDraft,
  type WorkspaceSettingsView,
} from "../../../packages/shared/src/index.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims } from "../auth/claims.js";

const callableOptions = { region: "europe-west8" as const, cors: true, maxInstances: 10, memory: "256MiB" as const, timeoutSeconds: 60 };

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function view(
  officeId: string,
  role: "agent" | "broker",
  user: DocumentData,
  office: DocumentData,
): WorkspaceSettingsView {
  const notification = (user.notificationPreferences ?? {}) as DocumentData;
  const compliance = (office.compliance ?? {}) as DocumentData;
  return {
    officeId,
    role,
    displayName: typeof user.displayName === "string" ? user.displayName : "Spherepath kullanıcısı",
    phone: typeof user.phone === "string" ? user.phone : "",
    defaultRegions: Array.isArray(user.defaultRegions) ? user.defaultRegions : [],
    monthlyPortfolioTarget: typeof user.monthlyPortfolioTarget === "number" ? user.monthlyPortfolioTarget : null,
    weeklyCapacity: typeof user.weeklyCapacity === "number" ? user.weeklyCapacity : null,
    country: office.country === "TRNC" ? "TRNC" : "TR",
    dataControllerName: typeof compliance.dataControllerName === "string" ? compliance.dataControllerName : office.name as string,
    verbisStatus: ["exempt", "registered"].includes(compliance.verbisStatus as string) ? compliance.verbisStatus : "unknown",
    trncFilingConfirmed: compliance.trncFilingConfirmedAt instanceof Timestamp,
    trncTransferLicenseConfirmed: compliance.trncTransferLicenseConfirmedAt instanceof Timestamp,
    dailyPlanReminderEnabled: notification.dailyPlanEnabled === true,
    dailyPlanReminderHour: typeof notification.dailyPlanHour === "number" ? notification.dailyPlanHour : 8,
    dailyPlanReminderMinute: typeof notification.dailyPlanMinute === "number" ? notification.dailyPlanMinute : 30,
    retentionPolicyVersion: typeof office.retentionPolicyVersion === "string" ? office.retentionPolicyVersion : "v1",
    trncFilingConfirmedAt: millis(compliance.trncFilingConfirmedAt),
    trncTransferLicenseConfirmedAt: millis(compliance.trncTransferLicenseConfirmedAt),
    updatedAt: Math.max(millis(user.updatedAt) ?? 0, millis(office.updatedAt) ?? 0),
  };
}

export const getWorkspaceSettings = onCall(callableOptions, async (request): Promise<{ settings: WorkspaceSettingsView }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<undefined>(request.data);
  return observeApiRequest("getWorkspaceSettings", envelope.requestId, async () => {
    const firestore = getFirestore();
    const [userSnapshot, officeSnapshot] = await Promise.all([
      firestore.collection("users").doc(claims.uid).get(),
      firestore.collection("offices").doc(claims.officeId).get(),
    ]);
    if (!userSnapshot.exists || !officeSnapshot.exists) throw new HttpsError("failed-precondition", "Workspace settings are incomplete.");
    return { settings: view(claims.officeId, claims.role, userSnapshot.data()!, officeSnapshot.data()!) };
  });
});

export const updateWorkspaceSettings = onCall(callableOptions, async (request): Promise<{ settings: WorkspaceSettingsView }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = workspaceSettingsSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Workspace settings are invalid.", parsed.error.flatten());
  const input: WorkspaceSettingsDraft = parsed.data;
  const firestore = getFirestore();
  const userRef = firestore.collection("users").doc(claims.uid);
  const officeRef = firestore.collection("offices").doc(claims.officeId);
  const commandRef = firestore.collection("commands").doc(envelope.commandId!);

  await observeApiRequest("updateWorkspaceSettings", envelope.requestId, () => firestore.runTransaction(async (transaction) => {
    const [receipt, userSnapshot, officeSnapshot] = await Promise.all([
      transaction.get(commandRef), transaction.get(userRef), transaction.get(officeRef),
    ]);
    if (receipt.exists) {
      const data = receipt.data()!;
      if (data.officeId !== claims.officeId || data.ownerUid !== claims.uid || data.type !== "updateWorkspaceSettings") {
        throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
      }
      return;
    }
    if (!userSnapshot.exists || !officeSnapshot.exists) throw new HttpsError("failed-precondition", "Workspace settings are incomplete.");
    if (claims.role !== "broker" && claims.officeId !== `personal-${claims.uid}` && officeSnapshot.data()!.country !== input.country) {
      throw new HttpsError("permission-denied", "Only a broker can change the office country.");
    }
    const now = Timestamp.now();
    const previousCompliance = (officeSnapshot.data()!.compliance ?? {}) as DocumentData;
    transaction.update(userRef, {
      displayName: input.displayName,
      phone: input.phone || null,
      defaultRegions: input.defaultRegions,
      monthlyPortfolioTarget: input.monthlyPortfolioTarget,
      weeklyCapacity: input.weeklyCapacity,
      notificationPreferences: {
        dailyPlanEnabled: input.dailyPlanReminderEnabled,
        dailyPlanHour: input.dailyPlanReminderHour,
        dailyPlanMinute: input.dailyPlanReminderMinute,
      },
      updatedAt: now,
    });
    transaction.update(officeRef, {
      country: input.country,
      compliance: {
        dataControllerName: input.dataControllerName,
        verbisStatus: input.verbisStatus,
        trncFilingConfirmedAt: input.country === "TRNC" && input.trncFilingConfirmed
          ? previousCompliance.trncFilingConfirmedAt ?? now
          : null,
        trncTransferLicenseConfirmedAt: input.country === "TRNC" && input.trncTransferLicenseConfirmed
          ? previousCompliance.trncTransferLicenseConfirmedAt ?? now
          : null,
      },
      updatedAt: now,
    });
    transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "updateWorkspaceSettings", createdAt: now });
  }));

  await getAuth().updateUser(claims.uid, { displayName: input.displayName });
  const [userSnapshot, officeSnapshot] = await Promise.all([userRef.get(), officeRef.get()]);
  return { settings: view(claims.officeId, claims.role, userSnapshot.data()!, officeSnapshot.data()!) };
});
