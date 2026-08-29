import { useEffect } from "react";
import { Slot } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRetryDelay, shouldRetryApiCall } from "@spherepath/shared";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  IBMPlexMono_400Regular,
} from "@expo-google-fonts/ibm-plex-mono/400Regular";
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono/500Medium";
import {
  Karla_400Regular,
} from "@expo-google-fonts/karla/400Regular";
import { Karla_500Medium } from "@expo-google-fonts/karla/500Medium";
import { Karla_600SemiBold } from "@expo-google-fonts/karla/600SemiBold";
import { Karla_700Bold } from "@expo-google-fonts/karla/700Bold";
import { ZillaSlab_600SemiBold } from "@expo-google-fonts/zilla-slab/600SemiBold";
import { ZillaSlab_700Bold } from "@expo-google-fonts/zilla-slab/700Bold";
import { SessionProvider, useSession } from "@/features/auth/resources/session";
import { AuthView } from "@/features/auth/views/AuthView";
import { SpText } from "@/shared/ui/SpText";
import { useSpTheme } from "@/shared/ui/theme";
import { configureNotificationPresentation } from "@/features/settings/resources/notifications";
import { ConnectivityBanner } from "@/shared/ui/ConnectivityBanner";

void SplashScreen.preventAutoHideAsync();
configureNotificationPresentation();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: shouldRetryApiCall, retryDelay: apiRetryDelay, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
const queryPersister = createAsyncStoragePersister({ storage: AsyncStorage, key: "spherepath.query-cache.v1", throttleTime: 1_000 });

function SessionGate() {
  const theme = useSpTheme();
  const { status, error, signOut } = useSession();
  if (status === "signedOut") return <AuthView />;
  if (status === "error") {
    return <View style={[styles.state, { backgroundColor: theme.background }]}><SpText variant="title">Çalışma alanı açılamadı</SpText><SpText color="secondary">{error}</SpText><SpText color="deed" onPress={() => void signOut()}>Oturumu kapat</SpText></View>;
  }
  if (status !== "ready") return <View style={[styles.state, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Çalışma alanın hazırlanıyor…</SpText></View>;
  return <><ConnectivityBanner /><Slot /><StatusBar style="auto" /></>;
}

function SessionCacheBoundary({ children }: { children: React.ReactNode }) {
  const { status } = useSession(); const client = useQueryClient();
  useEffect(() => { if (status === "signedOut") { client.clear(); void queryPersister.removeClient(); } }, [client, status]);
  return children;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    Karla_400Regular,
    Karla_500Medium,
    Karla_600SemiBold,
    Karla_700Bold,
    ZillaSlab_600SemiBold,
    ZillaSlab_700Bold,
  });
  const ready = fontsLoaded || fontError;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: 24 * 60 * 60 * 1_000, buster: "spherepath-v2" }}>
        <SessionProvider><SessionCacheBoundary><SessionGate /></SessionCacheBoundary></SessionProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
});
