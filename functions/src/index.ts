import "./runtime/global-options.js";
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { advanceDeal, advancePresentation, createDeal, createPresentation, getClosingOverview } from "./closing/closing-api.js";
export { advanceOpportunity, correctOpportunityStage } from "./opportunities/advance-opportunity.js";
export { createOpportunity, getOpportunityDetail, listOpportunities } from "./opportunities/opportunity-api.js";
export { bootstrapWorkspace } from "./auth/bootstrap-workspace.js";
export { configureCallIntegration, getCallIntegration, listCalls, normalizeContactPhones, processCallRecording, startContactCall, verimorCallWebhook, verimorRoutingWebhook } from "./calls/call-api.js";
export { createOfficeInvite, getOfficeTeam, joinOffice, revokeOfficeInvite } from "./auth/office-team.js";
export { archiveContact, createContact, listContactInteractions, listContacts, updateContact, updateContactPrivacy } from "./contacts/contact-api.js";
export { recordInteraction } from "./interactions/record-interaction.js";
export { analyzeInboxItem, createInboxItem, listInboxItems, processInboxItem, updateInboxItem, retryInboxItem, undoInboxApplication } from "./inbox/inbox-api.js";
export { getFunnelOverview } from "./funnel/get-funnel-overview.js";
export { advanceListing, createListing, importExistingListing, listListings } from "./listings/listing-api.js";
export { createPortfolioItemFromDraft, draftMatchMessage, extractPortfolioText, listMatchNotifications, listPortfolioItems, listPortfolioMatches, markMatchNotificationsRead, withdrawPortfolioItem } from "./matching/portfolio-api.js";
export { createReferral, listReferrals } from "./referrals/referral-api.js";
export { createDataSubjectRequest, getContactDataExport, listDataSubjectRequests, resolveDataSubjectRequest } from "./privacy/data-subject-api.js";
export { processDeletionJob } from "./privacy/deletion-worker.js";
export { runRetentionPurge } from "./privacy/retention.js";
export { getWorkspaceSettings, updateWorkspaceSettings } from "./settings/workspace-api.js";
export { configureWhatsAppGroupIntegration, createWhatsAppOfficeGroup, getWhatsAppGroupIntegration, whatsappGroupsWebhook } from "./whatsapp/group-api.js";
export { completeDailyTask, getTodayOverview, replaceDailyPlanItem } from "./today/get-today-overview.js";
export { confirmVoiceNote, discardVoiceNote, getLatestReviewableVoiceNote, getVoiceNote, processVoiceNote, registerInteractionText, registerVoiceNote, registerVoiceTextTest, retryVoiceNoteProcessing } from "./voice/voice-api.js";
export { health } from "./system/health.js";
