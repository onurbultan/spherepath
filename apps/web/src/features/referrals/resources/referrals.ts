import { createCommandId, type Referral, type ReferralDraft } from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";
export interface ReferralRecord extends Referral { id: string; sourceContactName: string; referredContactName: string }
export async function listReferrals(): Promise<ReferralRecord[]> { return (await apiClient.query<undefined, { referrals: ReferralRecord[] }>("listReferrals", undefined)).referrals; }
export async function saveReferral(session: WorkspaceSession, draft: ReferralDraft): Promise<ReferralRecord> { return (await apiClient.command<ReferralDraft, { referral: ReferralRecord }>("createReferral", draft, createCommandId(session.uid))).referral; }
