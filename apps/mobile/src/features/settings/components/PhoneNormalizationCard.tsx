import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { PhoneForwarded } from "lucide-react-native";
import { apiQueryKeys } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { SpButton } from "@/shared/ui/SpField";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";
import { normalizeContactPhones } from "../resources/settings";

/**
 * A one-off tidy-up rather than a setting: numbers saved before the phone field
 * was split are rewritten into the shape the switch matches on, so an inbound
 * caller finds the contact that was typed by hand months earlier.
 */
export function PhoneNormalizationCard() {
  const theme = useSpTheme();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ scanned: number; updated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!session || running) return;
    setRunning(true); setError(null); setResult(null);
    let scanned = 0;
    let updated = 0;
    let cursor: string | null = null;
    try {
      // The pass is paged so one office's whole book never sits in a single
      // request; the button walks it to the end rather than making a person
      // press it repeatedly.
      for (;;) {
        const pass = await normalizeContactPhones(session, cursor);
        scanned += pass.scanned;
        updated += pass.updated;
        if (pass.done || !pass.cursor) break;
        cursor = pass.cursor;
      }
      setResult({ scanned, updated });
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Telefonlar düzenlenemedi.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <SpCard style={styles.card}>
      <View style={styles.title}>
        <PhoneForwarded color={theme.deed} size={20} />
        <View style={styles.flex}>
          <SpText variant="eyebrow" color="deed">TOPLU DÜZENLEME</SpText>
          <SpText variant="title">Telefon numaralarını biçimlendir</SpText>
        </View>
      </View>
      <SpText variant="bodySmall" color="secondary">
        Eski kayıtlardaki numaralar yazıldıkları gibi duruyor. Bu işlem hepsini ülke kodlu biçime
        çevirir ve gelen çağrının kişiyle eşleşmesini sağlayan anahtarı üretir. Telefon olmayan
        alanlara dokunulmaz; tekrar çalıştırmak güvenlidir.
      </SpText>
      {result ? (
        <View style={[styles.notice, { backgroundColor: theme.deedBg }]}>
          <SpText variant="bodySmall" color="deed">{result.scanned} kişi tarandı, {result.updated} numara düzeltildi.</SpText>
        </View>
      ) : null}
      {error ? <View style={[styles.notice, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{error}</SpText></View> : null}
      <SpButton
        disabled={!session || running}
        label={running ? "Düzenleniyor…" : "Numaraları düzenle"}
        onPress={() => void run()}
        tone="secondary"
      />
    </SpCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  title: { flexDirection: "row", alignItems: "center", gap: space.md },
  flex: { flex: 1 },
  notice: { padding: space.lg, borderRadius: radius.md },
});
