import { randomBytes } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  joinOfficeSchema,
  type OfficeInviteView,
  type OfficeMemberView,
  type OfficeTeamView,
} from "../../../packages/shared/src/index.js";
import { observeApiRequest, readApiEnvelope } from "../api/request.js";
import { requireSpherepathClaims } from "./claims.js";

const callableOptions = { region: "europe-west8" as const, cors: true, maxInstances: 10, memory: "256MiB" as const, timeoutSeconds: 60 };
const inviteAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ownedDataCollections = [
  "contacts", "interactions", "voiceNotes", "opportunities", "properties", "listings",
  "portfolioItems", "referrals", "presentations", "deals", "dataSubjectRequests",
] as const;

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function inviteCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => inviteAlphabet[byte % inviteAlphabet.length]).join("");
}

function canInvite(claims: ReturnType<typeof requireSpherepathClaims>, office: DocumentData): boolean {
  return claims.role === "broker" || office.ownerUid === claims.uid || claims.officeId === `personal-${claims.uid}`;
}

async function setWorkspaceClaims(uid: string, officeId: string, role: "agent" | "broker") {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...(user.customClaims ?? {}), officeId, role });
}

async function hasOwnedWorkspaceData(uid: string): Promise<boolean> {
  const firestore = getFirestore();
  const snapshots = await Promise.all(ownedDataCollections.map((collection) =>
    firestore.collection(collection).where("ownerUid", "==", uid).limit(1).get()
  ));
  return snapshots.some((snapshot) => !snapshot.empty);
}

export const getOfficeTeam = onCall(callableOptions, async (request): Promise<{ team: OfficeTeamView }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<undefined>(request.data);
  return observeApiRequest("getOfficeTeam", envelope.requestId, async () => {
    const firestore = getFirestore();
    const [officeSnapshot, membersSnapshot, ownsData] = await Promise.all([
      firestore.collection("offices").doc(claims.officeId).get(),
      firestore.collection("users").where("officeId", "==", claims.officeId).limit(200).get(),
      hasOwnedWorkspaceData(claims.uid),
    ]);
    if (!officeSnapshot.exists) throw new HttpsError("failed-precondition", "Office workspace is incomplete.");
    const office = officeSnapshot.data()!;
    const members: OfficeMemberView[] = membersSnapshot.docs.map((document) => {
      const data = document.data();
      return {
        uid: document.id,
        displayName: typeof data.displayName === "string" ? data.displayName : "Spherepath kullanıcısı",
        role: data.role === "broker" ? "broker" as const : "agent" as const,
        joinedAt: millis(data.joinedAt ?? data.createdAt),
      };
    }).sort((left, right) => left.displayName.localeCompare(right.displayName, "tr"));
    const inviteAllowed = canInvite(claims, office);
    const activeInvites: OfficeInviteView[] = inviteAllowed
      ? (await firestore.collection("officeInvites").where("officeId", "==", claims.officeId).limit(50).get()).docs
        .filter((document) => document.data().status === "active" && document.data().expiresAt instanceof Timestamp && document.data().expiresAt.toMillis() > Date.now())
        .map((document) => ({
          code: document.id,
          officeId: claims.officeId,
          officeName: typeof document.data().officeName === "string" ? document.data().officeName : "Spherepath ofisi",
          role: "agent" as const,
          expiresAt: millis(document.data().expiresAt) ?? 0,
        }))
        .sort((left, right) => left.expiresAt - right.expiresAt)
      : [];
    return { team: {
      officeId: claims.officeId,
      officeName: typeof office.name === "string" ? office.name : "Spherepath ofisi",
      canInvite: inviteAllowed,
      canJoinOffice: claims.officeId === `personal-${claims.uid}` && members.length === 1 && !ownsData,
      members,
      activeInvites,
    } };
  });
});

export const createOfficeInvite = onCall(callableOptions, async (request): Promise<{ invite: OfficeInviteView }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<undefined>(request.data, { command: true });
  return observeApiRequest("createOfficeInvite", envelope.requestId, async () => {
    const firestore = getFirestore();
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const existingReceipt = await commandRef.get();
    if (existingReceipt.exists) {
      const data = existingReceipt.data()!;
      if (data.ownerUid !== claims.uid || data.type !== "createOfficeInvite") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
      const inviteSnapshot = await firestore.collection("officeInvites").doc(data.code as string).get();
      if (!inviteSnapshot.exists) throw new HttpsError("not-found", "Office invite was not found.");
      const invite = inviteSnapshot.data()!;
      return { invite: { code: inviteSnapshot.id, officeId: invite.officeId as string, officeName: invite.officeName as string, role: "agent", expiresAt: millis(invite.expiresAt) ?? 0 } };
    }

    const code = inviteCode();
    const inviteRef = firestore.collection("officeInvites").doc(code);
    const officeRef = firestore.collection("offices").doc(claims.officeId);
    const userRef = firestore.collection("users").doc(claims.uid);
    const invite = await firestore.runTransaction(async (transaction): Promise<OfficeInviteView> => {
      const [officeSnapshot, userSnapshot, collision] = await Promise.all([
        transaction.get(officeRef), transaction.get(userRef), transaction.get(inviteRef),
      ]);
      if (!officeSnapshot.exists || !userSnapshot.exists) throw new HttpsError("failed-precondition", "Office workspace is incomplete.");
      if (collision.exists) throw new HttpsError("aborted", "Invite code collision. Please retry.");
      const office = officeSnapshot.data()!;
      if (!canInvite(claims, office)) throw new HttpsError("permission-denied", "Only the office owner can invite teammates.");
      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + 7 * 86_400_000);
      const officeName = typeof office.name === "string" ? office.name : "Spherepath ofisi";
      transaction.create(inviteRef, {
        officeId: claims.officeId,
        officeName,
        role: "agent",
        createdByUid: claims.uid,
        status: "active",
        expiresAt,
        createdAt: now,
        usedAt: null,
        usedByUid: null,
      });
      if (claims.officeId === `personal-${claims.uid}` && userSnapshot.data()!.role !== "broker") {
        transaction.update(userRef, { role: "broker", updatedAt: now });
        transaction.update(officeRef, { ownerUid: claims.uid, updatedAt: now });
      }
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "createOfficeInvite", code, createdAt: now });
      return { code, officeId: claims.officeId, officeName, role: "agent", expiresAt: expiresAt.toMillis() };
    });
    await setWorkspaceClaims(claims.uid, claims.officeId, "broker");
    return { invite };
  });
});

