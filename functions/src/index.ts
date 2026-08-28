import { initializeApp } from "firebase-admin/app";

initializeApp();

export { advanceOpportunity } from "./opportunities/advance-opportunity.js";
export { createOpportunity, listOpportunities } from "./opportunities/opportunity-api.js";
export { bootstrapWorkspace } from "./auth/bootstrap-workspace.js";
export { archiveContact, createContact, listContacts, updateContact } from "./contacts/contact-api.js";
export { recordInteraction } from "./interactions/record-interaction.js";
export { getTodayOverview } from "./today/get-today-overview.js";
export { health } from "./system/health.js";
