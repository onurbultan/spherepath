export const microphoneErrorMessages = {
  permissionDenied: "Mikrofon izni verilmedi. Cihaz ayarlarından mikrofon erişimini açıp yeniden deneyin.",
  notFound: "Bu cihazda kullanılabilir mikrofon bulunamadı.",
  inUse: "Mikrofon başka bir uygulama tarafından kullanılıyor. Diğer kaydı kapatıp yeniden deneyin.",
  interrupted: "Mikrofon başlatma kesildi. Yeniden deneyin.",
  insecure: "Mikrofon yalnız güvenli bağlantıda kullanılabilir.",
} as const;

export function microphoneErrorMessage(error: unknown): string {
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return microphoneErrorMessages.permissionDenied;
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return microphoneErrorMessages.notFound;
  if (name === "NotReadableError" || name === "TrackStartError") return microphoneErrorMessages.inUse;
  if (name === "AbortError") return microphoneErrorMessages.interrupted;
  if (name === "SecurityError") return microphoneErrorMessages.insecure;
  return error instanceof Error && error.message ? error.message : "Sesli not başlatılamadı. Yeniden deneyin.";
}
