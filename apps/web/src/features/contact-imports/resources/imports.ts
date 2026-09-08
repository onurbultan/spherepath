import { createCommandId, type ContactImportJob, type ContactImportPage, type ContactImportNote } from "@spherepath/shared";
import { apiClient } from "@/shared/api/client";

export async function listImports() { return (await apiClient.query<undefined, { jobs: ContactImportJob[] }>("listContactImports", undefined)).jobs; }
export function getImport(jobId: string, cursor: string | null) { return apiClient.query<{ jobId: string; cursor: string | null }, ContactImportPage>("getContactImport", { jobId, cursor }); }
export function getGoogleConfig() { return apiClient.query<undefined, { enabled: boolean }>("getGoogleContactImportConfig", undefined); }
export function prepareImport(uid: string, csv: string) { return apiClient.command<{ csv: string }, { jobId: string }>("prepareContactImport", { csv }, createCommandId(uid)); }
export function commitImport(uid: string, jobId: string, rowIds: string[]) { return apiClient.command<{ jobId: string; rowIds: string[] }, { jobId: string }>("commitContactImport", { jobId, rowIds }, createCommandId(uid)); }
export function controlImport(uid: string, jobId: string, action: "cancel" | "resume") { return apiClient.command<{ jobId: string; action: string }, { jobId: string }>("controlContactImport", { jobId, action }, createCommandId(uid)); }
export function beginGoogleImport(uid: string) { return apiClient.command<{ platform: string }, { jobId: string; authorizationUrl: string }>("beginGoogleContactImport", { platform: "web" }, createCommandId(uid)); }
export function finishGoogleImport(uid: string, state: string, code: string) { return apiClient.command<{ state: string; code: string }, { jobId: string }>("finishGoogleContactImport", { state, code }, createCommandId(uid)); }
export async function listImportNotes(contactId: string) { return (await apiClient.query<{ contactId: string }, { notes: ContactImportNote[] }>("listContactImportNotes", { contactId })).notes; }
