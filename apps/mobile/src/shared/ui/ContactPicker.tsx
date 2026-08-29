import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Search, X } from "lucide-react-native";
import { SpText } from "./SpText";
import { useSpTheme } from "./theme";
import { radius, space } from "./tokens.generated";

interface ContactChoice { id: string; fullName: string | null; label: string | null; relationship?: { lastTouchAt: number | null } }
const name = (contact: ContactChoice) => contact.fullName ?? contact.label ?? "İsimsiz kişi";

export function ContactPicker({ contacts, value, onChange, label = "Kişi", placeholder = "Kişi ara ve seç" }: { contacts: readonly ContactChoice[]; value: string; onChange(value: string): void; label?: string; placeholder?: string }) {
  const theme = useSpTheme();
  const [query, setQuery] = useState("");
  const selected = contacts.find((contact) => contact.id === value) ?? null;
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    const ranked = [...contacts].sort((left, right) => (right.relationship?.lastTouchAt ?? 0) - (left.relationship?.lastTouchAt ?? 0));
    return (normalized ? ranked.filter((contact) => name(contact).toLocaleLowerCase("tr-TR").includes(normalized)) : ranked).slice(0, normalized ? 12 : 5);
  }, [contacts, query]);
  return <View style={styles.root}><SpText variant="title">{label}</SpText><View style={[styles.inputRow, { borderColor: theme.line, backgroundColor: theme.card }]}><Search color={theme.textTertiary} size={17} /><TextInput accessibilityLabel={`${label} ara`} placeholder={selected ? name(selected) : placeholder} placeholderTextColor={selected ? theme.textPrimary : theme.textTertiary} style={[styles.input, { color: theme.textPrimary }]} value={query} onChangeText={(text) => { setQuery(text); if (selected) onChange(""); }} />{value ? <Pressable accessibilityLabel="Kişi seçimini temizle" onPress={() => { onChange(""); setQuery(""); }}><X color={theme.textSecondary} size={17} /></Pressable> : null}</View>{!query ? <SpText variant="caption" color="secondary">Son görüşülen kişiler</SpText> : null}<View style={styles.options}>{visible.map((contact) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: value === contact.id }} key={contact.id} onPress={() => { onChange(contact.id); setQuery(""); }} style={[styles.option, { borderColor: value === contact.id ? theme.deed : theme.line, backgroundColor: value === contact.id ? theme.deedBg : theme.card }]}><SpText variant="bodySmall" color={value === contact.id ? "deed" : "secondary"}>{name(contact)}</SpText></Pressable>)}</View>{visible.length === 0 ? <SpText variant="bodySmall" color="secondary">Eşleşen kişi bulunamadı.</SpText> : null}</View>;
}

const styles = StyleSheet.create({ root: { gap: space.sm }, inputRow: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", gap: space.sm }, input: { flex: 1, minHeight: 46, fontFamily: "Karla_400Regular", fontSize: 16 }, options: { gap: space.xs }, option: { minHeight: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, justifyContent: "center", paddingHorizontal: space.md } });
