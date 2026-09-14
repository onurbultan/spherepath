import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { FileText, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  applyNoteSegmentsSchema,
  contactSourceLabels,
  contactSources,
  nextActionTypeLabels,
  nextActionTypes,
  opportunityTypeLabels,
  segmentContactName,
  type ApplyNoteSegmentsInput,
  type ContactDraft,
  type InboxItemRecord,
  type NextActionType,
  type NoteSegmentDecision,
  type NoteSegmentReading,
  type OpportunityType,
  type SegmentContactRef,
} from "@spherepath/shared";
import { ContactPicker } from "@/shared/ui/ContactPicker";
import { PhoneInput } from "@/shared/ui/MaskedInputs";
import { SpButton, SpChoice, SpField, SpInput } from "@/shared/ui/SpField";
import { SpDateField } from "@/shared/ui/SpDateField";
import { SpText } from "@/shared/ui/SpText";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";
import type { ContactRecord } from "@/features/contacts/resources/contacts";

type RowAction = "person" | "requirement" | "portfolio" | "follow_up" | "skip";

const actionLabels: Record<RowAction, string> = {
  person: "Kişi ekle",
  requirement: "Talep aç",
  portfolio: "Havuza ekle",
  follow_up: "Takip planla",
  skip: "Atla",
};

const rowActions: RowAction[] = ["person", "requirement", "portfolio", "follow_up", "skip"];

interface RowState {
  action: RowAction;
  personName: string;
  personPhone: string;
  personSource: ContactDraft["source"];
  contactId: string;
  contactFromSegmentId: string;
  opportunityType: OpportunityType;
  nextActionType: NextActionType;
  nextActionAt: string;
}

