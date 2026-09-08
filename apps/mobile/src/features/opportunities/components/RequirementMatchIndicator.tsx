import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { House } from "lucide-react-native";
import { isOpenRequirement, opportunityMatchIndicator, requirementMatchAccessibleLabel, requirementMatchCopy, type OpportunityMatchSummary } from "@spherepath/shared";
import { buttonMetrics, SpButton } from "@/shared/ui/SpField";
import { SpText } from "@/shared/ui/SpText";
import { space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import type { OpportunityRecord } from "../resources/opportunities";
import { RequirementMatches } from "./RequirementMatches";

export function RequirementMatchIndicator({ opportunity, summary, status }: {
  opportunity: OpportunityRecord;
  summary?: OpportunityMatchSummary;
  status: "pending" | "error" | "success";
}) {
  const [open, setOpen] = useState(false);
  const theme = useSpTheme();
  if (!isOpenRequirement(opportunity)) return null;
  const indicator = opportunityMatchIndicator(summary);
  if (status === "pending" && !open) return <SpText variant="caption" color="secondary" accessibilityLiveRegion="polite">{requirementMatchCopy.loading}</SpText>;
  if (!indicator && status !== "error" && !open) return null;
  const label = status === "error" ? requirementMatchCopy.error : [indicator?.label, indicator?.hint].filter(Boolean).join(" · ");
  const review = indicator?.review || status === "error";
  return <>
    {indicator || status === "error" ? <Pressable accessibilityRole="button"
      accessibilityLabel={requirementMatchAccessibleLabel(opportunity.subjectContactName, label)}
      style={[styles.indicator, { backgroundColor: review ? theme.warmBg : theme.deedBg, borderColor: theme.line }]} onPress={() => setOpen(true)}>
      <House size={16} color={review ? theme.warm : theme.deed} />
      <SpText variant="bodySmall" style={{ flexShrink: 1, color: review ? theme.warm : theme.deed }}>{label}</SpText>
    </Pressable> : null}
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}><SpText variant="eyebrow" color="deed">{requirementMatchCopy.eyebrow}</SpText><SpButton tone="quiet" label={requirementMatchCopy.close} onPress={() => setOpen(false)} /></View>
          <SpText variant="title">{opportunity.subjectContactName}</SpText>
          {open ? <RequirementMatches opportunity={opportunity} /> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  indicator: { ...buttonMetrics, alignSelf: "flex-start", maxWidth: "100%" },
  content: { padding: space.xl, gap: space.lg, paddingBottom: space["5xl"] },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.md },
});
