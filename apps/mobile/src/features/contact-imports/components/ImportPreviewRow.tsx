import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { contactImportCopy as copy, type ContactImportRow } from "@spherepath/shared";
import { SpButton, SpCheckbox } from "@/shared/ui/SpField";
import { SpText } from "@/shared/ui/SpText";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";

export function ImportPreviewRow({ row, preview, selected, pending, onToggle }: { row: ContactImportRow; preview: boolean; selected: boolean; pending: boolean; onToggle: () => void }) {
  const theme = useSpTheme();
  const [noteOpen, setNoteOpen] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const eligible = ["new", "matched"].includes(row.status);
  const channels = [...row.phones, ...row.emails];
  return <View style={[styles.row, { borderColor: theme.line }]}>
    <View style={styles.heading}>
      {preview ? <SpCheckbox label={row.fullName || copy.unnamed} selected={selected} disabled={pending || !eligible} onPress={onToggle} /> : <SpText variant="bodySmall" style={styles.name}>{row.fullName || copy.unnamed}</SpText>}
      <View style={[styles.badge, { backgroundColor: row.reason ? theme.warmBg : theme.sunk }]}><SpText variant="caption">{row.result ? copy.result[row.result] : copy.match[row.status]}</SpText></View>
    </View>
    {row.matchedName ? <SpText variant="caption" color="secondary">{copy.existing}: {row.matchedName}</SpText> : null}
    <SpText variant="bodySmall" color="secondary">{channels.length ? (channelsOpen ? channels : channels.slice(0, 2)).join(" · ") : copy.noChannels}</SpText>
    {channels.length > 2 ? <SpButton tone="quiet" label={`${channelsOpen ? "−" : "+"} ${copy.channelsColumn}`} accessibilityState={{ expanded: channelsOpen }} onPress={() => setChannelsOpen(!channelsOpen)} /> : null}
    {row.reason ? <SpText variant="caption" color="ask">{copy.reason[row.reason]}</SpText> : null}
    <View style={styles.actions}>
      {row.note ? <SpButton tone="quiet" label={copy.notesTitle} accessibilityState={{ expanded: noteOpen }} onPress={() => setNoteOpen(!noteOpen)} /> : null}
      {preview && !selected ? <SpText variant="caption" color="secondary">{copy.excluded}</SpText> : null}
      {preview && eligible ? <SpButton tone="quiet" label={selected ? copy.exclude : copy.restore} disabled={pending} onPress={onToggle} /> : null}
    </View>
    {noteOpen ? <View style={[styles.note, { backgroundColor: theme.sunk }]}><SpText variant="bodySmall">{row.note}</SpText>{row.noteMasked ? <SpText variant="caption" color="secondary">{copy.masked}</SpText> : null}</View> : null}
  </View>;
}
const styles = StyleSheet.create({ row: { paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, gap: space.xs }, heading: { flexDirection: "row", alignItems: "center", gap: space.md }, name: { flex: 1, fontWeight: "700" }, badge: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs }, actions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: space.sm }, note: { padding: space.md, borderRadius: radius.md, gap: space.sm } });
