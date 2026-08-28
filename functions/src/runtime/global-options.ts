import { setGlobalOptions } from "firebase-functions/v2/options";

export const enforceAppCheck = process.env.ENFORCE_APP_CHECK === "true";

setGlobalOptions({
  region: "europe-west8",
  enforceAppCheck,
});
