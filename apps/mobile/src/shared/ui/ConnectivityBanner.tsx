import { StyleSheet, View } from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { SpText } from "./SpText";
import { space } from "./tokens.generated";
import { useSpTheme } from "./theme";

export function ConnectivityBanner() {
  const theme = useSpTheme();
  const network = useNetInfo();
  if (network.isConnected !== false && network.isInternetReachable !== false) return null;
  return <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">Çevrimdışısın. Açık ekran korunur; yeni kayıt göndermek için bağlantının gelmesini bekle.</SpText></View>;
}

const styles = StyleSheet.create({ banner: { paddingHorizontal: space.lg, paddingVertical: space.sm } });