function tomorrowMorning(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function localDateTime(value: number): string {
  return new Date(value - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function defaultAction(segment: NoteSegmentReading): RowAction {
  if (segment.kind === "person") return "person";
  if (segment.kind === "property") return segment.analysis?.portfolio ? "portfolio" : "skip";
  if (segment.kind === "requirement") return segment.matchedContactId ? "requirement" : "person";
  if (segment.kind === "follow_up") return segment.matchedContactId ? "follow_up" : "skip";
  return "skip";
}

function initialRow(segment: NoteSegmentReading): RowState {
  const analysis = segment.analysis;
  return {
    action: defaultAction(segment),
    personName: segmentContactName(segment) ?? "",
    personPhone: analysis?.insights.contactPhone?.trim() ?? "",
    personSource: segment.sectionIntent === "leads" ? "other" : "in_person",
    contactId: segment.matchedContactId ?? "",
    contactFromSegmentId: "",
    opportunityType: analysis?.opportunityType ?? "buyer_requirement",
    nextActionType: analysis?.nextActionType ?? "call",
    nextActionAt: analysis?.nextActionAt ? localDateTime(analysis.nextActionAt) : tomorrowMorning(),
  };
}

/**
 * A day's notebook page, line by line, with what each one will become. The
 * page is read down the column and every decision sits under the words it was
 * made about, so nothing on it is applied without being seen.
 */
export function NotePageReview({
  item,
  contacts,
  pending,
  error,
  onClose,
  onApply,
}: {
  item: InboxItemRecord;
  contacts: readonly ContactRecord[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onApply: (input: ApplyNoteSegmentsInput) => void;
}) {
  const theme = useSpTheme();
  const router = useRouter();
  const segments = useMemo(
    () => (item.segments ?? []).filter((segment) => segment.appliedAt === null),
    [item.segments],
  );
  const [rows, setRows] = useState<Record<string, RowState>>(
    () => Object.fromEntries(segments.map((segment) => [segment.id, initialRow(segment)])),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const update = (segmentId: string, change: Partial<RowState>) =>
    setRows((current) => ({ ...current, [segmentId]: { ...current[segmentId]!, ...change } }));

  const peopleFromThisPage = segments
    .filter((segment) => rows[segment.id]?.action === "person" && rows[segment.id]!.personName.trim().length >= 2)
    .map((segment) => ({ segmentId: segment.id, name: rows[segment.id]!.personName.trim() }));

  const creating = segments.filter((segment) => rows[segment.id]?.action !== "skip").length;
  const skipping = segments.length - creating;

  function contactRefFor(row: RowState): SegmentContactRef | null {
    if (row.contactFromSegmentId) return { kind: "segment", segmentId: row.contactFromSegmentId };
    if (row.contactId) return { kind: "existing", contactId: row.contactId };
    return null;
  }

  function submit() {
    const decisions: NoteSegmentDecision[] = [];
    for (const segment of segments) {
      const row = rows[segment.id]!;
      if (row.action === "skip") {
        decisions.push({ segmentId: segment.id, action: "skip" });
        continue;
      }
      const nextActionAt = new Date(row.nextActionAt).getTime();
      if (row.action === "person") {
        if (row.personName.trim().length < 2) return setFormError(`“${segment.text.slice(0, 40)}” için ad soyad gerekli.`);
        decisions.push({
          segmentId: segment.id,
          action: "person",
          contact: {
            fullName: row.personName.trim(),
            phone: row.personPhone.trim(),
            metAtPlace: segment.heading ?? "Günlük not",
            source: row.personSource,
            role: "unknown",
            nextActionType: row.nextActionType,
            nextActionAt,
          },
          approvedInsights: segment.analysis?.insights,
          opportunityType: null,
          recordInteraction: segment.sectionIntent !== "leads",
        });
        continue;
      }
      const contactRef = contactRefFor(row);
      if (row.action === "portfolio") {
        const portfolio = segment.analysis?.portfolio;
        if (!portfolio) return setFormError(`“${segment.text.slice(0, 40)}” için mülk bilgisi okunamadı; bu satırı tek tek işleyebilirsin.`);
        decisions.push({ segmentId: segment.id, action: "portfolio", contactRef, portfolio });
        continue;
      }
      if (!contactRef) return setFormError(`“${segment.text.slice(0, 40)}” için kişi seç.`);
      if (row.action === "requirement") {
        if (!segment.analysis) return setFormError(`“${segment.text.slice(0, 40)}” için talep bilgisi okunamadı.`);
        decisions.push({
          segmentId: segment.id,
          action: "requirement",
          contactRef,
          opportunityType: row.opportunityType === "tenant_requirement" ? "tenant_requirement" : "buyer_requirement",
          nextActionType: row.nextActionType,
          nextActionAt,
          approvedInsights: segment.analysis.insights,
        });
        continue;
      }
      decisions.push({ segmentId: segment.id, action: "follow_up", contactRef, nextActionType: row.nextActionType, nextActionAt });
    }
    const parsed = applyNoteSegmentsSchema.safeParse({ inboxItemId: item.id, decisions });
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "Kararları kontrol et.");
    setFormError(null);
    onApply(parsed.data);
  }

  const pageDate = new Intl.DateTimeFormat("tr-TR", { dateStyle: "full" }).format(item.createdAt);
  /** A heading is printed once, above the first line that sits under it. */
  const startsSection = (position: number) =>
    segments[position]!.heading !== null && segments[position]!.heading !== (position === 0 ? null : segments[position - 1]!.heading);

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
        <View style={styles.heading}>
          <View style={styles.flex}>
            <SpText variant="caption" color="secondary">GÜNLÜK NOT</SpText>
            <SpText variant="title">{pageDate}</SpText>
            <SpText variant="caption" color="secondary">
              Sayfada {segments.length} satır var. {creating} tanesi kayda dönüşecek{skipping ? `, ${skipping} tanesi olduğu gibi kalacak` : ""}.
            </SpText>
          </View>
          <Pressable accessibilityLabel="Kapat" accessibilityRole="button" disabled={pending} onPress={onClose}>
            <X color={theme.textSecondary} size={22} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {segments.map((segment, position) => {
            const row = rows[segment.id]!;
            const showHeading = startsSection(position);
            const others = peopleFromThisPage.filter((person) => person.segmentId !== segment.id);
            return (
              <View key={segment.id}>
                {showHeading ? <SpText variant="caption" color="secondary" style={styles.section}>{segment.heading}</SpText> : null}
                <View style={[styles.row, { borderColor: theme.line, opacity: row.action === "skip" ? 0.62 : 1 }]}>
                  <SpText variant="bodySmall">{segment.text}</SpText>

                  <View style={styles.choices}>
                    {rowActions.map((action) => (
                      <SpChoice key={action} label={actionLabels[action]} onPress={() => update(segment.id, { action })} selected={row.action === action} />
                    ))}
                  </View>

                  {row.action === "person" ? (
                    <>
                      <SpField label="Ad soyad"><SpInput value={row.personName} onChangeText={(value) => update(segment.id, { personName: value })} /></SpField>
                      <SpField label="Telefon" optional><PhoneInput value={row.personPhone} onChangeText={(value) => update(segment.id, { personPhone: value })} /></SpField>
                      <SpField label="Kaynak">
                        <View style={styles.choices}>
                          {contactSources.map((source) => (
                            <SpChoice key={source} label={contactSourceLabels[source]} onPress={() => update(segment.id, { personSource: source })} selected={row.personSource === source} />
                          ))}
                        </View>
                      </SpField>
                    </>
                  ) : null}

                  {row.action === "requirement" || row.action === "follow_up" || row.action === "portfolio" ? (
                    <>
                      <ContactPicker
                        contacts={contacts}
                        label="Kişi"
                        value={row.contactFromSegmentId ? "" : row.contactId}
                        onChange={(value) => update(segment.id, { contactId: value, contactFromSegmentId: "" })}
                      />
                      {others.length ? (
                        <SpField label="Ya da bu sayfadan">
                          <View style={styles.choices}>
                            {others.map((person) => (
                              <SpChoice
                                key={person.segmentId}
                                label={person.name}
                                onPress={() => update(segment.id, { contactFromSegmentId: person.segmentId, contactId: "" })}
                                selected={row.contactFromSegmentId === person.segmentId}
                              />
                            ))}
                          </View>
                        </SpField>
                      ) : null}
                    </>
                  ) : null}

                  {row.action === "requirement" ? (
                    <SpField label="Talep türü">
                      <View style={styles.choices}>
                        {(["buyer_requirement", "tenant_requirement"] as const).map((type) => (
                          <SpChoice key={type} label={opportunityTypeLabels[type]} onPress={() => update(segment.id, { opportunityType: type })} selected={row.opportunityType === type} />
                        ))}
                      </View>
                    </SpField>
                  ) : null}

                  {row.action === "person" || row.action === "requirement" || row.action === "follow_up" ? (
                    <>
                      <SpField label="Sonraki adım">
                        <View style={styles.choices}>
                          {nextActionTypes.map((type) => (
                            <SpChoice key={type} label={nextActionTypeLabels[type]} onPress={() => update(segment.id, { nextActionType: type })} selected={row.nextActionType === type} />
                          ))}
                        </View>
                      </SpField>
                      <SpDateField label="Ne zaman" value={row.nextActionAt} onChange={(value) => update(segment.id, { nextActionAt: value })} />
                    </>
                  ) : null}

                  {/* Some lines are a negotiation, not a note: a counter-offer, a
                      follow-up that belongs to somebody else, a conversation that
                      happened last week. Those need the full form, and it is one
                      tap away rather than a different place to have gone. */}
                  {row.action !== "skip" && row.action !== "portfolio" ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        onClose();
                        router.push(`/(tabs)/capture?contactId=${encodeURIComponent(row.contactId)}&outcome=${encodeURIComponent(segment.text.slice(0, 500))}`);
                      }}
                      style={styles.detailAction}
                    >
                      <FileText color={theme.deed} size={14} />
                      <SpText variant="caption" color="deed">Bunun yerine detaylı görüşme kaydet</SpText>
                    </Pressable>
                  ) : null}

                  {row.action === "portfolio" ? (
                    <SpText variant="caption" color={segment.analysis?.portfolio ? "secondary" : "ask"}>
                      {segment.analysis?.portfolio
                        ? `${segment.analysis.portfolio.headline} · ${segment.analysis.portfolio.location}`
                        : "Bu satırdan mülk bilgisi çıkarılamadı."}
                    </SpText>
                  ) : null}
                </View>
              </View>
            );
          })}

          {formError ?? error ? <SpText accessibilityRole="alert" color="ask" variant="bodySmall">{formError ?? error}</SpText> : null}
          <SpButton
            disabled={pending || creating === 0}
            label={pending ? "Oluşturuluyor…" : `${creating} kaydı oluştur`}
            onPress={submit}
            size="lg"
          />
          <SpButton disabled={pending} label="Vazgeç" onPress={onClose} tone="secondary" />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/** How many items on this page are still waiting for a decision. */
export function pageSegmentCount(item: InboxItemRecord): number {
  return (item.segments ?? []).filter((segment) => segment.appliedAt === null).length;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.lg },
  flex: { flex: 1 },
  body: { gap: space.md, padding: space.lg, paddingTop: 0 },
  section: { marginTop: space.md, marginBottom: space.xs },
  row: { gap: space.sm, padding: space.md, borderWidth: 1, borderRadius: radius.lg },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  detailAction: { flexDirection: "row", alignItems: "center", gap: space.xs },
});
