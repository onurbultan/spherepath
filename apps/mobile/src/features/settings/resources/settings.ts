import {
  createCommandId,
  type ContactDataExport,
  type ContactDataExportInput,
  type CreateDataSubjectRequestInput,
  type DataSubjectRequestView,
  type JoinOfficeInput,
  type OfficeInviteView,
  type OfficeTeamView,
  type ResolveDataSubjectRequestInput,
  type WhatsAppGroupConfiguration,
  type WhatsAppGroupIntegrationView,
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

/**
 * Numbers saved before the phone field was split cannot be matched to a caller.
 * Broker-only maintenance, run once after an import.
 */
export async function normalizeContactPhones(session: WorkspaceSession, cursor: string | null): Promise<{ scanned: number; updated: number; done: boolean; cursor: string | null }> {
  return apiClient.command<{ cursor: string | null }, { scanned: number; updated: number; done: boolean; cursor: string | null }>(
    "normalizeContactPhones", { cursor }, createCommandId(session.uid),
  );
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

export async function getContactDataExport(requestId: string): Promise<ContactDataExport> {
  const input: ContactDataExportInput = { requestId };
  return (await apiClient.query<ContactDataExportInput, { export: ContactDataExport }>("getContactDataExport", input)).export;
}

export interface CallIntegrationView {
  integrationId: string;
  webhookToken: string;
  extensionOwners: Record<string, string>;
  active: boolean;
}

export async function loadCallIntegration(): Promise<CallIntegrationView | null> {
  return apiClient.query<undefined, CallIntegrationView | null>("getCallIntegration", undefined);
}

export async function configureCallIntegration(
  session: WorkspaceSession,
  input: { extensionOwners?: Record<string, string>; rotateToken?: boolean; outboundCallerId?: string | null; defaultRoutingTarget?: string | null },
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
