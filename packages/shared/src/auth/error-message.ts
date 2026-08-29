const authMessages: Record<string, string> = {
  "auth/email-already-in-use": "Bu e-posta adresiyle zaten bir hesap var.",
  "auth/id-token-expired": "Oturum süreniz doldu. Lütfen yeniden giriş yapın.",
  "auth/invalid-credential": "E-posta veya şifre hatalı.",
  "auth/invalid-email": "Geçerli bir e-posta adresi girin.",
  "auth/invalid-user-token": "Oturum süreniz doldu. Lütfen yeniden giriş yapın.",
  "auth/network-request-failed": "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.",
  "auth/too-many-requests": "Çok fazla başarısız deneme yapıldı. Biraz sonra yeniden deneyin.",
  "auth/user-disabled": "Bu hesap devre dışı bırakılmış. Ofis yöneticinizle iletişime geçin.",
  "auth/user-not-found": "E-posta veya şifre hatalı.",
  "auth/user-token-expired": "Oturum süreniz doldu. Lütfen yeniden giriş yapın.",
  "auth/weak-password": "Daha güçlü bir şifre seçin.",
  "auth/wrong-password": "E-posta veya şifre hatalı.",
};

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

export function authErrorMessage(error: unknown, fallback = "Beklenmeyen bir oturum hatası oluştu."): string {
  const code = errorCode(error);
  if (code?.startsWith("auth/")) return authMessages[code] ?? fallback;
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
