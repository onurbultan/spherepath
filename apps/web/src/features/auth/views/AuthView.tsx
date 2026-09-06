"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useSession } from "../resources/session";
import { onboardingCopy } from "@spherepath/shared";
import { SpInput, SpSelect } from "@/shared/ui/SpField";

export function AuthView() {
  const { signIn, createAccount, resetPassword } = useSession();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState<"create" | "join">("create");
  const [inviteCode, setInviteCode] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    try {
      if (mode === "register") await createAccount(displayName, email, password, workspaceMode === "join" ? inviteCode : undefined);
      else await signIn(email, password);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Oturum açılamadı.");
      setPending(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand-mark auth-brand"><span className="brand-symbol">S</span><strong>Spherepath</strong></div>
        <p className="eyebrow">PORTFÖY ÜRETİM SİSTEMİ</p>
        <h1>İlişki ağını günlük, uygulanabilir bir plana dönüştür.</h1>
        <p>Temaslarını kaydet, darboğazını gör ve portföy kazanmak için sıradaki doğru adımı seç.</p>
      </section>
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="card-icon"><LockKeyhole size={19} aria-hidden /></div>
        <p className="eyebrow">GÜVENLİ ÇALIŞMA ALANI</p>
        <h2 id="auth-title">{mode === "signin" ? "Tekrar hoş geldin" : "Çalışma alanını oluştur"}</h2>
        <form className="form-stack" onSubmit={submit}>
          {mode === "register" ? (
            <><label>Ad soyad<SpInput autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={2} /></label><label>{onboardingCopy.workspaceChoice}<SpSelect value={workspaceMode} onChange={(event) => setWorkspaceMode(event.target.value as "create" | "join")}><option value="create">{onboardingCopy.createOffice}</option><option value="join">{onboardingCopy.joinOffice}</option></SpSelect></label><p className="privacy-hint">{workspaceMode === "join" ? onboardingCopy.inviteHint : onboardingCopy.newOfficeHint}</p>{workspaceMode === "join" ? <label>Ofis davet kodu <SpInput required minLength={8} autoCapitalize="characters" maxLength={8} placeholder="ABCD2345" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toLocaleUpperCase("tr-TR").replace(/[^A-Z2-9]/gu, ""))} /></label> : null}</>
          ) : null}
          <label>E-posta<SpInput autoComplete="email" inputMode="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Şifre<SpInput autoComplete={mode === "register" ? "new-password" : "current-password"} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} /></label>
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          {formSuccess ? <p className="form-success" role="status">{formSuccess}</p> : null}
          <button className="primary-action auth-submit" disabled={pending} type="submit">
            {pending ? "Hazırlanıyor…" : mode === "signin" ? "Giriş yap" : "Hesap oluştur"}<ArrowRight size={18} aria-hidden />
          </button>
        </form>
        {mode === "signin" ? <button className="text-action" type="button" onClick={() => { setFormError(null); setFormSuccess(null); void resetPassword(email).then(() => setFormSuccess("Şifre sıfırlama bağlantısı e-posta adresine gönderildi.")).catch((nextError) => setFormError(nextError instanceof Error ? nextError.message : "Bağlantı gönderilemedi.")); }}>Şifremi unuttum</button> : null}
        <button className="text-action" type="button" onClick={() => { setMode(mode === "signin" ? "register" : "signin"); setFormError(null); }}>
          {mode === "signin" ? "Yeni misin? Çalışma alanı oluştur" : "Zaten hesabın var mı? Giriş yap"}
        </button>
      </section>
    </main>
  );
}
