import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kullanım Koşulları | Spherepath",
  description: "Spherepath kullanım koşulları.",
};

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <header className="legal-header">
          <Link className="legal-brand" href="/">Spherepath</Link>
          <p className="eyebrow">KULLANIM KOŞULLARI</p>
          <h1>Spherepath, danışmanın kararını destekler; onun yerine karar vermez.</h1>
          <p>Son güncelleme: 30 Ağustos 2026</p>
        </header>

        <section><h2>Hizmet</h2><p>Spherepath, emlak danışmanlarının ilişki aktivitesini, nitelikli talep oluşturmasını, portföy kazanımını ve kapama sürecini yönetmesine yardımcı olan bir yazılım hizmetidir.</p></section>
        <section><h2>Kullanıcı sorumluluğu</h2><p>Kullanıcı; eklediği verilerin hukuka uygunluğundan, gerekli aydınlatma ve izinlerin alınmasından, oluşturulan taslakların doğruluğunu kontrol etmekten ve dış kanallardaki gönderimleri onaylamaktan sorumludur.</p></section>
        <section><h2>Güvenli kullanım</h2><p>Aktif bir görüşmede karşı taraf kaydedilemez. Sesli not yalnız danışmanın görüşme sonrası özetidir. Sistem hassas özellik veya kişilik çıkarımı amacıyla kullanılamaz. Resmi doğrulama olmadan harici telefon ya da WhatsApp etkinliği tamamlanmış sayılmaz.</p></section>
        <section><h2>Hizmet değişiklikleri</h2><p>Güvenlik, yasal yükümlülük veya ürün kalitesi için hizmet özellikleri güncellenebilir. Önemli değişiklikler uygulama içinde veya uygun iletişim kanalıyla duyurulur.</p></section>
        <section><h2>Hesap ve veri</h2><p>Kullanıcı hesabının güvenliğini korumalıdır. Veri işleme esasları <Link href="/privacy">Gizlilik Politikası</Link> kapsamında açıklanır. Veri silme adımları <Link href="/data-deletion">Veri Silme Talimatları</Link> sayfasında yer alır.</p></section>
        <footer className="legal-footer"><Link href="/privacy">Gizlilik politikası</Link><Link href="/data-deletion">Veri silme</Link><Link href="/">Spherepath’e dön</Link></footer>
      </article>
    </main>
  );
}
