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
  type WhatsAppGroupConfiguration,
  type WhatsAppGroupIntegrationView,
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

export async function loadWhatsAppGroupIntegration(): Promise<WhatsAppGroupIntegrationView> {
  return (await apiClient.query<undefined, { integration: WhatsAppGroupIntegrationView }>("getWhatsAppGroupIntegration", undefined)).integration;
}

export async function configureWhatsAppGroupIntegration(session: WorkspaceSession, input: WhatsAppGroupConfiguration): Promise<WhatsAppGroupIntegrationView> {
  return (await apiClient.command<WhatsAppGroupConfiguration, { integration: WhatsAppGroupIntegrationView }>(
    "configureWhatsAppGroupIntegration", input, createCommandId(session.uid),
  )).integration;
}

export async function createWhatsAppOfficeGroup(session: WorkspaceSession): Promise<WhatsAppGroupIntegrationView> {
  return (await apiClient.command<undefined, { integration: WhatsAppGroupIntegrationView }>(
    "createWhatsAppOfficeGroup", undefined, createCommandId(session.uid),
  )).integration;
}

export interface PhoneNormalizationPass {
  scanned: number;
  updated: number;
  done: boolean;
  cursor: string | null;
}

export async function normalizeContactPhones(session: WorkspaceSession, cursor: string | null): Promise<PhoneNormalizationPass> {
  return apiClient.command<{ cursor: string | null }, PhoneNormalizationPass>(
    "normalizeContactPhones", { cursor }, createCommandId(session.uid),
  );
}

export interface CallIntegrationView {
  integrationId: string;
  webhookToken: string;
  extensionOwners: Record<string, string>;
  /** The announcement played to the counterparty before recording starts. */
  recordingNoticeAnnouncementId: number | null;
  active: boolean;
}

export async function loadCallIntegration(): Promise<CallIntegrationView | null> {
  return apiClient.query<undefined, CallIntegrationView | null>("getCallIntegration", undefined);
}

export async function configureCallIntegration(
  session: WorkspaceSession,
  input: { extensionOwners?: Record<string, string>; rotateToken?: boolean; outboundCallerId?: string | null; defaultRoutingTarget?: string | null; recordingNoticeAnnouncementId?: number | null },
): Promise<{ integrationId: string; webhookToken: string }> {
  return apiClient.command<typeof input, { integrationId: string; webhookToken: string }>(
    "configureCallIntegration", input, createCommandId(session.uid),
  );
}

export interface CallProviderConnection {
  notificationUrl: string | null;
  events: string[];
  connected: boolean;
}

export async function connectCallProvider(session: WorkspaceSession): Promise<CallProviderConnection> {
  return apiClient.command<undefined, CallProviderConnection>(
    "connectCallProvider", undefined, createCommandId(session.uid),
  );
}

export interface CallAnnouncement { id: number; name: string }

export async function listCallAnnouncements(): Promise<CallAnnouncement[]> {
  return (await apiClient.query<undefined, { announcements: CallAnnouncement[] }>("listCallAnnouncements", undefined)).announcements;
}


