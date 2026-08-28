import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

interface BootstrapWorkspaceInput {
  displayName?: unknown;
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

    const uid = request.auth.uid;
    const email = typeof request.auth.token.email === "string" ? request.auth.token.email : "Spherepath kullanıcısı";
    const fallbackName = typeof request.auth.token.name === "string"
      ? request.auth.token.name
      : email.split("@")[0] || "Spherepath kullanıcısı";
    const displayName = normalizeDisplayName(request.data?.displayName, fallbackName);
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
        if (displayName !== data.displayName) {
          transaction.update(userRef, { displayName, updatedAt: Timestamp.now() });
        }
        return { officeId: data.officeId, role: data.role };
      }

      const now = Timestamp.now();
      transaction.create(defaultOfficeRef, {
        name: `${displayName} çalışma alanı`,
        country: "TR",
        retentionPolicyVersion: "v1",
        createdAt: now,
      });
      transaction.create(userRef, {
        officeId: defaultOfficeRef.id,
        role: "agent",
        displayName,
        phone: null,
        defaultRegions: [],
        monthlyPortfolioTarget: null,
        weeklyCapacity: null,
        createdAt: now,
        updatedAt: now,
      });
      return { officeId: defaultOfficeRef.id, role: "agent" };
    });

    const auth = getAuth();
    const authUser = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, {
      ...(authUser.customClaims ?? {}),
      officeId: identity.officeId,
      role: identity.role,
    });

    return identity;
  },
);