export const joinOffice = onCall(callableOptions, async (request): Promise<{ officeId: string; role: "agent" }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = joinOfficeSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Office invite code is invalid.", parsed.error.flatten());
  return observeApiRequest("joinOffice", envelope.requestId, async () => {
    const firestore = getFirestore();
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    const receipt = await commandRef.get();
    if (receipt.exists) {
      const data = receipt.data()!;
      if (data.ownerUid !== claims.uid || data.type !== "joinOffice") throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
      const targetOfficeId = data.targetOfficeId as string;
      await setWorkspaceClaims(claims.uid, targetOfficeId, "agent");
      return { officeId: targetOfficeId, role: "agent" };
    }
    if (claims.officeId !== `personal-${claims.uid}`) throw new HttpsError("failed-precondition", "Bu hesap zaten bir ofise bağlı.");
    if (await hasOwnedWorkspaceData(claims.uid)) throw new HttpsError("failed-precondition", "Mevcut çalışma alanında kayıtlar var. Veri kaybını önlemek için ofis katılımı durduruldu.");

    const inviteRef = firestore.collection("officeInvites").doc(parsed.data.code);
    const userRef = firestore.collection("users").doc(claims.uid);
    const targetOfficeId = await firestore.runTransaction(async (transaction): Promise<string> => {
      const [inviteSnapshot, userSnapshot] = await Promise.all([transaction.get(inviteRef), transaction.get(userRef)]);
      if (!inviteSnapshot.exists) throw new HttpsError("not-found", "Davet kodu bulunamadı.");
      if (!userSnapshot.exists) throw new HttpsError("failed-precondition", "Kullanıcı çalışma alanı eksik.");
      const invite = inviteSnapshot.data()!;
      if (invite.status !== "active" || !(invite.expiresAt instanceof Timestamp) || invite.expiresAt.toMillis() <= Date.now()) {
        throw new HttpsError("failed-precondition", "Davet kodunun süresi dolmuş veya daha önce kullanılmış.");
      }
      const officeId = invite.officeId as string;
      const now = Timestamp.now();
      transaction.update(userRef, { officeId, role: "agent", joinedAt: now, updatedAt: now });
      transaction.update(inviteRef, { status: "used", usedByUid: claims.uid, usedAt: now });
      transaction.create(commandRef, {
        officeId: claims.officeId,
        targetOfficeId: officeId,
        ownerUid: claims.uid,
        type: "joinOffice",
        code: parsed.data.code,
        createdAt: now,
      });
      return officeId;
    });
    await setWorkspaceClaims(claims.uid, targetOfficeId, "agent");
    return { officeId: targetOfficeId, role: "agent" };
  });
});

export const revokeOfficeInvite = onCall(callableOptions, async (request): Promise<{ code: string }> => {
  const claims = requireSpherepathClaims(request);
  const envelope = readApiEnvelope<unknown>(request.data, { command: true });
  const parsed = joinOfficeSchema.safeParse(envelope.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Office invite code is invalid.", parsed.error.flatten());
  return observeApiRequest("revokeOfficeInvite", envelope.requestId, async () => {
    const firestore = getFirestore();
    const officeRef = firestore.collection("offices").doc(claims.officeId);
    const inviteRef = firestore.collection("officeInvites").doc(parsed.data.code);
    const commandRef = firestore.collection("commands").doc(envelope.commandId!);
    await firestore.runTransaction(async (transaction) => {
      const [receipt, officeSnapshot, inviteSnapshot] = await Promise.all([
        transaction.get(commandRef), transaction.get(officeRef), transaction.get(inviteRef),
      ]);
      if (receipt.exists) {
        const data = receipt.data()!;
        if (data.ownerUid !== claims.uid || data.type !== "revokeOfficeInvite" || data.code !== parsed.data.code) throw new HttpsError("permission-denied", "Command receipt is outside your workspace.");
        return;
      }
      if (!officeSnapshot.exists) throw new HttpsError("failed-precondition", "Office workspace is incomplete.");
      if (!canInvite(claims, officeSnapshot.data()!)) throw new HttpsError("permission-denied", "Only the office owner can revoke invitations.");
      if (!inviteSnapshot.exists || inviteSnapshot.data()!.officeId !== claims.officeId) throw new HttpsError("not-found", "Office invite was not found.");
      if (inviteSnapshot.data()!.status !== "active") throw new HttpsError("failed-precondition", "Office invite is no longer active.");
      const now = Timestamp.now();
      transaction.update(inviteRef, { status: "revoked", revokedByUid: claims.uid, revokedAt: now });
      transaction.create(commandRef, { officeId: claims.officeId, ownerUid: claims.uid, type: "revokeOfficeInvite", code: parsed.data.code, createdAt: now });
    });
    return { code: parsed.data.code };
  });
});
