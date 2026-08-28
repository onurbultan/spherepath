import { getApp } from "@react-native-firebase/app";
import { initializeAppCheck, ReactNativeFirebaseAppCheckProvider } from "@react-native-firebase/app-check";
import { getAuth, connectAuthEmulator } from "@react-native-firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "@react-native-firebase/functions";
import { getStorage, connectStorageEmulator } from "@react-native-firebase/storage";

let emulatorsConnected = false;
let appCheckInitialized = false;

function configureAppCheck(app: ReturnType<typeof getApp>) {
  if (appCheckInitialized || (__DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true")) return;
  const debugToken = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN;
  const provider = new ReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: __DEV__ ? { provider: "debug", debugToken } : { provider: "playIntegrity" },
    apple: __DEV__ ? { provider: "debug", debugToken } : { provider: "appAttest" },
  });
  initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
  appCheckInitialized = true;
}

export function firebaseServices() {
  const app = getApp();
  configureAppCheck(app);
  const services = {
    auth: getAuth(app),
    functions: getFunctions(app, "europe-west8"),
    storage: getStorage(app),
  };

  if (__DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true" && !emulatorsConnected) {
    const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";
    connectAuthEmulator(services.auth, `http://${host}:9099`);
    connectFunctionsEmulator(services.functions, host, 5001);
    connectStorageEmulator(services.storage, host, 9199);
    emulatorsConnected = true;
  }

  return services;
}
