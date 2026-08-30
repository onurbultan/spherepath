import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Gizlilik Politikası | Spherepath",
  description: "Spherepath gizlilik politikası ve kişisel veri işleme esasları.",
};

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <header className="legal-header">
          <Link className="legal-brand" href="/">Spherepath</Link>
          <p className="eyebrow">GİZLİLİK POLİTİKASI</p>
          <h1>Veriyi yalnız danışmanın işini kolaylaştırmak için işleriz.</h1>
          <p>Son güncelleme: 30 Ağustos 2026</p>
        </header>

        <section>
          <h2>Kapsam</h2>
          <p>Spherepath; emlak danışmanlarının ilişkilerini, görüşme sonuçlarını, fırsatlarını, portföylerini ve günlük aksiyonlarını yönetmesine yardımcı olan bir çalışma alanıdır. Bu politika web ve mobil uygulamalarımız ile resmi WhatsApp Business API entegrasyonunu kapsar.</p>
        </section>

        <section>
          <h2>İşlenen veriler</h2>
          <ul>
            <li>Hesap ve çalışma alanı bilgileri: kimlik doğrulama hesabı, ofis ve kullanıcı rolü.</li>
            <li>Danışmanın eklediği CRM kayıtları: kişi, iletişim bilgisi, görüşme sonucu, sonraki aksiyon, fırsat ve portföy bilgileri.</li>
            <li>Görüşme sonrası sesli notlar: yalnız danışmanın görüşme bittikten sonra verdiği özet işlenir; karşı tarafın konuşması kaydedilmez.</li>
            <li>Bağlı WhatsApp grubundaki mesajlar: yalnız resmi API’nin ilettiği grup mesajları, danışman incelemesine sunulmak üzere güvenli metin ve yapılandırılmış iş sinyaline dönüştürülür.</li>
            <li>Güvenlik ve işletim kayıtları: komut kimlikleri, hata ve teslimat durumları gibi hizmetin güvenli çalışması için gerekli teknik kayıtlar.</li>
          </ul>
        </section>

        <section>
          <h2>Amaç ve hukuki dayanak</h2>
          <p>Veriler; talep edilen hizmeti sunmak, kayıtları senkronize etmek, danışmanın onayladığı iş akışlarını yürütmek, güvenliği sağlamak ve yasal yükümlülükleri yerine getirmek için işlenir. Pazarlama iletişimi, aydınlatma ve iletişim izinlerinden ayrı yönetilir.</p>
        </section>

        <section>
          <h2>Ses ve otomatik analiz sınırları</h2>
          <p>Ham ses ve maskelenmemiş döküm kalıcı kayıt olarak tutulmaz. Sistem kişilik, güvenilirlik, eğitim, duygu veya hassas nitelik çıkarımı yapmaz. Sesli nottan veya WhatsApp mesajından çıkarılan taslaklar, kullanıcı incelemesi olmadan kişi ya da fırsat kaydına dönüşmez.</p>
        </section>

        <section>
          <h2>Saklama ve silme</h2>
          <p>Veriler yalnız ürün amacı ve yasal gereklilik için ihtiyaç duyulan süre boyunca saklanır. Tamamlanmış sesli not kayıtları en fazla 180 gün, komut kayıtları 90 gün, tamamlanmış veri sahibi talepleri 180 gün ve arşivlenmiş gelen kutusu kayıtları 365 gün sonunda periyodik olarak temizlenir. Kullanıcılar uygulama içinden kişi bazlı dışa aktarma ve silme talebi oluşturabilir.</p>
        </section>

        <section>
          <h2>Hizmet sağlayıcılar ve güvenlik</h2>
          <p>Kimlik doğrulama, veri saklama ve sunucu işlemleri için Google Firebase; WhatsApp entegrasyonu için Meta’nın resmi WhatsApp Business Platform hizmetleri kullanılabilir. Veriler çalışma alanı ve kullanıcı sahipliği ile ayrıştırılır; webhook çağrılarında imza doğrulaması uygulanır.</p>
        </section>

        <section>
          <h2>Haklar ve başvuru</h2>
          <p>Veriye erişme, düzeltme, dışa aktarma, işlemeye itiraz etme veya silme talebinde bulunma hakkınız vardır. Giriş yaptıktan sonra <strong>Ayarlar → Veri sahibi hakları</strong> bölümünden talep oluşturabilirsiniz. Hesabınıza erişemiyorsanız hizmeti size sağlayan Spherepath çalışma alanı yöneticisi üzerinden başvuru yapabilirsiniz.</p>
          <p><Link href="/data-deletion">Veri silme talimatlarını görüntüle</Link></p>
        </section>

        <footer className="legal-footer"><Link href="/terms">Kullanım koşulları</Link><Link href="/data-deletion">Veri silme</Link><Link href="/">Spherepath’e dön</Link></footer>
      </article>
    </main>
  );
}
