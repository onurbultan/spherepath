import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, ChevronDown, X } from "lucide-react-native";
import {
  defaultPhoneCountry,
  formatMoneyAsTyped,
  formatNationalAsTyped,
  joinPhone,
  phoneCountries,
  phoneCountryFlag,
  splitPhone,
} from "@spherepath/shared";
import { SpText } from "./SpText";
import { useSpTheme } from "./theme";
import { radius, space } from "./tokens.generated";

/**
 * Both inputs re-group what the advisor typed rather than replacing it, so the
 * caret never jumps and a half-entered value stays editable. What they hand back
 * is still the single string the drafts already carry.
 */

export function PhoneInput({
  value,
  onChangeText,
  style,
}: {
  value: string;
  onChangeText: (value: string) => void;
  /** The caller's field style dresses the whole control; its type settings carry through to the number. */
  style?: TextStyle | TextStyle[];
  placeholder?: string;
}) {
  const theme = useSpTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const parsed = splitPhone(value);
  // The dialling code lives in the stored value once a number exists; the local
  // choice only has to survive an empty field.
  const [pendingDialCode, setPendingDialCode] = useState(parsed.dialCode);
  const dialCode = value ? parsed.dialCode : pendingDialCode;
  const country = phoneCountries.find((item) => item.dialCode === dialCode) ?? defaultPhoneCountry;

  // The caller hands one field style; the box half dresses the control and the
  // type half carries through to the number, so both segments match every other
  // input on the screen.
  const field = StyleSheet.flatten(style) ?? {};
  const box: ViewStyle = {
    minHeight: field.minHeight,
    borderRadius: field.borderRadius,
    borderWidth: field.borderWidth,
    borderColor: field.borderColor,
    backgroundColor: field.backgroundColor,
  };
  const typography: TextStyle = { fontFamily: field.fontFamily, fontSize: field.fontSize, color: field.color ?? theme.textPrimary };

  function choose(next: string) {
    setPendingDialCode(next);
    setPickerOpen(false);
    onChangeText(joinPhone(next, parsed.national));
  }

  return (
    <>
      <View style={[box, styles.phone]}>
        <Pressable
          accessibilityLabel="Ülke kodu"
          accessibilityRole="button"
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [styles.country, { borderRightColor: theme.line, opacity: pressed ? .6 : 1 }]}
        >
          <SpText style={styles.flag}>{phoneCountryFlag(country.code)}</SpText>
          <SpText variant="bodySmall" color="secondary">+{country.dialCode}</SpText>
          <ChevronDown color={theme.textSecondary} size={14} />
        </Pressable>
        <TextInput
          autoComplete="tel-national"
          keyboardType="phone-pad"
          onChangeText={(next) => onChangeText(joinPhone(dialCode, formatNationalAsTyped(next, dialCode)))}
          placeholder="507 872 70 22"
          placeholderTextColor={theme.textTertiary}
          style={[styles.number, typography]}
          value={parsed.national}
        />
      </View>

      <Modal animationType="slide" onRequestClose={() => setPickerOpen(false)} presentationStyle="pageSheet" visible={pickerOpen}>
        <SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}>
          <View style={styles.pickerHeader}>
            <SpText variant="hero">Ülke kodu</SpText>
            <Pressable accessibilityLabel="Kapat" onPress={() => setPickerOpen(false)} style={[styles.close, { borderColor: theme.line }]}>
              <X color={theme.textSecondary} size={20} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.pickerBody}>
            {phoneCountries.map((item) => {
              const selected = item.dialCode === dialCode;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={item.code}
                  onPress={() => choose(item.dialCode)}
                  style={[styles.option, { backgroundColor: selected ? theme.deedBg : "transparent" }]}
                >
                  <SpText style={styles.flag}>{phoneCountryFlag(item.code)}</SpText>
                  <SpText style={styles.optionName}>{item.name}</SpText>
                  <SpText variant="bodySmall" color="secondary">+{item.dialCode}</SpText>
                  {selected ? <Check color={theme.deed} size={17} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
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
    <View style={[styles.moneyWrapper, containerStyle]}>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        keyboardType="number-pad"
        onChangeText={(next) => onChangeText(formatMoneyAsTyped(next))}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        style={[style, currency ? styles.moneyInput : null]}
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
  phone: { flexDirection: "row", alignItems: "stretch", paddingHorizontal: 0, overflow: "hidden" },
  country: {
    flexDirection: "row", alignItems: "center", gap: space.xs,
    paddingHorizontal: space.md, borderRightWidth: StyleSheet.hairlineWidth,
  },
  flag: { fontSize: 17 },
  number: { flex: 1, paddingHorizontal: space.md },
  safe: { flex: 1 },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space.lg },
  close: { width: 40, height: 40, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  pickerBody: { paddingHorizontal: space.lg, paddingBottom: space["3xl"], gap: space.xs },
  option: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.md },
  optionName: { flex: 1 },
  moneyWrapper: { position: "relative", justifyContent: "center" },
  moneyInput: { paddingRight: 56 },
  currency: { position: "absolute", right: space.md, top: 0, bottom: 0, justifyContent: "center" },
});
