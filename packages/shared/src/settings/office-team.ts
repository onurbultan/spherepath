import { z } from "zod";
import type { UserRole } from "../domain/entities.js";

export const officeInviteCodeSchema = z.string()
  .trim()
  .toUpperCase()
  .regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/u, "Davet kodu 8 karakter olmalıdır.");

export const joinOfficeSchema = z.object({
  code: officeInviteCodeSchema,
}).strict();

export type JoinOfficeInput = z.infer<typeof joinOfficeSchema>;

export interface OfficeInviteView {
  code: string;
  officeId: string;
  officeName: string;
  role: "agent";
  expiresAt: number;
}

export interface OfficeMemberView {
  uid: string;
  displayName: string;
  role: UserRole;
  joinedAt: number | null;
}

export interface OfficeTeamView {
  officeId: string;
  officeName: string;
  canInvite: boolean;
  canJoinOffice: boolean;
  members: OfficeMemberView[];
  activeInvites: OfficeInviteView[];
}
