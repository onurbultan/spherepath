import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, ListChecks, Mic, NotebookPen } from "lucide-react-native";
import {
  apiQueryKeys,
  commercialQueryKeys,
  activeMentionQuery,
  completeMention,
  findDailyPage,
  istanbulDayKey,
  noteMaxLength,
  type ApplyNoteSegmentsInput,
  type InboxItemRecord,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listContacts } from "@/features/contacts/resources/contacts";
import { SpButton, SpTextarea } from "@/shared/ui/SpField";
import { SpText } from "@/shared/ui/SpText";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";
import { applyNotePage, changeInboxItem, createInboxNote, listInboxItems } from "../resources/inbox";
import { NotePageReview } from "../components/NotePageReview";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Not kaydedilemedi.";

/**
 * A day's page, the way an advisor already keeps one: open it, write what
 * happened, close it. There is nothing to classify and nobody to pick before
 * typing -- the page is cut into its items afterwards, and the advisor decides
 * what each one becomes.
 *
 * One page per day, added to rather than replaced, because that is what a
 * notebook is. The structured conversation form has not gone anywhere; it is
 * now reached from a line that turns out to need it.
 */
export function DailyNoteView() {
  const theme = useSpTheme();
  const router = useRouter();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [openedAt] = useState(() => Date.now());
  const [dayKey] = useState(() => istanbulDayKey(Date.now()));
  // The plan can send the advisor back to a page from a day that has passed.
  // Without this the link opened today's empty page, which says nothing about
  // the note the plan was asking them to finish.
  const { inboxItemId: requestedItemId = "" } = useLocalSearchParams<{ inboxItemId?: string }>();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [applyPending, setApplyPending] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const inbox = useQuery({
    queryKey: apiQueryKeys.inboxItems,
    queryFn: () => listInboxItems(session ?? undefined),
    enabled: Boolean(session),
    refetchInterval: (query) => (query.state.data as InboxItemRecord[] | undefined)?.some((item) => item.analysisStatus === "pending") ? 1_500 : false,
  });
  const contacts = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts, enabled: Boolean(session) });

  const page = requestedItemId
    ? (inbox.data ?? []).find((item) => item.id === requestedItemId) ?? null
    : findDailyPage(inbox.data ?? [], dayKey);
  const waiting = (page?.segments ?? []).filter((segment) => segment.appliedAt === null);

  // The page's own text is the starting value. The moment the advisor types,
  // the draft is theirs and a background refetch cannot take it back.
  const text = draft ?? page?.safeText ?? "";

  // Tagging somebody mid-sentence, the way you tag them in a comment. The name
  // goes in as plain text; the page resolves it to a contact when it is read.
  const [mention, setMention] = useState<{ query: string; start: number; caret: number } | null>(null);
  const mentionMatches = mention
    ? (contacts.data ?? [])
      .filter((contact) => {
        const name = (contact.fullName ?? contact.label ?? "").toLocaleLowerCase("tr-TR");
        return name.length > 1 && name.includes(mention.query.toLocaleLowerCase("tr-TR"));
      })
      .slice(0, 6)
    : [];

  function syncMention(value: string, caret: number) {
    const active = activeMentionQuery(value, caret);
    setMention(active ? { ...active, caret } : null);
  }

  function pickMention(name: string) {
    if (!mention) return;
    // Recomputed against the text as it stands, because a caret remembered from
    // an earlier keystroke is stale the moment another letter is typed, and the
    // name then gets kept as well as replaced -- "@Deniz Aktaş Aktaş".
    const active = activeMentionQuery(text, mention.caret) ?? mention;
    setDraft(completeMention(text, active.start, mention.caret, name).text);
    setMention(null);
    setSavedAt(false);
  }

  async function save() {
    if (!session || !text.trim()) return;
    setSaving(true); setError(null);
    try {
      if (page) await changeInboxItem(session, { inboxItemId: page.id, text: text.trim() });
      else await createInboxNote(session, text.trim(), "typed", dayKey);
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.inboxItems });
      setSavedAt(true);
    } catch (next) { setError(messageFrom(next)); }
    finally { setSaving(false); }
  }

  async function apply(input: ApplyNoteSegmentsInput) {
    if (!session) return;
    setApplyPending(true); setApplyError(null);
    try {
      await applyNotePage(session, input);
      await Promise.all(commercialQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      await inbox.refetch();
      setReviewOpen(false);
    } catch (next) { setApplyError(messageFrom(next)); }
    finally { setApplyPending(false); }
  }

  const dateLabel = new Intl.DateTimeFormat("tr-TR", { dateStyle: "full" }).format(requestedItemId && page ? page.createdAt : openedAt);
  const isPastPage = Boolean(requestedItemId && page && page.createdAt < openedAt && istanbulDayKey(page.createdAt) !== dayKey);
  const dirty = text.trim() !== (page?.safeText ?? "");

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.flex}>
            <SpText variant="caption" color="secondary">{isPastPage ? "GEÇMİŞ SAYFA" : "GÜNLÜK NOT"}</SpText>
            <SpText variant="title">{dateLabel}</SpText>
          </View>
          {isPastPage ? (
            <Pressable accessibilityLabel="Bugünün sayfası" accessibilityRole="button" hitSlop={8} onPress={() => router.replace("/note" as never)}>
              <NotebookPen color={theme.deed} size={20} />
            </Pressable>
          ) : null}
          <Pressable accessibilityLabel="Sesli anlat" accessibilityRole="button" hitSlop={8} onPress={() => router.push("/(tabs)/capture")}>
            <Mic color={theme.deed} size={20} />
          </Pressable>
        </View>
        <SpText variant="bodySmall" color="secondary">
          {isPastPage
            ? "Bu sayfa geçmiş bir günün notu. Kalan satırları karara bağlayabilir, sayfaya ekleme yapabilirsin."
            : "Aklındakini olduğu gibi yaz. Satırlara ayırmayı ve neye dönüşeceğini sonra birlikte kararlaştırırız."}
        </SpText>

        <SpTextarea
          accessibilityLabel="Günün notu"
          maxLength={noteMaxLength}
          onChangeText={(value) => { setDraft(value); setSavedAt(false); syncMention(value, value.length); }}
          onSelectionChange={(event) => syncMention(text, event.nativeEvent.selection.start)}
          placeholder={"Ayşe ve Murat ile tanıştım, Zeytinler'de ikiz villaları var\nAkın'ın 4 dönüm tarlası için yetki aldım\n\nYapılacaklar\n\nGökhan'a tarlanın durumunu yaz"}
          style={styles.area}
          value={text}
        />

        {mention && mentionMatches.length ? (
          <View style={[styles.mentionPicker, { borderColor: theme.line }]} accessibilityLabel="Kişi etiketle">
            {mentionMatches.map((contact) => (
              <Pressable key={contact.id} onPress={() => pickMention(contact.fullName ?? contact.label ?? "")} style={styles.mentionOption}>
                <SpText variant="bodySmall">{contact.fullName ?? contact.label}</SpText>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          <SpText variant="caption" color="secondary">{text.length.toLocaleString("tr-TR")} / {noteMaxLength.toLocaleString("tr-TR")}</SpText>
          {savedAt && !dirty ? (
            <View style={styles.saved}><CheckCheck color={theme.deed} size={15} /><SpText variant="caption" color="deed">Kaydedildi</SpText></View>
          ) : null}
        </View>
        <SpButton
          disabled={saving || !dirty || !text.trim()}
          label={saving ? "Kaydediliyor…" : page ? "Sayfayı güncelle" : "Sayfayı kaydet"}
          onPress={() => void save()}
          size="lg"
        />
        {error ? <SpText accessibilityRole="alert" color="ask" variant="bodySmall">{error}</SpText> : null}

        {page?.analysisStatus === "pending" ? (
          <SpText variant="bodySmall" color="secondary">Sayfa okunuyor…</SpText>
        ) : page && waiting.length ? (
          <View style={[styles.ready, { borderColor: theme.deed, backgroundColor: theme.deedBg }]}>
            <View style={styles.flex}>
              <SpText variant="title">{waiting.length} satır karar bekliyor</SpText>
              <SpText variant="caption" color="secondary">Her satırın neye dönüşeceğine sen karar verirsin.</SpText>
            </View>
            <SpButton
              disabled={dirty}
              icon={<ListChecks color={theme.onDeed} size={17} />}
              label="Sayfayı işle"
              onPress={() => { setApplyError(null); setReviewOpen(true); }}
            />
          </View>
        ) : page ? (
          <SpText variant="bodySmall" color="secondary">Bu sayfadaki her satır karara bağlandı.</SpText>
        ) : (
          <View style={styles.empty}>
            <NotebookPen color={theme.textSecondary} size={17} />
            <SpText variant="bodySmall" color="secondary">Bugün için henüz sayfa yok.</SpText>
          </View>
        )}
        {dirty && waiting.length ? <SpText variant="caption" color="secondary">Önce değişiklikleri kaydet; satırlar yeniden okunacak.</SpText> : null}
      </ScrollView>

      {reviewOpen && page ? (
        <NotePageReview
          item={page}
          contacts={contacts.data ?? []}
          pending={applyPending}
          error={applyError}
          onClose={() => setReviewOpen(false)}
          onApply={(input) => void apply(input)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { gap: space.md, padding: space.lg },
  header: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  flex: { flex: 1, gap: 2 },
  area: { minHeight: 320, lineHeight: 24 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  saved: { flexDirection: "row", alignItems: "center", gap: space.xs },
  ready: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", borderWidth: 1, borderRadius: radius.lg, padding: space.md },
  empty: { flexDirection: "row", alignItems: "center", gap: space.sm },
  mentionPicker: { borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  mentionOption: { padding: space.md },
});
