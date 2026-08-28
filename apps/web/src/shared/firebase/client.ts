import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
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

export function getFirebaseApp(): FirebaseApp {
  if (!firebaseConfig.apiKey || !firebaseConfig.appId || !firebaseConfig.projectId) {
    throw new Error("Spherepath Firebase web configuration is incomplete.");
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function firebaseServices() {
  const app = getFirebaseApp();
  const services = {
    auth: getAuth(app),
    firestore: getFirestore(app),
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
    connectFirestoreEmulator(services.firestore, host, 8080);
    connectFunctionsEmulator(services.functions, host, 5001);
    connectStorageEmulator(services.storage, host, 9199);
    emulatorsConnected = true;
  }

  return services;
}
