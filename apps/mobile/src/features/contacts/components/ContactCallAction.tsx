import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet } from "react-native";
import { Phone, PhoneCall } from "lucide-react-native";
import { useSession } from "@/features/auth/resources/session";
import { SpText } from "@/shared/ui/SpText";
import { useSpTheme } from "@/shared/ui/theme";
import { radius, space } from "@/shared/ui/tokens.generated";
import { startContactCall } from "../resources/contacts";

/**
 * The advisor's own phone rings first, so the label has to carry them through the
 * few seconds of silence before it does.
 */
const ringingNoticeMs = 12_000;

/**
 * Each setup fault is fixed somewhere different, so naming them saves the advisor
 * from guessing which person to ask.
 */
function reasonFor(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Telephony is not configured")) return "Ofis için telefon entegrasyonu kurulmamış. Broker'ınız ayarları tamamlamalı.";
  if (message.includes("No extension is assigned")) return "Size bir dahili atanmamış. Broker'ınız telefon ayarlarından atayabilir.";
  if (message.includes("no dialable phone")) return "Bu kişinin aranabilir bir telefon numarası yok.";
  return "Arama başlatılamadı. Tekrar deneyin.";
}

export function ContactCallAction({ contactId }: { contactId: string }) {
  const theme = useSpTheme();
  const { session } = useSession();
  const [state, setState] = useState<"idle" | "starting" | "ringing">("idle");

  useEffect(() => {
    if (state !== "ringing") return;
    const timer = setTimeout(() => setState("idle"), ringingNoticeMs);
    return () => clearTimeout(timer);
  }, [state]);

  async function call() {
    if (!session || state !== "idle") return;
    setState("starting");
    try {
      await startContactCall(session, contactId);
      setState("ringing");
    } catch (error) {
      setState("idle");
      Alert.alert("Arama başlatılamadı", reasonFor(error));
    }
  }

  const Icon = state === "ringing" ? PhoneCall : Phone;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Bu kişiyi ara"
      disabled={!session || state !== "idle"}
      onPress={() => void call()}
      style={({ pressed }) => [styles.button, { backgroundColor: theme.deedBg, opacity: pressed || state !== "idle" ? .7 : 1 }]}
    >
      <Icon color={theme.deed} size={16} />
      <SpText variant="bodySmall" color="deed">
        {state === "starting" ? "Bağlanıyor…" : state === "ringing" ? "Telefonunuz çalacak" : "Ara"}
      </SpText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
});
