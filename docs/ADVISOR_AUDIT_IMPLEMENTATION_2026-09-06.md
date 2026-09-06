# 5 Eylül bulguları — uygulama ve doğrulama planı

Kaynak: `FIRST_TIME_ADVISOR_LIVE_AUDIT_2026-09-05.md`. Web ve mobil aynı davranışı paylaşır; değişiklikler ortak kurallar, sunucu komutları ve platforma ait görünümler üzerinden yapılır.

## Uygulama sırası ve kabul ölçütleri

1. **Eşleşme güveni (P0):** Bölge uyuşmazlığı yüksek güvenli eşleşme olamaz; kesin bölge tercihi eşleşmeyi eler. Esnek tercih yalnız açık gerekçe ve düşük skorla alternatif gösterilir. Ortak şehir/sözcük benzerliği farklı ilçeleri eşleştirmez; skor bileşenleri görünür.
2. **Hızlı nottan ilk müşteri (P0):** Talep incelemesinden ayrılmadan yeni kişi oluşturulur. Düzenlenebilir ad, telefon, kaynak, rol, kriter ve takip zamanı korunur. Var olan idempotent sunucu işlemi kişi, görüşme, fırsat ve takibi atomik kaydeder.
3. **Fırsat doğruluğu (P1):** Aşama düzeltme mevcut aşamayla açılır ve değişiklik özeti gösterir. Alıcı/kiracı arama kriterleri ile satıcı/kiralayanın mülk bilgileri ayrı sunulur. Aynı kişide benzer açık fırsat açıkça belirtilir.
4. **Görev tutarlılığı (P1):** Kişi ve fırsatta aynı işi temsil eden hatırlatıcılar hangi yüzeyden tamamlanırsa tamamlansın birlikte güncellenir; bağımsız işler korunur. İlgili ortak sorgular yenilenir.
5. **Kapama (P1):** Kapandı/kaybedildi aşamalarında sonraki aksiyon alanı ve zorunluluğu kaldırılır.
6. **İlk kullanım (P2):** Yeni ofis ve davetli katılımın rol sonuçları kayıtta açıklanır. Boş hesap üç anlaşılır başlangıç eylemi sunar.
7. **Kontroller (P2):** Enter yanlışlıkla form göndermez; tarih ile saat birlikte tamamlanır. Menü düğmeleri ve seçim durumları erişilebilirdir.
8. **Durum dili (P2):** Harici gönderim açık kullanıcı teyidi ister. Veri talebinin son tarihi doğru adlandırılır; kimlik doğrulama, hazırlama ve teslim adımları ayrılır. Huni oranının pay ve paydası açıklanır.
9. **Geri bildirim (P2):** İndirme, veri yenileme ve uzun işlemlerde anlaşılır durum/başarı geri bildirimi verilir.

## Doğrulama

- Saf domain kuralları için anlamlı birim testleri; komut atomikliği ve görev yaşam döngüsü için Firebase Emulator entegrasyon testleri.
- TypeScript, lint, platform paritesi ve tasarım token kontrolü; web üretim derlemesi.
- Yeni sentetik danışman hesabıyla UI üzerinden kişi → görüşme/talep → görev → portföy → sunum → işlem/kapama → huni ve ofis havuzu akışı.
- Ayrı sonuç raporunda gerçekten denenmiş adımlar, kalan sürtünme ve test edilemeyen dış servis/mobil sınırları açıkça kaydedilir.

## Durum

Dokuz uygulama başlığı tamamlandı. Web ve mobil aynı sunucu kabiliyetlerini kullanıyor; yeni parite istisnası eklenmedi. Son kullanıcı denemesi ve kalan sınırlar [6 Eylül tekrar deneme raporunda](FIRST_TIME_ADVISOR_RETEST_2026-09-06.md).

Önceden mevcut test Firebase yapılandırması, önceki rapor ve geliştirme çıktıları silinmedi. Değişiklikler yerel çalışma alanında; üretime dağıtılmadı.

Son kabul: 279 birim testi, 4 Firebase API entegrasyon senaryosu ve masaüstü/telefon görünümünde 8 tarayıcı senaryosu geçti. TypeScript, lint, 74 fonksiyonun platform paritesi, tasarım token kontrolü ve web üretim derlemesi başarılı.
