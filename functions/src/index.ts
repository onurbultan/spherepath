import { initializeApp } from "firebase-admin/app";

initializeApp();

export { advanceOpportunity } from "./opportunities/advance-opportunity.js";
export { bootstrapWorkspace } from "./auth/bootstrap-workspace.js";
export { health } from "./system/health.js";
