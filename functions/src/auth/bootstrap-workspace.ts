import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { officeInviteCodeSchema } from "../../../packages/shared/src/index.js";

interface BootstrapWorkspaceInput {
  displayName?: unknown;
  inviteCode?: unknown;
}

interface WorkspaceIdentity {
  officeId: string;
  role: "agent" | "broker";
}

function normalizeDisplayName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 120) {
    throw new HttpsError("invalid-argument", "Display name must contain 2–120 characters.");
  }
  return normalized;
}

export const bootstrapWorkspace = onCall<BootstrapWorkspaceInput>(
  {
    region: "europe-west8",
    cors: true,
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request): Promise<WorkspaceIdentity> => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");

    const envelope = readApiEnvelope<{ displayName?: unknown; inviteCode?: unknown }>(request.data, { command: true });
    return observeApiRequest("bootstrapWorkspace", envelope.requestId, async () => {
    const uid = request.auth!.uid;
    const email = typeof request.auth!.token.email === "string" ? request.auth!.token.email : "Spherepath kullanıcısı";
    const fallbackName = typeof request.auth!.token.name === "string"
      ? request.auth!.token.name
      : email.split("@")[0] || "Spherepath kullanıcısı";
    const displayName = normalizeDisplayName(envelope.data?.displayName, fallbackName);
    const rawInviteCode = envelope.data?.inviteCode;
    const parsedInviteCode = rawInviteCode === undefined || rawInviteCode === "" ? null : officeInviteCodeSchema.safeParse(rawInviteCode);
    if (parsedInviteCode && !parsedInviteCode.success) throw new HttpsError("invalid-argument", "Office invite code is invalid.", parsedInviteCode.error.flatten());
    const inviteCode = parsedInviteCode?.success ? parsedInviteCode.data : null;
    const firestore = getFirestore();
    const userRef = firestore.collection("users").doc(uid);
    const defaultOfficeRef = firestore.collection("offices").doc(`personal-${uid}`);

    const identity = await firestore.runTransaction(async (transaction): Promise<WorkspaceIdentity> => {
      const userSnapshot = await transaction.get(userRef);
      if (userSnapshot.exists) {
        const data = userSnapshot.data();
        if (
          typeof data?.officeId !== "string" ||
          (data.role !== "agent" && data.role !== "broker")
        ) {
          throw new HttpsError("failed-precondition", "Workspace membership is invalid.");
        }
        const role = data.officeId === `personal-${uid}` && data.role === "agent" ? "broker" : data.role;
        if (displayName !== data.displayName || data.email !== email || role !== data.role) {
          transaction.update(userRef, { displayName, email, role, updatedAt: Timestamp.now() });
        }
        return { officeId: data.officeId, role };
      }

      const now = Timestamp.now();
      if (inviteCode) {
        const inviteRef = firestore.collection("officeInvites").doc(inviteCode);
        const inviteSnapshot = await transaction.get(inviteRef);
        if (!inviteSnapshot.exists) throw new HttpsError("not-found", "Davet kodu bulunamadı.");
        const invite = inviteSnapshot.data()!;
        if (invite.status !== "active" || !(invite.expiresAt instanceof Timestamp) || invite.expiresAt.toMillis() <= now.toMillis()) {
          throw new HttpsError("failed-precondition", "Davet kodunun süresi dolmuş veya daha önce kullanılmış.");
        }
        const invitedOfficeId = invite.officeId as string;
        const invitedOffice = await transaction.get(firestore.collection("offices").doc(invitedOfficeId));
        if (!invitedOffice.exists) throw new HttpsError("failed-precondition", "Invited office workspace is incomplete.");
        transaction.create(userRef, {
          officeId: invitedOfficeId,
          role: "agent",
          displayName,
          email,
          phone: null,
          defaultRegions: [],
          monthlyPortfolioTarget: null,
          weeklyCapacity: null,
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        transaction.update(inviteRef, { status: "used", usedByUid: uid, usedAt: now });
        return { officeId: invitedOfficeId, role: "agent" };
      }
      transaction.create(defaultOfficeRef, {
        name: `${displayName} çalışma alanı`,
        ownerUid: uid,
        country: "TR",
        retentionPolicyVersion: "v1",
        createdAt: now,
      });
      transaction.create(userRef, {
        officeId: defaultOfficeRef.id,
        role: "broker",
        displayName,
        email,
        phone: null,
        defaultRegions: [],
        monthlyPortfolioTarget: null,
        weeklyCapacity: null,
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return { officeId: defaultOfficeRef.id, role: "broker" };
    });

    const auth = getAuth();
    const authUser = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, {
      ...(authUser.customClaims ?? {}),
      officeId: identity.officeId,
      role: identity.role,
    });

    return identity;
    });
  },
);
