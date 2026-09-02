import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SpText } from "./SpText";
import { useSpTheme } from "./theme";
import { hit, radius, space } from "./tokens.generated";

/**
 * The form control layer. Every field, choice and action on every screen comes
 * from here, so height, border, corner and disabled state are decided once and a
 * new screen cannot introduce a slightly different input by accident.
 *
 * Controls stand at the minimum comfortable touch target, which is also what the
 * web build grows to on a touch device -- the same field is the same size on
 * both, rather than two numbers that happen to be close.
 */

export function SpField({
  label,
  optional,
  hint,
  error,
  children,
  style,
}: {
  label?: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.field, style]}>
      {label ? (
        <View style={styles.labelRow}>
          <SpText variant="bodySmall" color="secondary">{label}</SpText>
          {optional ? <SpText variant="caption" color="secondary">· isteğe bağlı</SpText> : null}
        </View>
      ) : null}
      {children}
      {hint ? <SpText variant="caption" color="secondary">{hint}</SpText> : null}
      {error ? <SpText variant="caption" color="ask">{error}</SpText> : null}
    </View>
  );
}

export function useControlStyle(): TextStyle {
  const theme = useSpTheme();
  return {
    minHeight: hit.min,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.line,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    backgroundColor: theme.background,
    color: theme.textPrimary,
    fontFamily: "Karla_400Regular",
    fontSize: 16,
  };
}

export function SpInput({ style, multiline, ...props }: TextInputProps) {
  const theme = useSpTheme();
  const control = useControlStyle();
  return (
    <TextInput
      multiline={multiline}
      placeholderTextColor={theme.textTertiary}
      {...props}
      style={[control, multiline ? styles.multiline : null, style]}
    />
  );
}

/** A long-form field: the same control, given room and a top-aligned caret. */
export function SpTextarea(props: TextInputProps) {
  return <SpInput multiline {...props} />;
}

/**
 * One option among several. Radio groups are the mobile answer to a select, and
 * they were the most drifted control in the app -- four heights and two corners.
 */
export function SpChoice({
  label,
  selected,
  onPress,
  disabled,
  accessibilityLabel,
  style,
}: {
  label: ReactNode;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
  const theme = useSpTheme();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          borderColor: selected ? theme.deed : theme.line,
          backgroundColor: selected ? theme.deedBg : theme.background,
          opacity: disabled ? .5 : pressed ? .7 : 1,
        },
        style,
      ]}
    >
      <SpText variant="bodySmall" color={selected ? "deed" : "secondary"}>{label}</SpText>
    </Pressable>
  );
}

type ButtonTone = "primary" | "secondary" | "danger";

/**
 * `lg` is the full-width action that closes a sheet; everything else sits at the
 * same height as the fields above it.
 */
export function SpButton({
  label,
  tone = "primary",
  size = "md",
  icon,
  onPress,
  disabled,
  style,
  ...props
}: {
  label: ReactNode;
  tone?: ButtonTone;
  size?: "md" | "lg";
  icon?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
} & Omit<PressableProps, "style" | "onPress" | "disabled" | "children">) {
  const theme = useSpTheme();
  const tones: Record<ButtonTone, ViewStyle> = {
    primary: { backgroundColor: theme.deed, borderColor: theme.deed },
    secondary: { backgroundColor: theme.background, borderColor: theme.line },
    danger: { backgroundColor: theme.ask, borderColor: theme.ask },
  };
  const labelColor = tone === "primary" ? theme.onDeed : tone === "danger" ? theme.onAsk : theme.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      {...props}
      style={({ pressed }) => [
        styles.button,
        { minHeight: size === "lg" ? hit.comfortable : hit.min },
        tones[tone],
        { opacity: disabled ? .5 : pressed ? .8 : 1 },
        style,
      ]}
    >
      {icon}
      <SpText variant="bodySmall" style={{ color: labelColor, fontWeight: "700" }}>{label}</SpText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  labelRow: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  multiline: { minHeight: 108, paddingVertical: space.md, textAlignVertical: "top", lineHeight: 23 },
  choice: {
    minHeight: hit.min,
    paddingHorizontal: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  button: {
    paddingHorizontal: space.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
});
