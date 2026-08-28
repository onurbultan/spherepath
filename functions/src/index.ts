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
export { getTodayOverview } from "./today/get-today-overview.js";
export { health } from "./system/health.js";
