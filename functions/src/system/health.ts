import { onCall } from "firebase-functions/v2/https";

export const health = onCall({
  region: "europe-west8",
  cors: true,
  maxInstances: 10,
  memory: "256MiB",
  timeoutSeconds: 60,
}, () => ({
  service: "spherepath-functions",
  status: "ok",
  timestamp: Date.now(),
}));
