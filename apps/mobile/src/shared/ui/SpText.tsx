import type { ReactNode } from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import { useSpTheme } from "./theme";

type Variant = "eyebrow" | "body" | "bodySmall" | "title" | "hero" | "figure";

const variants: Record<Variant, TextStyle> = {
  eyebrow: { fontFamily: "IBMPlexMono_500Medium", fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: "uppercase" },
  body: { fontFamily: "Karla_400Regular", fontSize: 15, lineHeight: 22 },
  bodySmall: { fontFamily: "Karla_400Regular", fontSize: 13, lineHeight: 19 },
  title: { fontFamily: "ZillaSlab_700Bold", fontSize: 20, lineHeight: 25 },
  hero: { fontFamily: "ZillaSlab_700Bold", fontSize: 36, lineHeight: 39 },
  figure: { fontFamily: "ZillaSlab_700Bold", fontSize: 30, lineHeight: 32, fontVariant: ["tabular-nums"] },
};

interface SpTextProps extends Omit<TextProps, "style"> {
  variant?: Variant;
  color?: "primary" | "secondary" | "deed" | "ask";
  children: ReactNode;
  style?: TextStyle | TextStyle[];
}

export function SpText({ variant = "body", color = "primary", children, style, ...props }: SpTextProps) {
  const theme = useSpTheme();
  const resolvedColor = color === "secondary" ? theme.textSecondary : color === "deed" ? theme.deed : color === "ask" ? theme.ask : theme.textPrimary;
  return <Text {...props} style={[variants[variant], { color: resolvedColor }, style]}>{children}</Text>;
}
