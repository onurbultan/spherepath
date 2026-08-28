import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ArrowRight, LockKeyhole } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../resources/session";
import { SpText } from "@/shared/ui/SpText";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";

export function AuthView() {
  const theme = useSpTheme();
  const { signIn, createAccount } = useSession();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      if (mode === "register") await createAccount(displayName, email, password);
      else await signIn(email, password);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Oturum açılamadı.");
      setPending(false);
    }
  }

  const inputStyle = [styles.input, { color: theme.textPrimary, backgroundColor: theme.card, borderColor: theme.line }];
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.hero, { backgroundColor: theme.deed }]}>
            <View style={[styles.logo, { backgroundColor: theme.onDeed }]}><SpText variant="title" color="deed">S</SpText></View>
            <SpText variant="eyebrow" style={{ color: theme.onDeed }}>PORTFÖY ÜRETİM SİSTEMİ</SpText>
            <SpText variant="hero" style={{ color: theme.onDeed }}>Sıradaki doğru adımı görünür kıl.</SpText>
          </View>
          <View style={styles.form}>
            <View style={[styles.icon, { backgroundColor: theme.deedBg }]}><LockKeyhole color={theme.deed} size={19} /></View>
            <SpText variant="eyebrow" color="deed">GÜVENLİ ÇALIŞMA ALANI</SpText>
            <SpText variant="title">{mode === "signin" ? "Tekrar hoş geldin" : "Hesabını oluştur"}</SpText>
            {mode === "register" ? <TextInput autoCapitalize="words" autoComplete="name" placeholder="Ad soyad" placeholderTextColor={theme.textTertiary} style={inputStyle} value={displayName} onChangeText={setDisplayName} /> : null}
            <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="E-posta" placeholderTextColor={theme.textTertiary} style={inputStyle} value={email} onChangeText={setEmail} />
            <TextInput autoCapitalize="none" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="Şifre" placeholderTextColor={theme.textTertiary} secureTextEntry style={inputStyle} value={password} onChangeText={setPassword} />
            {error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{error}</SpText></View> : null}
            <Pressable disabled={pending} onPress={() => void submit()} style={({ pressed }) => [styles.primary, { backgroundColor: theme.ask, opacity: pressed || pending ? .68 : 1 }]}><SpText style={{ color: theme.onAsk }}>{pending ? "Hazırlanıyor…" : mode === "signin" ? "Giriş yap" : "Hesap oluştur"}</SpText><ArrowRight color={theme.onAsk} size={18} /></Pressable>
            <Pressable onPress={() => { setMode(mode === "signin" ? "register" : "signin"); setError(null); }}><SpText color="deed" style={styles.center}>{mode === "signin" ? "Yeni misin? Hesap oluştur" : "Zaten hesabın var mı? Giriş yap"}</SpText></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1 },
  hero: { minHeight: 300, padding: space["3xl"], justifyContent: "flex-end", gap: space.lg },
  logo: { width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: "auto" },
  form: { padding: space["3xl"], gap: space.lg },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 50, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.lg, fontFamily: "Karla_400Regular", fontSize: 16 },
  error: { padding: space.md, borderRadius: radius.md },
  primary: { minHeight: 50, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  center: { textAlign: "center", paddingVertical: space.sm },
});
