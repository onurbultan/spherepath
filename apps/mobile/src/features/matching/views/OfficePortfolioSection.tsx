import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Network, Plus, Send, Sparkles, X } from "lucide-react-native";
import {
  apiQueryKeys,
  buildMatchMessageFallback,
  currencyCodes,
  moneyInputValue,
  parseMoneyInput,
  portfolioAuthorizationLabels,
  portfolioAuthorizationTypes,
  portfolioItemDraftSchema,
  portfolioSourceLabels,
  portfolioSources,
  propertyTypeLabels,
  propertyTypes,
  titleDeedTypeLabels,
  titleDeedTypes,
  type CurrencyCode,
  type PortfolioItemDraft,
  type PortfolioMatchRecord,
  type PortfolioSource,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { SpButton, SpChoice, SpField, SpInput, SpTextarea } from "@/shared/ui/SpField";
import { MoneyInput } from "@/shared/ui/MaskedInputs";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";
import {
  analyzePortfolioText,
  draftMatchMessage,
  listMatchNotifications,
  listPortfolioItems,
  listPortfolioMatches,
  markMatchNotificationsRead,
  savePortfolioItem,
  withdrawPortfolioItem,
} from "../resources/portfolio";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Ofis havuzu işlemi tamamlanamadı.";
const money = (amount: number, currency: CurrencyCode) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

/**
 * A pasted export usually holds several listings at once, so each message in it
 * becomes its own draft rather than one run-on record.
 */
function splitPortfolioMessages(raw: string): string[] {
  const normalized = raw.replace(/\r\n?/gu, "\n").trim();
  if (!normalized) return [];
  const header = /^(?:\[?\d{1,2}[./]\d{1,2}[./]\d{2,4}[,\s]+\d{1,2}:\d{2}(?::\d{2})?\]?\s*[-–]?\s*)[^:\n]{1,80}:\s*/u;
  const groups: string[] = [];
  let current: string[] = [];
  let sawHeader = false;
  for (const line of normalized.split("\n")) {
    if (header.test(line)) {
      sawHeader = true;
      if (current.join("\n").trim().length >= 10) groups.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.join("\n").trim().length >= 10) groups.push(current.join("\n").trim());
  if (sawHeader) return groups.slice(0, 10);
  return normalized.split(/\n\s*\n+/u).map((item) => item.trim()).filter((item) => item.length >= 10).slice(0, 10);
}

function MatchCard({ match, nearMiss }: { match: PortfolioMatchRecord; nearMiss?: boolean }) {
  const theme = useSpTheme();
  const [sending, setSending] = useState(false);
  const item = match.portfolioItem;

  /**
   * Sending beats copying on a phone: the share sheet hands the message straight
   * to whichever app the advisor actually reaches the contact through.
   */
  async function shareMessage() {
    setSending(true);
    const subject = {
      contactName: match.contactName,
      headline: item.headline,
      location: item.location,
      askingPrice: item.askingPrice,
      listingUrl: item.listingUrl,
    };
    try {
      const draft = await draftMatchMessage({ ...subject, contactId: match.contactId, portfolioItemId: item.id })
        .catch(() => ({ message: buildMatchMessageFallback(subject), source: "template" as const }));
      await Share.share({ message: draft.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <SpCard style={styles.match}>
      <View style={styles.matchTop}>
        <View style={styles.flex}>
          <SpText variant="title">{match.contactName}</SpText>
          <SpText variant="bodySmall" color="secondary">{item.headline}</SpText>
        </View>
        <View style={[styles.score, { backgroundColor: nearMiss ? theme.sunk : theme.deedBg }]}>
          <SpText variant="bodySmall" color={nearMiss ? "secondary" : "deed"}>%{Math.round(match.score * 100)}</SpText>
        </View>
      </View>
      <SpText variant="bodySmall" color="secondary">
        {item.location}
        {item.askingPrice ? ` · ${money(item.askingPrice.amount, item.askingPrice.currency)}` : ""}
      </SpText>
      {match.situationSummary ? <SpText variant="caption" color="secondary">{match.situationSummary}</SpText> : null}
      {/* The reasons are what make a match arguable rather than magic. */}
      <View style={styles.reasons}>
        {match.reasons.filter((reason) => reason.status !== "unknown").slice(0, 4).map((reason) => (
          <View key={reason.key} style={[styles.reason, { backgroundColor: reason.status === "match" ? theme.deedBg : theme.askBg }]}>
            <SpText variant="caption" color={reason.status === "match" ? "deed" : "ask"}>{reason.detail}</SpText>
          </View>
        ))}
      </View>
      <SpButton
        disabled={sending}
        icon={<Send color={theme.onDeed} size={16} />}
        label={sending ? "Hazırlanıyor…" : "Mesajı gönder"}
        onPress={() => void shareMessage()}
      />
    </SpCard>
  );
}

export function OfficePortfolioSection() {
  const theme = useSpTheme();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const itemsQuery = useQuery({ queryKey: apiQueryKeys.portfolioItems, queryFn: listPortfolioItems, enabled: Boolean(session) });
  const matchesQuery = useQuery({ queryKey: apiQueryKeys.portfolioMatches, queryFn: listPortfolioMatches, enabled: Boolean(session) });
  const notificationsQuery = useQuery({ queryKey: apiQueryKeys.matchNotifications, queryFn: listMatchNotifications, enabled: Boolean(session) });

  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<PortfolioSource>("whatsapp_group");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<PortfolioItemDraft | null>(null);
  const [queue, setQueue] = useState<PortfolioItemDraft[]>([]);
  const [attributes, setAttributes] = useState("");
  const [pending, setPending] = useState<"analyze" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPool, setShowPool] = useState(false);
  const [showNearMisses, setShowNearMisses] = useState(false);

  const items = itemsQuery.data ?? [];
  const matches = matchesQuery.data?.matches ?? [];
  const nearMisses = matchesQuery.data?.nearMisses ?? [];
  const unread = (notificationsQuery.data ?? []).filter((item) => item.readAt === null);

  function update<K extends keyof PortfolioItemDraft>(key: K, value: PortfolioItemDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function close() {
    if (pending) return;
    setOpen(false); setDraft(null); setQueue([]); setText(""); setAttributes(""); setError(null);
  }

  async function analyze() {
    if (text.trim().length < 10) return setError("Portföyü anlatan en az birkaç cümle yazın.");
    setPending("analyze"); setError(null);
    try {
      const messages = source === "whatsapp_group" ? splitPortfolioMessages(text) : [text.trim()];
      const results = await Promise.all(messages.map((message) => analyzePortfolioText(message, source)));
      const [first, ...rest] = results;
      if (!first) throw new Error("Çözümlenecek bir portföy mesajı bulunamadı.");
      setDraft(first); setQueue(rest); setAttributes(first.attributes.join(", "));
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(null);
    }
  }

  async function save() {
    if (!session || !draft) return;
    const parsed = portfolioItemDraftSchema.safeParse({
      ...draft,
      attributes: attributes.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 20),
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Portföy bilgilerini kontrol edin.");
    setPending("save"); setError(null);
    try {
      await savePortfolioItem(session, parsed.data);
      const [next, ...rest] = queue;
      if (next) {
        setDraft(next); setQueue(rest); setAttributes(next.attributes.join(", "));
      } else {
        close();
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.portfolioItems }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.portfolioMatches }),
      ]);
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(null);
    }
  }

  async function withdraw(portfolioItemId: string) {
    if (!session) return;
    try {
      await withdrawPortfolioItem(session, portfolioItemId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.portfolioItems }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.portfolioMatches }),
      ]);
    } catch (nextError) {
      setError(messageFrom(nextError));
    }
  }

  async function markRead() {
    if (!session || !unread.length) return;
    await markMatchNotificationsRead(session, unread.map((item) => item.id));
    await queryClient.invalidateQueries({ queryKey: apiQueryKeys.matchNotifications });
  }

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View style={styles.flex}>
          <SpText variant="eyebrow" color="deed">OFİS HAVUZU</SpText>
          <SpText variant="title">Eşleşmeler</SpText>
        </View>
        <SpButton icon={<Plus color={theme.onDeed} size={16} />} label="Havuza ekle" onPress={() => { setOpen(true); setError(null); }} />
      </View>

      {unread.length ? (
        <Pressable onPress={() => void markRead()} style={[styles.banner, { backgroundColor: theme.deedBg }]}>
          <Sparkles color={theme.deed} size={17} />
          <SpText variant="bodySmall" color="deed" style={styles.flex}>
            {unread.length} yeni eşleşme bildirimi · okundu işaretlemek için dokun
          </SpText>
        </Pressable>
      ) : null}

      {matchesQuery.isPending ? (
        <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Eşleşmeler yükleniyor…</SpText></View>
      ) : matches.length ? (
        matches.map((match) => <MatchCard key={`${match.contactId}-${match.portfolioItem.id}`} match={match} />)
      ) : (
        <SpCard><SpText color="secondary">Şu an eşleşme yok. Havuza portföy ekledikçe burada görünecek.</SpText></SpCard>
      )}

      {nearMisses.length ? (
        <>
          <Pressable onPress={() => setShowNearMisses((current) => !current)} style={styles.toggle}>
            <SpText variant="bodySmall" color="deed">
              {showNearMisses ? "Yakın kaçanları gizle" : `Yakın kaçanlar · ${nearMisses.length}`}
            </SpText>
          </Pressable>
          {showNearMisses ? nearMisses.map((match) => (
            <MatchCard key={`near-${match.contactId}-${match.portfolioItem.id}`} match={match} nearMiss />
          )) : null}
        </>
      ) : null}

      <Pressable onPress={() => setShowPool((current) => !current)} style={styles.toggle}>
        <Network color={theme.deed} size={15} />
        <SpText variant="bodySmall" color="deed">
          {showPool ? "Havuzu gizle" : `Ofis havuzu · ${items.length} portföy`}
        </SpText>
      </Pressable>
      {showPool ? items.map((item) => (
        <SpCard key={item.id} style={styles.poolItem}>
          <SpText variant="title">{item.headline}</SpText>
          <SpText variant="bodySmall" color="secondary">
            {item.location}
            {item.askingPrice ? ` · ${money(item.askingPrice.amount, item.askingPrice.currency)}` : ""}
          </SpText>
          <SpText variant="caption" color="secondary">{item.sharedByName} paylaştı · {portfolioSourceLabels[item.source]}</SpText>
          <SpButton label="Havuzdan çek" onPress={() => void withdraw(item.id)} tone="secondary" />
        </SpCard>
      )) : null}

      {error && !open ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{error}</SpText></View> : null}

      <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible={open}>
        <SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}>
          <ScrollView contentContainerStyle={styles.form}>
            <View style={styles.sheetHeader}>
              <View>
                <SpText variant="eyebrow" color="deed">HAVUZA EKLE</SpText>
                <SpText variant="hero">{draft ? "Taslağı kontrol et" : "Portföyü yapıştır"}</SpText>
              </View>
              <Pressable accessibilityLabel="Kapat" onPress={close} style={[styles.icon, { borderColor: theme.line }]}>
                <X color={theme.textSecondary} size={20} />
              </Pressable>
            </View>

            {!draft ? (
              <>
                <SpField label="Kaynak">
                  <View style={styles.choices}>
                    {portfolioSources.map((item) => (
                      <SpChoice key={item} label={portfolioSourceLabels[item]} selected={source === item} onPress={() => setSource(item)} />
                    ))}
                  </View>
                </SpField>
                <SpField label="Metin" hint="WhatsApp dışa aktarımını olduğu gibi yapıştırabilirsiniz; her mesaj ayrı taslak olur.">
                  <SpTextarea onChangeText={setText} placeholder="Örn. Urla İskele'de 3+1, deniz manzaralı, 5.500.000 TL" value={text} />
                </SpField>
                {error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{error}</SpText></View> : null}
                <SpButton
                  disabled={pending !== null}
                  icon={<Sparkles color={theme.onDeed} size={17} />}
                  label={pending === "analyze" ? "Çözümleniyor…" : "Bilgileri çıkar"}
                  onPress={() => void analyze()}
                  size="lg"
                />
              </>
            ) : (
              <>
                {queue.length ? <SpText variant="caption" color="deed">Sırada {queue.length} taslak daha var.</SpText> : null}
                <SpField label="Başlık"><SpInput onChangeText={(value) => update("headline", value)} value={draft.headline} /></SpField>
                <SpField label="Güvenli özet"><SpTextarea onChangeText={(value) => update("summary", value)} value={draft.summary} /></SpField>
                <SpField label="İşlem">
                  <View style={styles.choices}>
                    {(["sell", "let"] as const).map((item) => (
                      <SpChoice key={item} label={item === "sell" ? "Satılık" : "Kiralık"} selected={draft.transactionType === item} onPress={() => update("transactionType", item)} />
                    ))}
                  </View>
                </SpField>
                <SpField label="Mülk türü">
                  <View style={styles.choices}>
                    {propertyTypes.map((item) => (
                      <SpChoice key={item} label={propertyTypeLabels[item]} selected={draft.propertyType === item} onPress={() => update("propertyType", item)} />
                    ))}
                  </View>
                </SpField>
                <SpField label="Konum"><SpInput onChangeText={(value) => update("location", value)} value={draft.location} /></SpField>
                <SpField label="Fiyat">
                  <MoneyInput
                    currency={draft.askingPrice?.currency ?? "TRY"}
                    onChangeText={(value) => {
                      const amount = parseMoneyInput(value);
                      update("askingPrice", amount === null ? null : { amount, currency: draft.askingPrice?.currency ?? "TRY" });
                    }}
                    style={inputStyleFor(theme)}
                    value={moneyInputValue(draft.askingPrice?.amount)}
                  />
                </SpField>
                <SpField label="Para birimi">
                  <View style={styles.choices}>
                    {currencyCodes.map((item) => (
                      <SpChoice
                        key={item}
                        label={item}
                        selected={(draft.askingPrice?.currency ?? "TRY") === item}
                        onPress={() => draft.askingPrice && update("askingPrice", { ...draft.askingPrice, currency: item })}
                      />
                    ))}
                  </View>
                </SpField>
                <View style={styles.row}>
                  <SpField label={draft.propertyType === "land" ? "Arsa m²" : "Alan m²"} style={styles.flex}>
                    <SpInput
                      keyboardType="number-pad"
                      onChangeText={(value) => update(draft.propertyType === "land" ? "landAreaM2" : "areaM2", value.trim() ? Number(value) : null)}
                      value={String((draft.propertyType === "land" ? draft.landAreaM2 : draft.areaM2) ?? "")}
                    />
                  </SpField>
                  {draft.propertyType !== "land" ? (
                    <SpField label="Oda" style={styles.flex}>
                      <SpInput keyboardType="number-pad" onChangeText={(value) => update("bedroomCount", value.trim() ? Number(value) : null)} value={String(draft.bedroomCount ?? "")} />
                    </SpField>
                  ) : null}
                </View>
                <SpField label="Yetki">
                  <View style={styles.choices}>
                    {portfolioAuthorizationTypes.map((item) => (
                      <SpChoice key={item} label={portfolioAuthorizationLabels[item]} selected={draft.authorizationType === item} onPress={() => update("authorizationType", item)} />
                    ))}
                  </View>
                </SpField>
                <SpField label="Tapu">
                  <View style={styles.choices}>
                    {titleDeedTypes.map((item) => (
                      <SpChoice key={item} label={titleDeedTypeLabels[item]} selected={draft.titleDeedType === item} onPress={() => update("titleDeedType", item)} />
                    ))}
                  </View>
                </SpField>
                <SpField label="Diğer özellikler" hint="Virgülle ayırın">
                  <SpInput onChangeText={setAttributes} value={attributes} />
                </SpField>
                <SpField label="İlan bağlantısı" optional>
                  <SpInput autoCapitalize="none" keyboardType="url" onChangeText={(value) => update("listingUrl", value.trim() || null)} value={draft.listingUrl ?? ""} />
                </SpField>
                {error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{error}</SpText></View> : null}
                <SpButton disabled={pending !== null} label={pending === "save" ? "Kaydediliyor…" : "Onayla ve havuza ekle"} onPress={() => void save()} size="lg" />
                <SpButton label="Metne dön" onPress={() => { setDraft(null); setQueue([]); }} tone="secondary" />
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function inputStyleFor(theme: ReturnType<typeof useSpTheme>) {
  return {
    minHeight: 44,
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

const styles = StyleSheet.create({
  section: { gap: space.md },
  heading: { flexDirection: "row", alignItems: "center", gap: space.md },
  flex: { flex: 1 },
  banner: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.lg, borderRadius: radius.md },
  state: { alignItems: "center", gap: space.sm, paddingVertical: space.xl },
  match: { gap: space.sm },
  matchTop: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  score: { paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.sm },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  reason: { paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.sm },
  toggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, minHeight: 44 },
  poolItem: { gap: space.sm },
  error: { padding: space.lg, borderRadius: radius.md },
  safe: { flex: 1 },
  form: { padding: space.xl, paddingBottom: space["5xl"], gap: space.lg },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", gap: space.md },
});
