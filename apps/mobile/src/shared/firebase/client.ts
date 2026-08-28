import { getApp } from "@react-native-firebase/app";
import { getAuth, connectAuthEmulator } from "@react-native-firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "@react-native-firebase/functions";
import { getStorage, connectStorageEmulator } from "@react-native-firebase/storage";

let emulatorsConnected = false;

export function firebaseServices() {
  const app = getApp();
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
