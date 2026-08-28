import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let emulatorsConnected = false;
let appCheckInitialized = false;

function configureAppCheck(app: FirebaseApp) {
  if (typeof window === "undefined" || appCheckInitialized || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") return;
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;
  if (!siteKey) return;
  if (process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG === "true") {
    (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
  appCheckInitialized = true;
}

export function getFirebaseApp(): FirebaseApp {
  if (!firebaseConfig.apiKey || !firebaseConfig.appId || !firebaseConfig.projectId) {
    throw new Error("Spherepath Firebase web configuration is incomplete.");
  }
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  configureAppCheck(app);
  return app;
}

export function firebaseServices() {
  const app = getFirebaseApp();
  const services = {
    auth: getAuth(app),
    functions: getFunctions(app, "europe-west8"),
    storage: getStorage(app),
  };

  if (
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" &&
    !emulatorsConnected
  ) {
    const host = window.location.hostname;
    connectAuthEmulator(services.auth, `http://${host}:9099`, { disableWarnings: true });
    connectFunctionsEmulator(services.functions, host, 5001);
    connectStorageEmulator(services.storage, host, 9199);
    emulatorsConnected = true;
  }

  return services;
}
