import { useState } from "react";
import { ActivityIndicator, Linking, Share, StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, MessageCircleMore } from "lucide-react-native";
import {
  apiQueryKeys,
  emptyWhatsAppGroupIntegration,
  groupsApiEligibilityUrl,
  isGroupsApiEligibilityError,
  readableMetaError,
  whatsappGroupConfigurationSchema,
  type WhatsAppGroupConfiguration,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { SpButton, SpChoice, SpField, SpInput, SpTextarea } from "@/shared/ui/SpField";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";
import { configureWhatsAppGroupIntegration, createWhatsAppOfficeGroup, loadWhatsAppGroupIntegration } from "../resources/settings";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "WhatsApp bağlantısı güncellenemedi.";

const statusLabels: Record<string, string> = {
  not_configured: "Kurulmadı",
  configured: "Ayarlandı",
  creating: "Oluşturuluyor",
  active: "Aktif",
  error: "Hata",
};

export function WhatsAppGroupSettingsCard() {
  const theme = useSpTheme();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: apiQueryKeys.whatsappGroupIntegration, queryFn: loadWhatsAppGroupIntegration, enabled: Boolean(session) });
  const [edited, setEdited] = useState<WhatsAppGroupConfiguration | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const integration = query.data ?? emptyWhatsAppGroupIntegration(session?.officeId ?? "");
  const draft = edited ?? {
    businessPhoneNumberId: integration.businessPhoneNumberId,
    subject: integration.subject,
    description: integration.description,
    joinApprovalMode: integration.joinApprovalMode,
  };
  const isBroker = session?.role === "broker";
  const locked = !isBroker || integration.status === "active";

  async function save() {
    if (!session) return;
    const parsed = whatsappGroupConfigurationSchema.safeParse(draft);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Bağlantı bilgilerini kontrol edin.");
    setPending(true); setError(null); setMessage(null);
    try {
      await configureWhatsAppGroupIntegration(session, parsed.data);
      setEdited(null);
      setMessage("Bağlantı ayarları kaydedildi.");
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.whatsappGroupIntegration });
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(false);
    }
  }

  async function createGroup() {
    if (!session) return;
    setPending(true); setError(null); setMessage(null);
    try {
      const next = await createWhatsAppOfficeGroup(session);
      // Meta answers the creation request before the group exists, so the state
      // that matters arrives later on the webhook.
      if (next.status === "error") setError(readableMetaError(next.lastError) ?? "Grup oluşturulamadı.");
      else if (next.status === "active") setMessage("Meta uyumlu ofis grubu oluşturuldu.");
      else setMessage("Grup oluşturma isteği Meta'ya iletildi. Sonuç webhook ile güncellenecek.");
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.whatsappGroupIntegration });
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(false);
    }
  }

  const metaError = readableMetaError(integration.lastError);

  return (
    <SpCard style={styles.card}>
      <View style={styles.title}>
        <MessageCircleMore color={theme.deed} size={20} />
        <View style={styles.flex}>
          <SpText variant="eyebrow" color="deed">WHATSAPP GROUPS API</SpText>
          <SpText variant="title">Otomatik ofis havuzu</SpText>
        </View>
        <View style={[styles.status, { backgroundColor: integration.status === "error" ? theme.askBg : theme.deedBg }]}>
          <SpText variant="caption" color={integration.status === "error" ? "ask" : "deed"}>
            {statusLabels[integration.status] ?? integration.status}
          </SpText>
        </View>
      </View>

      {query.isPending ? (
        <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Bağlantı yükleniyor…</SpText></View>
      ) : (
        <>
          <SpText variant="bodySmall" color="secondary">
            Meta API ile yeni bir grup oluşturur; desteklenen grup mesajlarını güvenli biçimde akışa taşır.
          </SpText>

          <SpField label="Business Phone Number ID">
            <SpInput
              editable={!locked}
              keyboardType="number-pad"
              onChangeText={(value) => setEdited({ ...draft, businessPhoneNumberId: value })}
              placeholder="12784358810"
              value={draft.businessPhoneNumberId}
            />
          </SpField>
          <SpField label="Grup adı">
            <SpInput editable={!locked} maxLength={128} onChangeText={(value) => setEdited({ ...draft, subject: value })} value={draft.subject} />
          </SpField>
          <SpField label="Açıklama">
            <SpTextarea editable={!locked} maxLength={2048} onChangeText={(value) => setEdited({ ...draft, description: value })} value={draft.description} />
          </SpField>
          <SpField label="Katılım">
            <View style={styles.choices}>
              {(["approval_required", "auto_approve"] as const).map((mode) => (
                <SpChoice
                  key={mode}
                  disabled={locked}
                  label={mode === "approval_required" ? "Onay gerekli" : "Otomatik onay"}
                  onPress={() => setEdited({ ...draft, joinApprovalMode: mode })}
                  selected={draft.joinApprovalMode === mode}
                />
              ))}
            </View>
          </SpField>

          {isBroker && integration.status !== "active" ? (
            <>
              <SpButton disabled={pending || !edited} label="Ayarları kaydet" onPress={() => void save()} tone="secondary" />
              <SpButton disabled={pending || integration.status === "not_configured"} label="Ofis grubunu oluştur" onPress={() => void createGroup()} />
            </>
          ) : null}
          {!isBroker ? <SpText variant="caption" color="secondary">Bu bağlantıyı yalnız ofis brokerı yönetebilir.</SpText> : null}

          {/* The webhook address has to reach Meta's console, which is not on this device. */}
          {integration.webhookUrl ? (
            <View style={[styles.notice, { backgroundColor: theme.sunk }]}>
              <SpText variant="eyebrow" color="secondary">CALLBACK URL</SpText>
              <SpText variant="caption" color="secondary">{integration.webhookUrl}</SpText>
              <SpButton label="Adresi paylaş" onPress={() => void Share.share({ message: integration.webhookUrl })} tone="secondary" />
            </View>
          ) : null}

          {integration.groupId ? <SpText variant="caption" color="secondary">Grup ID · {integration.groupId}</SpText> : null}
          {integration.inviteLink ? (
            <SpButton
              icon={<ExternalLink color={theme.textPrimary} size={16} />}
              label="Davet bağlantısını aç"
              onPress={() => void Linking.openURL(integration.inviteLink!)}
              tone="secondary"
            />
          ) : null}
          {integration.lastMessageAt ? (
            <SpText variant="caption" color="secondary">
              Son grup mesajı: {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(integration.lastMessageAt)}
            </SpText>
          ) : null}

          {metaError ? <View style={[styles.notice, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{metaError}</SpText></View> : null}
          {isGroupsApiEligibilityError(integration.lastError) ? (
            <SpButton
              icon={<ExternalLink color={theme.textPrimary} size={16} />}
              label="Meta uygunluk koşullarını aç"
              onPress={() => void Linking.openURL(groupsApiEligibilityUrl)}
              tone="secondary"
            />
          ) : null}
          {message ? <View style={[styles.notice, { backgroundColor: theme.deedBg }]}><SpText variant="bodySmall" color="deed">{message}</SpText></View> : null}
          {error ? <View style={[styles.notice, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{error}</SpText></View> : null}
        </>
      )}
    </SpCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  title: { flexDirection: "row", alignItems: "center", gap: space.md },
  flex: { flex: 1 },
  status: { paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.sm },
  state: { alignItems: "center", gap: space.sm, paddingVertical: space.lg },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  notice: { gap: space.sm, padding: space.lg, borderRadius: radius.md },
});
