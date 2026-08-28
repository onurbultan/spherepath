import "./runtime/global-options.js";
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { advanceDeal, advancePresentation, createDeal, createPresentation, getClosingOverview } from "./closing/closing-api.js";
export { advanceOpportunity } from "./opportunities/advance-opportunity.js";
export { createOpportunity, getOpportunityDetail, listOpportunities } from "./opportunities/opportunity-api.js";
export { bootstrapWorkspace } from "./auth/bootstrap-workspace.js";
export { archiveContact, createContact, listContacts, updateContact, updateContactPrivacy } from "./contacts/contact-api.js";
export { recordInteraction } from "./interactions/record-interaction.js";
export { advanceListing, createListing, listListings } from "./listings/listing-api.js";
export { createReferral, listReferrals } from "./referrals/referral-api.js";
export { createDataSubjectRequest, getContactDataExport, listDataSubjectRequests, resolveDataSubjectRequest } from "./privacy/data-subject-api.js";
export { processDeletionJob } from "./privacy/deletion-worker.js";
export { runRetentionPurge } from "./privacy/retention.js";
export { getWorkspaceSettings, updateWorkspaceSettings } from "./settings/workspace-api.js";
export { completeDailyTask, getTodayOverview } from "./today/get-today-overview.js";
export { confirmVoiceNote, getVoiceNote, processVoiceNote, registerVoiceNote } from "./voice/voice-api.js";
export { health } from "./system/health.js";
