import { useEffect } from "react";
import { Slot } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
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

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 2, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

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
      <QueryClientProvider client={queryClient}>
        <Slot />
        <StatusBar style="auto" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
