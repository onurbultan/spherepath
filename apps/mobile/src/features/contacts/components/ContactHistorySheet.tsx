import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MessageSquareText, PhoneIncoming, PhoneMissed, PhoneOutgoing, Sparkles, X } from "lucide-react-native";
import {
  apiQueryKeys,
  askOutcomeLabels,
  callRecordingStatusLabels,
  callSummaryLabel,
  interactionChannelLabels,
  interactionObjectiveLabels,
  type CallRecordView,
} from "@spherepath/shared";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";
import { listContactCalls, listContactInteractions, type ContactInteractionRecord } from "../resources/contacts";

function dateTime(value: number): string {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}

function spokenFor(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1_000);
  if (seconds < 60) return `${seconds} sn`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} dk ${rest} sn` : `${minutes} dk`;
}

function callHeadline(call: CallRecordView): string {
  if (!call.answered) return call.direction === "inbound" ? "Cevapsız arama" : "Ulaşılamadı";
  return call.direction === "inbound" ? "Gelen arama" : call.direction === "outbound" ? "Giden arama" : "Dahili arama";
}

type Entry =
  | { kind: "call"; at: number; call: CallRecordView }
  | { kind: "interaction"; at: number; interaction: ContactInteractionRecord };

/**
 * Calls and logged interactions describe the same relationship from two sides, so
 * they share one timeline: an unanswered call is as much a part of the story as a
 * confirmed conversation, and only the order makes either legible.
 */
export function ContactHistorySheet({ contactId, contactName, onClose }: { contactId: string | null; contactName: string; onClose: () => void }) {
  const router = useRouter();
  const theme = useSpTheme();
  const enabled = Boolean(contactId);
  const callsQuery = useQuery({ queryKey: apiQueryKeys.contactCalls(contactId ?? "none"), queryFn: () => listContactCalls(contactId!), enabled });
  const interactionsQuery = useQuery({ queryKey: apiQueryKeys.contactInteractions(contactId ?? "none"), queryFn: () => listContactInteractions(contactId!), enabled });

  const entries: Entry[] = [
    ...(callsQuery.data ?? []).map((call) => ({ kind: "call" as const, at: call.startedAt ?? call.createdAt, call })),
    ...(interactionsQuery.data ?? []).map((interaction) => ({ kind: "interaction" as const, at: interaction.occurredAt, interaction })),
  ].sort((left, right) => right.at - left.at);
  const loading = callsQuery.isPending || interactionsQuery.isPending;

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={enabled}>
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.header}>
            <View>
              <SpText variant="eyebrow" color="deed">GEÇMİŞ</SpText>
              <SpText variant="hero">{contactName}</SpText>
            </View>
            <Pressable accessibilityLabel="Kapat" onPress={onClose} style={[styles.iconButton, { borderColor: theme.line }]}>
              <X color={theme.textSecondary} size={20} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Geçmiş yükleniyor…</SpText></View>
          ) : !entries.length ? (
            <SpCard><SpText color="secondary">Bu kişiyle henüz kayıtlı bir görüşme yok.</SpText></SpCard>
          ) : entries.map((entry) => {
            if (entry.kind === "call") {
              const call = entry.call;
              const Icon = !call.answered ? PhoneMissed : call.direction === "outbound" ? PhoneOutgoing : PhoneIncoming;
              const missed = !call.answered;
              return (
                <SpCard key={`call-${call.id}`} style={styles.entry}>
                  <View style={styles.entryTop}>
                    <View style={[styles.icon, { backgroundColor: missed ? theme.askBg : theme.deedBg }]}>
                      <Icon color={missed ? theme.ask : theme.deed} size={17} />
                    </View>
                    <View style={styles.entryCopy}>
                      <SpText variant="title">{callHeadline(call)}</SpText>
                      <SpText variant="caption" color="secondary">{dateTime(entry.at)}</SpText>
                    </View>
                  </View>
                  <SpText variant="bodySmall" color="secondary">
                    {call.answered ? `${spokenFor(call.talkDurationMs)} görüşüldü.` : "Görüşme gerçekleşmedi; geri dönülmeyi bekliyor."}
                  </SpText>
                  <View style={styles.chips}>
                    {call.answered ? <View style={[styles.chip, { backgroundColor: theme.sunk }]}><SpText variant="caption" color="secondary">{callRecordingStatusLabels[call.recordingStatus]}</SpText></View> : null}
                    {callSummaryLabel(call) ? (
                      // Saying a summary is waiting without a way to reach it
                      // leaves the advisor hunting for the capture screen.
                      <Pressable
                        disabled={call.noteStatus !== "needs_review" || !call.contactId}
                        onPress={() => router.push(`/capture?contactId=${encodeURIComponent(call.contactId!)}`)}
                        style={[styles.chip, { backgroundColor: theme.deedBg }]}
                      >
                        <Sparkles color={theme.deed} size={12} />
                        <SpText variant="caption" color="deed">{callSummaryLabel(call)}</SpText>
                      </Pressable>
                    ) : null}
                    {call.contactCreatedFromCall ? <View style={[styles.chip, { backgroundColor: theme.sunk }]}><SpText variant="caption" color="secondary">Bu aramayla eklendi</SpText></View> : null}
                  </View>
                </SpCard>
              );
            }
            const interaction = entry.interaction;
            return (
              <SpCard key={`interaction-${interaction.id}`} style={styles.entry}>
                <View style={styles.entryTop}>
                  <View style={[styles.icon, { backgroundColor: theme.sunk }]}><MessageSquareText color={theme.textSecondary} size={17} /></View>
                  <View style={styles.entryCopy}>
                    <SpText variant="title">{interactionObjectiveLabels[interaction.objective]}</SpText>
                    <SpText variant="caption" color="secondary">{dateTime(entry.at)}</SpText>
                  </View>
                </View>
                <SpText variant="bodySmall" color="secondary">{interaction.outcome ?? "Temas kaydedildi."}</SpText>
                {interaction.noteSummary ? <SpText variant="caption" color="secondary">{interaction.noteSummary}</SpText> : null}
                <View style={styles.chips}>
                  <View style={[styles.chip, { backgroundColor: theme.sunk }]}><SpText variant="caption" color="secondary">{interactionChannelLabels[interaction.channel]}</SpText></View>
                  <View style={[styles.chip, { backgroundColor: theme.sunk }]}><SpText variant="caption" color="secondary">{askOutcomeLabels[interaction.askOutcome]}</SpText></View>
                </View>
              </SpCard>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.md, marginBottom: space.sm },
  iconButton: { width: 40, height: 40, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  state: { alignItems: "center", gap: space.sm, paddingVertical: space.xl },
  entry: { gap: space.sm },
  entryTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  entryCopy: { flex: 1, gap: 2 },
  icon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm },
});
