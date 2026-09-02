import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BriefcaseBusiness, MessageSquareText, PhoneIncoming, PhoneMissed, PhoneOutgoing, ShieldCheck, Sparkles } from "lucide-react-native";
import {
  apiQueryKeys,
  askOutcomeLabels,
  buildMemoryHighlights,
  callRecordingStatusLabels,
  callSummaryLabel,
  contactRoleLabels,
  contactSourceLabels,
  interactionChannelLabels,
  interactionObjectiveLabels,
  nextActionTypeLabels,
  opportunityStageLabel,
  opportunityTypeLabels,
  type CallRecordView,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listOpportunities } from "@/features/opportunities/resources/opportunities";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { SpChoice } from "@/shared/ui/SpField";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";
import { ContactCallAction } from "../components/ContactCallAction";
import {
  listContactCalls,
  listContactInteractions,
  listContacts,
  type ContactInteractionRecord,
} from "../resources/contacts";

type Tab = "timeline" | "memory" | "opportunities" | "privacy";

const tabLabels: Record<Tab, string> = {
  timeline: "Görüşmeler",
  memory: "Hafıza",
  opportunities: "Fırsatlar",
  privacy: "İzinler",
};

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
 * The contact's own page. Opening a contact from the list used to lead nowhere
 * on mobile: everything about a person lived in a card and a few action buttons,
 * while the web build had a page with the history, the memory, the open
 * opportunities and the consent record all reachable.
 */
