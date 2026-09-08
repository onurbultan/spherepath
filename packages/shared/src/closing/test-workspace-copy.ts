export const testWorkspaceCopy = {
  title: "Yerel test çalışma alanı",
  hint: "Bu alan Firebase Emulator’a bağlıdır. Kullanıcı ve ofis ayarları korunur; test iş kayıtları silinir.",
  preview: "Silme kapsamını göster",
  reset: "Test iş kayıtlarını sıfırla",
  done: "Test iş kayıtları temizlendi. Ayarlar korundu.",
} as const;
export interface TestWorkspaceResetPreview { enabled: boolean; total: number; counts: Record<string, number>; snapshotToken: string | null }
