import { useState } from "react";
import { ActivityIndicator, Share, StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Users } from "lucide-react-native";
import { apiQueryKeys, type OfficeInviteView } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { SpButton, SpField, SpInput } from "@/shared/ui/SpField";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";
import { createOfficeInvite, joinOffice, loadOfficeTeam, revokeOfficeInvite } from "../resources/settings";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Ekip bilgileri güncellenemedi.";

/**
 * Joining an office is the one thing a new advisor does before anything else,
 * and they do it on the phone they were handed the code on -- not at a desk.
 */
export function OfficeTeamPanel() {
  const theme = useSpTheme();
  const { session, refreshSession } = useSession();
  const queryClient = useQueryClient();
  const teamQuery = useQuery({ queryKey: apiQueryKeys.officeTeam, queryFn: loadOfficeTeam, enabled: Boolean(session) });
  const [invite, setInvite] = useState<OfficeInviteView | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const team = teamQuery.data;

  async function run(work: () => Promise<string>) {
    if (!session) return;
    setPending(true); setError(null); setMessage(null);
    try {
      setMessage(await work());
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.officeTeam });
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(false);
    }
  }

  return (
    <SpCard style={styles.card}>
      <View style={styles.title}>
        <Users color={theme.deed} size={20} />
        <View style={styles.flex}>
          <SpText variant="eyebrow" color="deed">OFİS EKİBİ</SpText>
          <SpText variant="title">{team?.officeName ?? "Ortak çalışma alanı"}</SpText>
        </View>
      </View>

      {teamQuery.isPending ? (
        <View style={styles.state}><ActivityIndicator color={theme.deed} /><SpText color="secondary">Ekip yükleniyor…</SpText></View>
      ) : (
        <>
          <SpText variant="bodySmall" color="secondary">
            Kişiler danışmana ait kalır; broker ofis genelini, danışman kendi kayıtlarını görür. Ortak portföy havuzu bütün ekibe açıktır.
          </SpText>

          {team?.members.length ? (
            <View style={styles.members}>
              {team.members.map((member) => (
                <View key={member.uid} style={[styles.member, { borderColor: theme.line }]}>
                  <SpText variant="bodySmall" style={styles.flex}>{member.displayName}</SpText>
                  <SpText variant="caption" color="secondary">{member.role === "broker" ? "Broker" : "Danışman"}</SpText>
                </View>
              ))}
            </View>
          ) : null}

          {team?.canInvite ? (
            <>
              <SpButton
                disabled={pending}
                label="Davet kodu oluştur"
                onPress={() => void run(async () => {
                  const next = await createOfficeInvite(session!);
                  setInvite(next);
                  await refreshSession();
                  return "Tek kullanımlık ofis daveti hazırlandı.";
                })}
              />
              {invite ? (
                <View style={[styles.invite, { backgroundColor: theme.deedBg }]}>
                  <SpText variant="eyebrow" color="deed">DAVET KODU</SpText>
                  <SpText variant="hero">{invite.code}</SpText>
                  {/* Handing the code over is the point, so it goes to the share sheet. */}
                  <SpButton label="Kodu paylaş" onPress={() => void Share.share({ message: `Spherepath ofis davet kodu: ${invite.code}` })} tone="secondary" />
                </View>
              ) : null}
              {team.activeInvites.map((item) => (
                <View key={item.code} style={[styles.member, { borderColor: theme.line }]}>
                  <SpText variant="bodySmall" style={styles.flex}>{item.code}</SpText>
                  <SpButton
                    disabled={pending}
                    label="İptal et"
                    onPress={() => void run(async () => {
                      await revokeOfficeInvite(session!, item.code);
                      if (invite?.code === item.code) setInvite(null);
                      return "Ofis daveti iptal edildi.";
                    })}
                    tone="secondary"
                  />
                </View>
              ))}
            </>
          ) : null}

          {team?.canJoinOffice ? (
            <View style={styles.join}>
              <View style={styles.title}>
                <Building2 color={theme.deed} size={18} />
                <SpText variant="bodySmall" color="secondary" style={styles.flex}>
                  Bu boş çalışma alanını, size verilen tek kullanımlık kodla ofis ekibine bağlayabilirsiniz.
                </SpText>
              </View>
              <SpField label="Ofis davet kodu">
                <SpInput
                  autoCapitalize="characters"
                  maxLength={8}
                  onChangeText={(value) => setJoinCode(value.toLocaleUpperCase("tr-TR").replace(/[^A-Z2-9]/gu, ""))}
                  placeholder="ABCD2345"
                  value={joinCode}
                />
              </SpField>
              <SpButton
                disabled={pending || joinCode.length !== 8}
                label="Ofise katıl"
                onPress={() => void run(async () => {
                  await joinOffice(session!, { code: joinCode });
                  setJoinCode("");
                  await refreshSession();
                  return "Ofise katıldınız.";
                })}
                size="lg"
              />
            </View>
          ) : team && !team.canInvite ? (
            <SpText variant="caption" color="secondary">
              Bu hesapta aktif kayıtlar bulunduğu için başka bir ofise doğrudan geçiş kapalıdır.
            </SpText>
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
  state: { alignItems: "center", gap: space.sm, paddingVertical: space.lg },
  members: { gap: space.sm },
  member: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 44, paddingHorizontal: space.lg, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md },
  invite: { gap: space.sm, padding: space.lg, borderRadius: radius.md, alignItems: "flex-start" },
  join: { gap: space.md },
  notice: { padding: space.lg, borderRadius: radius.md },
});
