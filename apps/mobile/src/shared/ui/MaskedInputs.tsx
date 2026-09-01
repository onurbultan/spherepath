import { StyleSheet, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { formatMoneyAsTyped, formatPhoneAsTyped } from "@spherepath/shared";
import { SpText } from "./SpText";
import { useSpTheme } from "./theme";
import { space } from "./tokens.generated";

/**
 * Both inputs keep the advisor's own text and only re-group it, so a half-typed
 * value stays editable and what gets stored is the plain string the drafts
 * already expect.
 */

export function PhoneInput({
  value,
  onChangeText,
  style,
  placeholder = "0532 123 45 67",
}: {
  value: string;
  onChangeText: (value: string) => void;
  style?: TextStyle | TextStyle[];
  placeholder?: string;
}) {
  const theme = useSpTheme();
  return (
    <TextInput
      autoComplete="tel"
      keyboardType="phone-pad"
      onChangeText={(next) => onChangeText(formatPhoneAsTyped(next))}
      placeholder={placeholder}
      placeholderTextColor={theme.textTertiary}
      style={style}
      value={value}
    />
  );
}

export function MoneyInput({
  value,
  onChangeText,
  currency,
  style,
  containerStyle,
  accessibilityLabel,
  placeholder = "0",
}: {
  value: string;
  onChangeText: (value: string) => void;
  /** Sits inside the field so grouped digits are never read as a bare number. */
  currency?: string;
  style?: TextStyle | TextStyle[];
  containerStyle?: ViewStyle;
  accessibilityLabel?: string;
  placeholder?: string;
}) {
  const theme = useSpTheme();
  return (
    <View style={[styles.wrapper, containerStyle]}>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        keyboardType="number-pad"
        onChangeText={(next) => onChangeText(formatMoneyAsTyped(next))}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        style={style}
        value={value}
      />
      {currency ? (
        <View pointerEvents="none" style={styles.currency}>
          <SpText variant="bodySmall" color="secondary">{currency}</SpText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "relative", justifyContent: "center" },
  currency: { position: "absolute", right: space.md, top: 0, bottom: 0, justifyContent: "center" },
});
