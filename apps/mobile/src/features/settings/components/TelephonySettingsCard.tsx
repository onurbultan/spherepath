import { useState } from "react";
import { ActivityIndicator, Share, StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneCall } from "lucide-react-native";
import { apiQueryKeys } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { SpButton, SpField, SpInput } from "@/shared/ui/SpField";
import { PhoneInput } from "@/shared/ui/MaskedInputs";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";
import { configureCallIntegration, connectCallProvider, loadCallIntegration, loadOfficeTeam } from "../resources/settings";

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
  const [numbers, setNumbers] = useState<Record<string, string> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  const integration = integrationQuery.data;
  const members = teamQuery.data?.members ?? [];
  // Stored as extension → advisor; the form reads the other way round.
  const byAdvisor = extensions ?? Object.fromEntries(
    members.map((member) => [member.uid, Object.entries(integration?.extensionOwners ?? {}).find(([, uid]) => uid === member.uid)?.[0] ?? ""]),
  );

  const byAdvisorNumber = numbers ?? Object.fromEntries(
    members.map((member) => [member.uid, integration?.advisorNumbers?.[member.uid] ?? ""]),
  );

  async function save(rotateToken = false) {
    if (!session) return;
    setPending(true); setError(null); setMessage(null);
    try {
      const extensionOwners = Object.fromEntries(
        Object.entries(byAdvisor).filter(([, extension]) => extension.trim()).map(([uid, extension]) => [extension.trim(), uid]),
      );
      const advisorNumbers = Object.fromEntries(
        Object.entries(byAdvisorNumber).filter(([, phone]) => phone.trim()),
      );
      await configureCallIntegration(session, { extensionOwners, advisorNumbers, rotateToken });
      setExtensions(null);
      setNumbers(null);
      if (rotateToken) setConnected(null);
      setMessage(rotateToken ? "Yeni webhook adresi üretildi; Verimor panelindeki adresi güncelleyin." : "Telefon ayarları kaydedildi.");
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.callIntegration });
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setPending(false);
    }
  }

  /**
   * The switch's own API takes the event address, so it never has to be copied
   * by hand. The routing address has no such endpoint and still goes in the panel.
   */
  async function connect() {
    if (!session) return;
    setPending(true); setError(null); setMessage(null);
    try {
      const state = await connectCallProvider(session);
      setConnected(state.connected);
      setMessage(state.connected
        ? "Verimor bu adrese bağlandı; çağrı olayları buraya düşecek."
        : `Verimor farklı bir adres tutuyor: ${state.notificationUrl ?? "tanımsız"}`);
    } catch (cause) {
      setConnected(false);
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
        Giden aramada santral önce danışmanın kendi telefonunu arar, o açınca müşteriye bağlar.
        Dahili numara ise gelen çağrının hangi danışmana düşeceğini belirler.
      </SpText>

      {integrationQuery.isPending ? (
        <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Bağlantı yükleniyor…</SpText></View>
      ) : (
        <>
          {members.map((member) => (
            <View key={member.uid} style={styles.advisor}>
              {/* Rung first on an outbound call, so the advisor is already on
                  the line before the customer's phone starts ringing. */}
              <SpField label={`${member.displayName} · telefonu`}>
                <PhoneInput
                  onChangeText={(value) => setNumbers({ ...byAdvisorNumber, [member.uid]: value })}
                  value={byAdvisorNumber[member.uid] ?? ""}
                />
              </SpField>
              <SpField label="Dahili">
                <SpInput
                  keyboardType="number-pad"
                  onChangeText={(value) => setExtensions({ ...byAdvisor, [member.uid]: value })}
                  placeholder="1001"
                  value={byAdvisor[member.uid] ?? ""}
                />
              </SpField>
            </View>
          ))}

          {integration ? (
            <View style={[styles.addresses, { backgroundColor: theme.sunk }]}>
              <SpText variant="eyebrow" color="secondary">SANTRAL ADRESLERİ</SpText>
              <SpText variant="caption" color="secondary">
                {connected === true
                  ? "Olay bildirimi bağlı. Yönlendirme adresini Verimor panelinde numaranın advisory webhook alanına yazın."
                  : "Olay bildirimini “Verimor’a bağlan” kendisi yazar. Yönlendirme adresi ise panele elle girilir."}
              </SpText>
              {/* The panel is not on this device, so the address leaves by the share sheet. */}
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
          {integration ? <SpButton disabled={pending} label="Verimor'a bağlan" onPress={() => void connect()} tone="secondary" /> : null}
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
  advisor: { gap: space.sm },
  addresses: { gap: space.sm, padding: space.lg, borderRadius: radius.md },
  notice: { padding: space.lg, borderRadius: radius.md },
});
