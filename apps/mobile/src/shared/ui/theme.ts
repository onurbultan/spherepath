import { useColorScheme } from "react-native";
import { nativeTokens } from "./tokens.generated";

export function useSpTheme() {
  return nativeTokens(useColorScheme() === "dark" ? "dark" : "light");
}
