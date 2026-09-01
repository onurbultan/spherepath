import { createHash } from "node:crypto";
import { normalizePhone } from "../../../packages/shared/src/index";

/**
 * A contact saved by hand and a caller arriving from the switch have to resolve
 * to the same key, so both sides normalise to E.164 and hash the result. The
 * digest is a lookup key rather than a privacy measure -- the dialled number is
 * stored beside it -- so it carries no salt and stays comparable.
 */
export function phoneLookupHash(raw: string | null | undefined): string | null {
  const normalized = normalizePhone(raw);
  return normalized ? createHash("sha256").update(normalized).digest("hex") : null;
}

/**
 * The stored `phone` stays exactly as the advisor typed it, because that is what
 * the contact card shows; only the derived key is canonical.
 */
export function contactPhoneFields(raw: string | null | undefined): { phone: string | null; phoneHash: string | null } {
  return { phone: raw?.trim() || null, phoneHash: phoneLookupHash(raw) };
}
