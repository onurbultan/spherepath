"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useSession } from "../resources/session";

export function AuthView() {
  const { signIn, createAccount } = useSession();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    try {
      if (mode === "register") await createAccount(displayName, email, password);
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
            <label>Ad soyad<input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={2} /></label>
          ) : null}
          <label>E-posta<input autoComplete="email" inputMode="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Şifre<input autoComplete={mode === "register" ? "new-password" : "current-password"} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} /></label>
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          <button className="primary-action auth-submit" disabled={pending} type="submit">
            {pending ? "Hazırlanıyor…" : mode === "signin" ? "Giriş yap" : "Hesap oluştur"}<ArrowRight size={18} aria-hidden />
          </button>
        </form>
        <button className="text-action" type="button" onClick={() => { setMode(mode === "signin" ? "register" : "signin"); setFormError(null); }}>
          {mode === "signin" ? "Yeni misin? Çalışma alanı oluştur" : "Zaten hesabın var mı? Giriş yap"}
        </button>
      </section>
    </main>
  );
}
