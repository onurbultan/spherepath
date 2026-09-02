import { useState } from "react";
import { ActivityIndicator, Share, StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneCall } from "lucide-react-native";
import { apiQueryKeys } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { SpButton, SpField, SpInput } from "@/shared/ui/SpField";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";
import { configureCallIntegration, loadCallIntegration, loadOfficeTeam } from "../resources/settings";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Telefon ayarları güncellenemedi.";
const functionsOrigin = "https://europe-west8-spherepath-96ecd.cloudfunctions.net";

/**
 * The switch needs two addresses and an extension per advisor before a call can
 * reach anyone. None of it is guessable, so it is generated here; the addresses
 * go to the share sheet because they have to reach the switch's own panel, which
 * is not on this device.
 */
export function TelephonySettingsCard() {
  const theme = useSpTheme();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const integrationQuery = useQuery({ queryKey: apiQueryKeys.callIntegration, queryFn: loadCallIntegration, enabled: Boolean(session) });
  const teamQuery = useQuery({ queryKey: apiQueryKeys.officeTeam, queryFn: loadOfficeTeam, enabled: Boolean(session) });
  const [extensions, setExtensions] = useState<Record<string, string> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const integration = integrationQuery.data;
  const members = teamQuery.data?.members ?? [];
  // Stored as extension → advisor; the form reads the other way round.
  const byAdvisor = extensions ?? Object.fromEntries(
    members.map((member) => [member.uid, Object.entries(integration?.extensionOwners ?? {}).find(([, uid]) => uid === member.uid)?.[0] ?? ""]),
  );

  async function save(rotateToken = false) {
    if (!session) return;
    setPending(true); setError(null); setMessage(null);
    try {
      const extensionOwners = Object.fromEntries(
        Object.entries(byAdvisor).filter(([, extension]) => extension.trim()).map(([uid, extension]) => [extension.trim(), uid]),
      );
      await configureCallIntegration(session, { extensionOwners, rotateToken });
      setExtensions(null);
      setMessage(rotateToken ? "Yeni webhook adresi üretildi; Verimor panelindeki adresi güncelleyin." : "Telefon ayarları kaydedildi.");
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.callIntegration });
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setPending(false);
    }
  }

  const webhook = (name: string) =>
    integration ? `${functionsOrigin}/${name}?integration=${integration.integrationId}&token=${integration.webhookToken}` : "";

  return (
    <SpCard style={styles.card}>
      <View style={styles.title}>
        <PhoneCall color={theme.deed} size={20} />
        <View style={styles.flex}>
          <SpText variant="eyebrow" color="deed">TELEFON</SpText>
          <SpText variant="title">Santral bağlantısı</SpText>
        </View>
      </View>
      <SpText variant="bodySmall" color="secondary">
        Gelen çağrı, arayan numaranın kayıtlı olduğu danışmana yönlendirilir. Bunun için her
        danışmanın santraldeki dahili numarası burada eşlenir.
      </SpText>

      {integrationQuery.isPending ? (
        <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Bağlantı yükleniyor…</SpText></View>
      ) : (
        <>
          {members.map((member) => (
            <SpField key={member.uid} label={`${member.displayName} · dahili`}>
              <SpInput
                keyboardType="number-pad"
                onChangeText={(value) => setExtensions({ ...byAdvisor, [member.uid]: value })}
                placeholder="1001"
                value={byAdvisor[member.uid] ?? ""}
              />
            </SpField>
          ))}

          {integration ? (
            <View style={[styles.addresses, { backgroundColor: theme.sunk }]}>
              <SpText variant="eyebrow" color="secondary">WEBHOOK ADRESLERİ</SpText>
              <SpText variant="caption" color="secondary">
                Bu iki adresi Verimor panelindeki CRM entegrasyonu bölümüne yazın.
              </SpText>
              <SpButton
                label="Olay bildirimi adresini paylaş"
                onPress={() => void Share.share({ message: webhook("verimorCallWebhook") })}
                tone="secondary"
              />
              <SpButton
                label="Yönlendirme adresini paylaş"
                onPress={() => void Share.share({ message: webhook("verimorRoutingWebhook") })}
                tone="secondary"
              />
            </View>
          ) : (
            <SpText variant="caption" color="secondary">Kaydettiğinizde webhook adresleri üretilecek.</SpText>
          )}

          {message ? <View style={[styles.notice, { backgroundColor: theme.deedBg }]}><SpText variant="bodySmall" color="deed">{message}</SpText></View> : null}
          {error ? <View style={[styles.notice, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{error}</SpText></View> : null}

          <SpButton disabled={pending || !session} label="Kaydet" onPress={() => void save()} />
          {integration ? <SpButton disabled={pending} label="Adresi yenile" onPress={() => void save(true)} tone="secondary" /> : null}
        </>
      )}
    </SpCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  title: { flexDirection: "row", alignItems: "center", gap: space.md },
  flex: { flex: 1 },
  state: { alignItems: "center", gap: space.sm, paddingVertical: space.lg },
  addresses: { gap: space.sm, padding: space.lg, borderRadius: radius.md },
  notice: { padding: space.lg, borderRadius: radius.md },
});
