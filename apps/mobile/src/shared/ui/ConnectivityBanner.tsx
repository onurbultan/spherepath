import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { SpText } from "./SpText";
import { space } from "./tokens.generated";
import { useSpTheme } from "./theme";
import { useSession } from "@/features/auth/resources/session";
import { captureQueueCount, flushCaptureQueue } from "@/features/interactions/resources/interactions";

export function ConnectivityBanner() {
  const theme = useSpTheme();
  const { session } = useSession();
  const network = useNetInfo();
  const [queued, setQueued] = useState(0);
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  useEffect(() => { if (!session) return; let active = true; void (online ? flushCaptureQueue(session) : captureQueueCount(session.uid)).then((count) => { if (active) setQueued(count); }); return () => { active = false; }; }, [online, session]);
  if (online && queued === 0) return null;
  return <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: online ? theme.deedBg : theme.askBg }]}><SpText variant="bodySmall" color={online ? "deed" : "ask"}>{online ? `${queued} kayıt gönderilmeyi bekliyor; yeniden deneniyor.` : `Çevrimdışısın. ${queued ? `${queued} kayıt güvenli kuyrukta.` : "Yeni temas ve sesli notlar kuyruğa alınacak."}`}</SpText></View>;
}

const styles = StyleSheet.create({ banner: { paddingHorizontal: space.lg, paddingVertical: space.sm } });