export default function ContactWorkspaceView({ contactId }: { contactId: string }) {
  const theme = useSpTheme();
  const router = useRouter();
  const { session } = useSession();
  const [tab, setTab] = useState<Tab>("timeline");
  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts, enabled: Boolean(session) });
  const callsQuery = useQuery({ queryKey: apiQueryKeys.contactCalls(contactId), queryFn: () => listContactCalls(contactId), enabled: Boolean(session) });
  const interactionsQuery = useQuery({ queryKey: apiQueryKeys.contactInteractions(contactId), queryFn: () => listContactInteractions(contactId), enabled: Boolean(session) });
  const opportunitiesQuery = useQuery({ queryKey: apiQueryKeys.opportunities, queryFn: listOpportunities, enabled: Boolean(session) });

  const contact = contactsQuery.data?.find((item) => item.id === contactId);
  const opportunities = (opportunitiesQuery.data ?? []).filter((item) => item.subjectContactId === contactId);
  const entries: Entry[] = [
    ...(callsQuery.data ?? []).map((call) => ({ kind: "call" as const, at: call.startedAt ?? call.createdAt, call })),
    ...(interactionsQuery.data ?? []).map((interaction) => ({ kind: "interaction" as const, at: interaction.occurredAt, interaction })),
  ].sort((left, right) => right.at - left.at);

  if (contactsQuery.isPending) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Kişi hazırlanıyor…</SpText></View>
      </SafeAreaView>
    );
  }

  if (!contact) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.state}>
          <SpText variant="title">Kişi bulunamadı</SpText>
          <Pressable onPress={() => router.back()}><SpText color="deed">Kişilere dön</SpText></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const name = contact.fullName ?? contact.label ?? "İsimsiz kişi";
  const memoryHighlights = buildMemoryHighlights(contact.memory);

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Geri" onPress={() => router.back()} style={[styles.back, { borderColor: theme.line }]}>
            <ArrowLeft color={theme.textSecondary} size={20} />
          </Pressable>
          <View style={styles.flex}>
            <SpText variant="eyebrow" color="deed">KİŞİ ÇALIŞMA SAYFASI</SpText>
            <SpText variant="hero">{name}</SpText>
            <SpText variant="bodySmall" color="secondary">
              {contactRoleLabels[contact.roles[0] ?? "unknown"]} · {contactSourceLabels[contact.source]} · {contact.phone ?? "Telefon eklenmedi"}
            </SpText>
          </View>
        </View>

        {contact.phone ? <ContactCallAction contactId={contact.id} /> : null}

        <View style={styles.summary}>
          <SpCard style={styles.summaryCard}>
            <SpText variant="caption" color="secondary">Son görüşme</SpText>
            <SpText variant="bodySmall">
              {contact.relationship.lastTouchAt ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(contact.relationship.lastTouchAt) : "Henüz yok"}
            </SpText>
          </SpCard>
          <SpCard style={styles.summaryCard}>
            <SpText variant="caption" color="secondary">Sonraki adım</SpText>
            <SpText variant="bodySmall">{contact.relationship.nextActionType ? nextActionTypeLabels[contact.relationship.nextActionType] : "Belirlenmedi"}</SpText>
          </SpCard>
          <SpCard style={styles.summaryCard}>
            <SpText variant="caption" color="secondary">Açık fırsat</SpText>
            <SpText variant="bodySmall">{opportunities.filter((item) => item.stage !== "won" && item.stage !== "lost").length}</SpText>
          </SpCard>
        </View>

        <View accessibilityRole="tablist" style={styles.tabs}>
          {(Object.keys(tabLabels) as Tab[]).map((item) => (
            <SpChoice key={item} label={tabLabels[item]} onPress={() => setTab(item)} selected={tab === item} />
          ))}
        </View>

        {tab === "timeline" ? (
          entries.length ? entries.map((entry) => {
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
                    <View style={styles.flex}>
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
                  <View style={styles.flex}>
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
          }) : <SpCard><SpText color="secondary">Bu kişiyle henüz kayıtlı bir görüşme yok.</SpText></SpCard>
        ) : null}

        {tab === "memory" ? (
          <SpCard style={styles.entry}>
            <SpText variant="title">Hatırlanacaklar</SpText>
            {contact.memory.keyThingsToRemember.length
              ? contact.memory.keyThingsToRemember.map((item) => <SpText key={item} variant="bodySmall" color="secondary">· {item}</SpText>)
              : <SpText variant="bodySmall" color="secondary">Henüz hatırlanacak bilgi yok.</SpText>}
            <SpText variant="title">Gayrimenkul tercihleri</SpText>
            {memoryHighlights.length ? (
              <View style={styles.chips}>
                {memoryHighlights.map((item) => (
                  <View key={item} style={[styles.chip, { backgroundColor: theme.sunk }]}><SpText variant="caption" color="secondary">{item}</SpText></View>
                ))}
              </View>
            ) : <SpText variant="bodySmall" color="secondary">Henüz gayrimenkul tercihi kaydedilmedi.</SpText>}
          </SpCard>
        ) : null}

        {tab === "opportunities" ? (
          opportunities.length ? opportunities.map((item) => (
            <SpCard key={item.id} style={styles.entry}>
              <View style={styles.entryTop}>
                <View style={[styles.icon, { backgroundColor: theme.deedBg }]}><BriefcaseBusiness color={theme.deed} size={17} /></View>
                <View style={styles.flex}>
                  <SpText variant="title">{opportunityTypeLabels[item.type]}</SpText>
                  <SpText variant="caption" color="secondary">{opportunityStageLabel(item.stage, item.type)}</SpText>
                </View>
              </View>
            </SpCard>
          )) : <SpCard><SpText color="secondary">Bu kişi için fırsat yok.</SpText></SpCard>
        ) : null}

        {tab === "privacy" ? (
          <SpCard style={styles.entry}>
            <View style={styles.entryTop}>
              <View style={[styles.icon, { backgroundColor: theme.deedBg }]}><ShieldCheck color={theme.deed} size={17} /></View>
              <SpText variant="title" style={styles.flex}>Aydınlatma ve izinler</SpText>
            </View>
            <SpText variant="bodySmall" color="secondary">
              {contact.privacy.noticeStatus === "completed" ? "Aydınlatma tamamlandı." : "Aydınlatma bekliyor."}
              {" "}
              {contact.privacy.marketingConsent === "granted"
                ? "Pazarlama izni var."
                : contact.privacy.marketingConsent === "withdrawn"
                  ? "Kişi iletişim istemedi; pazarlama izni geri çekildi."
                  : "Pazarlama izni bilinmiyor."}
            </SpText>
          </SpCard>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: space.xl, paddingBottom: space["5xl"], gap: space.md },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.sm },
  header: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  back: { width: 44, height: 44, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, gap: 2 },
  summary: { flexDirection: "row", gap: space.sm },
  summaryCard: { flex: 1, gap: space.xs },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  entry: { gap: space.sm },
  entryTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm },
});
