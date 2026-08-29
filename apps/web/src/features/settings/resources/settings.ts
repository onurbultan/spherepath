import {
  createCommandId,
  type ContactDataExport,
  type CreateDataSubjectRequestInput,
  type DataSubjectRequestView,
  type JoinOfficeInput,
  type OfficeInviteView,
  type OfficeTeamView,
  type ResolveDataSubjectRequestInput,
  type WorkspaceSettingsDraft,
  type WorkspaceSettingsView,
} from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { apiClient } from "@/shared/api/client";

export async function loadWorkspaceSettings(): Promise<WorkspaceSettingsView> {
  return (await apiClient.query<undefined, { settings: WorkspaceSettingsView }>("getWorkspaceSettings", undefined)).settings;
}

export async function saveWorkspaceSettings(session: WorkspaceSession, input: WorkspaceSettingsDraft) {
  return (await apiClient.command<WorkspaceSettingsDraft, { settings: WorkspaceSettingsView }>(
    "updateWorkspaceSettings", input, createCommandId(session.uid),
  )).settings;
}

export async function loadOfficeTeam(): Promise<OfficeTeamView> {
  return (await apiClient.query<undefined, { team: OfficeTeamView }>("getOfficeTeam", undefined)).team;
}

export async function createOfficeInvite(session: WorkspaceSession): Promise<OfficeInviteView> {
  return (await apiClient.command<undefined, { invite: OfficeInviteView }>(
    "createOfficeInvite", undefined, createCommandId(session.uid),
  )).invite;
}

export async function revokeOfficeInvite(session: WorkspaceSession, code: string): Promise<void> {
  await apiClient.command<JoinOfficeInput, { code: string }>(
    "revokeOfficeInvite", { code }, createCommandId(session.uid),
  );
}

export async function joinOffice(session: WorkspaceSession, input: JoinOfficeInput): Promise<{ officeId: string; role: "agent" }> {
  return apiClient.command<JoinOfficeInput, { officeId: string; role: "agent" }>(
    "joinOffice", input, createCommandId(session.uid),
  );
}

export async function listDataSubjectRequests(): Promise<DataSubjectRequestView[]> {
  return (await apiClient.query<undefined, { requests: DataSubjectRequestView[] }>("listDataSubjectRequests", undefined)).requests;
}

export async function createDataSubjectRequest(session: WorkspaceSession, input: CreateDataSubjectRequestInput) {
  return (await apiClient.command<CreateDataSubjectRequestInput, { request: DataSubjectRequestView }>(
    "createDataSubjectRequest", input, createCommandId(session.uid),
  )).request;
}

export async function resolveDataSubjectRequest(session: WorkspaceSession, input: ResolveDataSubjectRequestInput) {
  return apiClient.command<ResolveDataSubjectRequestInput, { requestId: string }>(
    "resolveDataSubjectRequest", input, createCommandId(session.uid),
  );
}

export async function getContactDataExport(contactId: string): Promise<ContactDataExport> {
  return (await apiClient.query<{ contactId: string }, { export: ContactDataExport }>("getContactDataExport", { contactId })).export;
}
