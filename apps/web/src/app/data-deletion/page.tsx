import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Veri Silme Talimatları | Spherepath",
  description: "Spherepath hesap ve kişi verisi silme talimatları.",
};

export default function DataDeletionPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <header className="legal-header">
          <Link className="legal-brand" href="/">Spherepath</Link>
          <p className="eyebrow">VERİ SİLME</p>
          <h1>Silme talepleri izlenebilir ve doğrulanmış bir süreçle yürütülür.</h1>
          <p>Son güncelleme: 30 Ağustos 2026</p>
        </header>

        <section>
          <h2>Kişi kaydı için</h2>
          <ol>
            <li>Spherepath hesabınıza giriş yapın.</li>
            <li><strong>Ayarlar → Veri sahibi hakları</strong> bölümünü açın.</li>
            <li>İlgili kişiyi ve <strong>Silme</strong> talep türünü seçerek talebi oluşturun.</li>
            <li>Kimlik ve yetki kontrolünün ardından ilişkili kayıtlar ile varsa depolanan dosyalar silme kuyruğuna alınır.</li>
          </ol>
        </section>

        <section>
          <h2>Hesap veya çalışma alanı için</h2>
          <p>Çalışma alanı yöneticiniz üzerinden hesap kapatma ve çalışma alanı verilerinin silinmesi talebini iletin. Yetki doğrulaması yapılmadan toplu silme işlemi başlatılmaz.</p>
        </section>

        <section>
          <h2>WhatsApp verileri</h2>
          <p>Bağlı WhatsApp grubundan alınan bir kayıt için gelen kutusundaki öğeyi arşivleyebilir ve ilişkili kişi kaydı üzerinden silme talebi oluşturabilirsiniz. WhatsApp Business hesabındaki numara veya grup bağlantısını kaldırmak için çalışma alanı yöneticisi entegrasyonu devre dışı bırakmalıdır.</p>
        </section>

        <section>
          <h2>Süre ve istisnalar</h2>
          <p>Talepler normalde en geç 30 gün içinde sonuçlandırılır. Yasal saklama yükümlülüğü, güvenlik incelemesi veya devam eden uyuşmazlık gerektiren kayıtlar, yalnız zorunlu süre boyunca kısıtlı biçimde tutulabilir.</p>
        </section>

        <footer className="legal-footer"><Link href="/privacy">Gizlilik politikası</Link><Link href="/terms">Kullanım koşulları</Link><Link href="/">Spherepath’e dön</Link></footer>
      </article>
    </main>
  );
}
