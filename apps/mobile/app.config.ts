import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExpoConfig } from "expo/config";

const root = __dirname;
const androidConfig = join(root, "google-services.json");
const iosConfig = join(root, "GoogleService-Info.plist");

const config: ExpoConfig = {
  name: "Spherepath",
  slug: "spherepath",
  scheme: "spherepath",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.spherepath.app",
    entitlements: {
      "com.apple.developer.devicecheck.appattest-environment": "production",
    },
    ...(existsSync(iosConfig) ? { googleServicesFile: iosConfig } : {}),
    infoPlist: {
      NSContactsUsageDescription: "Spherepath, yalnızca seçtiğiniz kişileri çalışma alanınıza eklemek için rehber erişimi ister.",
      NSMicrophoneUsageDescription: "Spherepath, görüşme sonrasında kendi kısa sesli notunuzu kaydetmek için mikrofon erişimi ister.",
    },
  },
  android: {
    package: "com.spherepath.app",
    ...(existsSync(androidConfig) ? { googleServicesFile: androidConfig } : {}),
    permissions: ["READ_CONTACTS", "RECORD_AUDIO"],
    predictiveBackGestureEnabled: true,
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-contacts",
    "expo-notifications",
    ["expo-audio", { microphonePermission: "Görüşme sonrası kendi kısa sesli notunuzu kaydetmek için mikrofon erişimi gerekir." }],
    ["expo-build-properties", { ios: { useFrameworks: "static" } }],
    ["@react-native-firebase/app", { ios: { disableSPM: true } }],
    "@react-native-firebase/app-check",
    "@react-native-firebase/auth",
    ["expo-splash-screen", { backgroundColor: "#F6F7F3", image: "./assets/splash-icon.png", imageWidth: 96 }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
