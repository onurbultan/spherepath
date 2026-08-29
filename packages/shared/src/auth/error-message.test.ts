import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./error-message.js";

describe("authErrorMessage", () => {
  it("maps invalid credentials without exposing account existence", () => {
    expect(authErrorMessage({ code: "auth/user-not-found" })).toBe("E-posta veya şifre hatalı.");
    expect(authErrorMessage({ code: "auth/wrong-password" })).toBe("E-posta veya şifre hatalı.");
  });

  it("turns expired tokens into an actionable Turkish message", () => {
    expect(authErrorMessage({ code: "auth/user-token-expired", message: "The user's credential is no longer valid." })).toBe(
      "Oturum süreniz doldu. Lütfen yeniden giriş yapın.",
    );
  });

  it("does not expose unknown Firebase authentication details", () => {
    expect(authErrorMessage({ code: "auth/internal-error", message: "technical detail" })).toBe(
      "Beklenmeyen bir oturum hatası oluştu.",
    );
  });

  it("keeps non-auth domain messages", () => {
    expect(authErrorMessage(new Error("Çalışma alanı yetkileri oluşturulamadı."))).toBe(
      "Çalışma alanı yetkileri oluşturulamadı.",
    );
  });
});
