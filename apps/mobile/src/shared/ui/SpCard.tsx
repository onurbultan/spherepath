import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { radius, space } from "./tokens.generated";
import { useSpTheme } from "./theme";

export function SpCard({ children, style }: { children: ReactNode; style?: ViewStyle | ViewStyle[] }) {
  const theme = useSpTheme();
  return <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space["2xl"] },
});
