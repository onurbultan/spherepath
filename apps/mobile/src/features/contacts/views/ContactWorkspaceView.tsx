import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BriefcaseBusiness, Building2, MessageSquarePlus, MessageSquareText, Pencil, PhoneIncoming, PhoneMissed, PhoneOutgoing, ShieldCheck } from "lucide-react-native";
import {
  apiQueryKeys,
  askOutcomeLabels,
  buildMemoryHighlights,
  contactRoleLabels,
  contactSourceLabels,
  interactionChannelLabels,
  interactionObjectiveLabels,
  nextActionTypeLabels,
  opportunityStageLabel,
  opportunityTypeLabels,
  type CallRecordView,
  type DailyTaskOutcome,
  type TodayTask,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listOpportunities } from "@/features/opportunities/resources/opportunities";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { SpChoice } from "@/shared/ui/SpField";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";
import { ContactCallAction } from "../components/ContactCallAction";
import { finishDailyTask } from "@/features/today/resources/today";
import { TaskResolutionSheet } from "@/features/today/components/TaskResolutionSheet";
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
  const [referenceTime] = useState(Date.now);
  const theme = useSpTheme();
  const router = useRouter();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("timeline");
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskPending, setTaskPending] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts, enabled: Boolean(session) });
  const callsQuery = useQuery({ queryKey: apiQueryKeys.contactCalls(contactId), queryFn: () => listContactCalls(contactId), enabled: Boolean(session) });
  const interactionsQuery = useQuery({ queryKey: apiQueryKeys.contactInteractions(contactId), queryFn: () => listContactInteractions(contactId), enabled: Boolean(session) });
  const opportunitiesQuery = useQuery({ queryKey: apiQueryKeys.opportunities, queryFn: listOpportunities, enabled: Boolean(session) });

  const contact = contactsQuery.data?.find((item) => item.id === contactId);
  const opportunities = (opportunitiesQuery.data ?? []).filter((item) => item.subjectContactId === contactId);
  // The card used to say "Belirlenmedi" while two opportunities underneath it
  // carried dated steps, so a contact with work waiting read as a contact with none.
  const nextStep = (() => {
    const own = contact?.relationship.nextActionType
      ? { id: `next-action-${contact.id}`, opportunityId: undefined, type: contact.relationship.nextActionType, at: contact.relationship.nextActionAt, fromOpportunity: false }
      : null;
    const fromOpportunities = opportunities
      .filter((item) => item.stage !== "won" && item.stage !== "lost" && item.nextActionType !== null)
      .map((item) => ({ id: `opportunity-action-${item.id}`, opportunityId: item.id, type: item.nextActionType!, at: item.nextActionAt, fromOpportunity: true }))
      .sort((left, right) => (left.at ?? Infinity) - (right.at ?? Infinity))[0] ?? null;
    if (!own) return fromOpportunities;
    if (!fromOpportunities) return own;
    return (own.at ?? Infinity) <= (fromOpportunities.at ?? Infinity) ? own : fromOpportunities;
  })();
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
  const ownerRole = contact.roles.some((role) => role === "seller" || role === "landlord");
  const demandRole = contact.roles.some((role) => role === "buyer" || role === "tenant" || role === "investor");
  const task: TodayTask | null = nextStep ? {
    id: nextStep.id,
    contactId: contact.id,
    opportunityId: nextStep.opportunityId,
    title: name,
    reason: nextActionTypeLabels[nextStep.type],
    dueAt: nextStep.at,
    type: "next_action",
    priority: nextStep.at !== null && nextStep.at < referenceTime ? "overdue" : nextStep.fromOpportunity ? "bottleneck" : "relationship",
    contactRoles: contact.roles,
    lastTouchAt: contact.relationship.lastTouchAt,
    opportunityType: nextStep.opportunityId ? opportunities.find((item) => item.id === nextStep.opportunityId)?.type : undefined,
    opportunityStage: nextStep.opportunityId ? opportunities.find((item) => item.id === nextStep.opportunityId)?.stage : undefined,
  } : null;

  async function resolveTask(outcome: DailyTaskOutcome) {
    if (!session) return;
    setTaskPending(true); setTaskError(null);
    try {
      await finishDailyTask(session, outcome);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunities }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ]);
      setTaskOpen(false);
    } catch (error) { setTaskError(error instanceof Error ? error.message : "Görev güncellenemedi."); }
    finally { setTaskPending(false); }
  }

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
              {(contact.roles.length ? contact.roles : ["unknown" as const]).map((role) => contactRoleLabels[role]).join(" · ")} · {contactSourceLabels[contact.source]} · {contact.phone ?? "Telefon eklenmedi"}
            </SpText>
            {contact.internalLabel ?? (contact.fullName ? contact.label : null) ? <SpText variant="caption" color="secondary">İç etiket: {contact.internalLabel ?? contact.label}</SpText> : null}
          </View>
        </View>

        {contact.phone ? <ContactCallAction contactId={contact.id} /> : null}
        <View style={styles.quickActions}>
          <Pressable onPress={() => router.push({ pathname: "/(tabs)/capture", params: { contactId: contact.id } })} style={[styles.quickAction, { backgroundColor: theme.ask }]}><MessageSquarePlus color={theme.onAsk} size={17} /><SpText style={{ color: theme.onAsk }}>Temas kaydet</SpText></Pressable>
          {ownerRole ? <Pressable onPress={() => router.push({ pathname: "/(tabs)/listings", params: { action: "add-listing", ownerContactId: contact.id } })} style={[styles.quickAction, { borderColor: theme.line }]}><Building2 color={theme.deed} size={17} /><SpText color="deed">Yetkili portföy</SpText></Pressable> : demandRole ? <Pressable onPress={() => router.push({ pathname: "/(tabs)/opportunities", params: { create: "1", contactId: contact.id } })} style={[styles.quickAction, { borderColor: theme.line }]}><BriefcaseBusiness color={theme.deed} size={17} /><SpText color="deed">Talep fırsatı aç</SpText></Pressable> : null}
          <Pressable accessibilityLabel="Kişiyi düzenle" onPress={() => router.push({ pathname: "/(tabs)/contacts", params: { contactId: contact.id, action: "edit" } })} style={[styles.quickAction, { borderColor: theme.line }]}><Pencil color={theme.textSecondary} size={17} /></Pressable>
        </View>

        <View style={styles.summary}>
          <SpCard style={styles.summaryCard}>
            <SpText variant="caption" color="secondary">Son görüşme</SpText>
            <SpText variant="bodySmall">
              {contact.relationship.lastTouchAt ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(contact.relationship.lastTouchAt) : "Henüz yok"}
            </SpText>
          </SpCard>
          <SpCard style={styles.summaryCard}>
            <SpText variant="caption" color="secondary">Sonraki adım</SpText>
            <SpText variant="bodySmall">{nextStep ? nextActionTypeLabels[nextStep.type] : "Belirlenmedi"}</SpText>
            {nextStep?.at ? <SpText variant="caption" color="secondary">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(nextStep.at)}{nextStep.fromOpportunity ? " · fırsattan" : ""}</SpText> : null}
            {task ? <Pressable onPress={() => { setTaskError(null); setTaskOpen(true); }}><SpText variant="caption" color="deed">Tamamla veya ertele</SpText></Pressable> : null}
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
                    {call.answered ? <View style={[styles.chip, { backgroundColor: theme.sunk }]}><SpText variant="caption" color="secondary">Yalnız arama bilgisi</SpText></View> : null}
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
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/(tabs)/contacts", params: { contactId: contact.id, action: "privacy" } })}
              style={[styles.privacyAction, { backgroundColor: theme.ask }]}
            >
              <SpText style={{ color: theme.onAsk }}>İzinleri düzenle</SpText>
            </Pressable>
          </SpCard>
        ) : null}
      </ScrollView>
      <TaskResolutionSheet task={taskOpen ? task : null} pending={taskPending} error={taskError} onClose={() => setTaskOpen(false)} onResolve={(outcome) => void resolveTask(outcome)} />
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
  quickActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  quickAction: { minHeight: 44, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  privacyAction: { alignItems: "center", alignSelf: "flex-start", borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  entry: { gap: space.sm },
  entryTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm },
});
