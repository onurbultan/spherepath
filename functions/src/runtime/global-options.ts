import { setGlobalOptions } from "firebase-functions/v2/options";
import { defineInt } from "firebase-functions/params";

/**
 * A cold start lands on the advisor while they are waiting for a note to save
 * or a reading to come back, which is exactly the moment the product is asking
 * them to trust it. Keeping an instance warm removes that wait, but a warm
 * instance bills around the clock -- so this is a deployment decision with a
 * price, not a default. 0 keeps the previous behaviour.
 */
export const warmInstances = defineInt("WARM_INSTANCES", { default: 0 });

export const enforceAppCheck =
  process.env.FUNCTIONS_EMULATOR !== "true" &&
  process.env.ENFORCE_APP_CHECK === "true";

setGlobalOptions({
  region: "europe-west8",
  enforceAppCheck,
});
