import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SpCard } from "./SpCard";
import { SpText } from "./SpText";
import { space } from "./tokens.generated";
import { useSpTheme } from "./theme";

export function FeaturePlaceholderView({ eyebrow, title, description, accent = "deed" }: { eyebrow: string; title: string; description: string; accent?: "deed" | "ask" }) {
  const theme = useSpTheme();
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <SpText variant="eyebrow" color={accent}>{eyebrow}</SpText>
        <SpText variant="hero">{title}</SpText>
        <SpCard style={styles.card}>
          <SpText color="secondary">{description}</SpText>
        </SpCard>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1 }, content: { flex: 1, padding: space.xl, paddingTop: space["4xl"], gap: space.lg }, card: { marginTop: space.xl } });
