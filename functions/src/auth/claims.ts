import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

export interface SpherepathClaims {
  uid: string;
  officeId: string;
  role: "agent" | "broker";
}

export function requireSpherepathClaims(request: CallableRequest<unknown>): SpherepathClaims {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");

  const officeId = request.auth.token.officeId;
  const role = request.auth.token.role;
  if (typeof officeId !== "string" || (role !== "agent" && role !== "broker")) {
    throw new HttpsError("permission-denied", "Spherepath office claims are missing.");
  }

  return { uid: request.auth.uid, officeId, role };
}
