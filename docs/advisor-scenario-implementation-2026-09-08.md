# Danışman senaryosu — uygulama ve doğrulama

8 Eylül 2026. Önceki inceleme: [bulgular ve plan](advisor-scenario-audit-2026-09-08.md).

Kod değişiklikleri ilk uygulama turunda yerelde yapıldı; canlı müşteri kayıtları değiştirilmedi. Çalışma ağacındaki önceden devam eden kişi aktarımı, navigasyon ve akış değişiklikleri korundu. Kullanıcının 9 Eylül'deki açık deploy talimatıyla web ve sunucu yayınlandı; yayın doğrulaması belgenin sonunda.

## Gerçekleşen ürün akışı

- Hazırlanan yetkili portföye doğrudan alıcı ilgisi kaydedilip işlem açılabiliyor. Sunum ve yayın koşulları korunuyor; sözlü yetki EİDS veya veri işleme doğrulaması üretmiyor.
- İşlemde 5.000.000 TL liste fiyatı, 4.500.000 TL alıcı teklifi ve 4.800.000 TL satıcı karşı teklifi ayrı duruyor. Her teklifin tarafı, tarihi, notu, önceki teklif bağlantısı ve varsa kaynak görüşmesi saklanıyor. Karşı teklif satış kabulü veya kapanış sayılmıyor.
- Anıl görüşmesi kaydedilirken sonraki adımın kişisi Melis ve bağlı işlem seçilebiliyor. Teklif ile takip aynı sunucu komutunda kaydediliyor. Anıl'ın bağımsız kişi takibi korunuyor.
- Kişiler listesi ve kişi detayı açık iş/işlem aksiyonlarını da gösteriyor. Erteleme mevcut tür ve saati koruyor; iş detayından doğrudan düzenlenebiliyor. Eski “Randevu yap” görevleri geriye uyumlu okunuyor.
- “Randevu planla” ile danışmanın karşı tarafça teyit edildiğini belirttiği “Teyitli randevuya katıl” ayrı aksiyonlar. Senaryonun son durumu teyit bekleyen plan.
- Alıcı talebi oluşturulurken bölge, mülk türü ve isteğe bağlı bütçe girilebiliyor. Kayıt görünür kalıyor ve ayrıntısı açılıyor. Onaylanan yazılı/sesli nottan açılan iş de kendi bağlamına ait kriterleri alıyor.
- Talep detayında kendi portföyü ile ofis havuzu eşleşmeleri, nedenleri ve eksik bilgiler görülebiliyor. Kendi portföyündeki adaya gerçek ilgi, danışmanın açıklamasıyla işlem olarak bağlanabiliyor; puan tek başına alıcı ilgisi sayılmıyor.

## Bulguların karşılığı

| Bulgu | Uygulama |
|---|---|
| 1, 2, 8 | Dahili talep aşaması, yinelenebilir teklif geçmişi, taraflar/liste fiyatı/takip özeti, talep ayrıntısında bağlı işlem geçmişi. |
| 3 | Kayıt sonrası filtre gerçek iş türünden seçiliyor; oluşturulan iş ayrıntısı açılıyor. |
| 4, 6, 7 | Paylaşılan sonraki adım özeti; iş ve kişi ekranlarından düzenleme; mevcut tür/saat korunuyor. |
| 5 | Görüşülen kişi, sonraki aksiyonun kişisi ve bağlı talep/işlem ayrı alanlar. |
| 9 | Kazanılmış ve mülke bağlı mevcut iş de tanınıyor. Alıcıya portföy ekleme önerisi gösterilmiyor; başka kişiye/işleme bağlı takip yanlışlıkla yeni satıcı işine dönüştürülmüyor. |
| 10 | Arsa formu ve arsa kriterlerinde oda kontrolleri gizleniyor; konuta özgü özellikler normalize ediliyor. |
| 11, 12 | Hazırlanan/aktif envanterin adet ve tutarı ayrı; Tümü görünümünde nötr aşama başlıkları. |
| 13 | Görüşme tarihi görünür; bağlı işlem ve teklif alanları yapılandırılmış. Onaylı not çıkarımı kriterleri uygun işe taşır; manuel metinden onaysız durum çıkarılmaz. |
| 14 | Plan ve danışman teyidi ayrı; tamamlanan görüşme mevcut temas kaydı akışını kullanır. |
| 15 | Aday yok, kriter eksik, uygun aday yok ve sorgu hatası ayrıldı. İşleme başlama koşulu aynı yerde açıklanıyor. |
| 16 | Yalnız yerel Emulator içindeki kişisel `@example.test` çalışma alanlarında kapsam önizlemeli iş verisi sıfırlama. Kullanıcı/ofis ayarları korunuyor; üretimde kapalı. |
| M1, M7 | Kendi portföyü ortak aday modeline katılıyor; arsa `areaM2` alanı `landAreaM2` olarak karşılaştırılıyor. Kaynak listing/property kimlikleriyle havuz kopyaları ayıklanıyor. |
| M2, M6 | Kriter ve eşleşme `opportunityId` bazında; iki talep birbirini ezmiyor. Kapanmış/silinmiş talepler yeniden eşleşme üretmiyor. Kişi hafızası yalnız hiç talep kaydı bulunmayan eski kişilerde geriye uyum amacıyla kullanılıyor. |
| M3 | Kriter/portföy değişiminde eşleşme ve bildirimler yenileniyor; açık oturumda kontrollü yenileme, açık hata durumu ve bildirimlerde `ownerUid`. |
| M4 | Eksik veri, gerçek çelişkiden ayrı açıklanıyor; arsa puanına oda kriteri katılmıyor. Teklif tutarı alıcının bütçesine dönüştürülmüyor. |
| M5 | Sunucu okumalarında sayfalama, 100 sonuçluk yanıt sayfaları, istemcide sayfaların birleştirilmesi; kişi filtresi ve devamını göster kontrolü. |

## Test sırasında bulunan ek düzeltmeler

- Gizli native tarih alanı tam genişlikte kontrol stilini miras alarak mobil sayfayı 24 piksel genişletiyordu. Görsel ekranı kaydırıp dokunma konumlarını bozuyordu. Gizli kontrolün boyutu ve konumu düzeltildi; tarayıcı testi yatay taşmayı da denetliyor.
- Tarih/saat “Uygula” düğmesi artık taslağı gerçekten uygular. Saat alanının güncel değeri okunur; “Yarın öğlen” kısayolu iki platformda var.
- Teklif geçmişi eski aşama zaman çizelgesi sütunlarına sıkışıyordu. Tam genişlikte okunur bir teklif listesi yapıldı. İş satırının aksiyon düğmesindeki taşma giderildi.
- Kriter düzenlemesi sonrası kapalı ayrıntı sorgusunun eski verisi yeniden açılabiliyordu. Ayrıntı yenilendikten sonra form kapanır.
- Birden fazla açık talep varsa işlem oluşturma rastgele birini seçmez; ilgili talebin seçilmesini ister.
- Yeni kişi/görüşme başlatırken önceki işlem, hedef kişi ve teklif taslağı temizlenir.

## Doğrulama

- Paylaşılan kurallar: **253 test** geçti. Sunucu birim testleri **72**, web **11**, mobil **3** test geçti.
- Emulator: temel API akışı **2**, bu senaryoya özel pazarlık ve sayfalama **2**, ofis sahipliği **1**, 1.000 kişilik ölçek kontrolü **1** test geçti.
- Senaryo testleri: iki teklifin korunması, komut tekrarlarının tek kayıt üretmesi, bağımsız kişi takibi, çoklu talep ayrımı, kapanmış talepler, profil itirazı, bildirim sahipliği ve ayarları koruyan sıfırlama doğrulandı. **506 portföy**, 100 sonuçluk sayfalarla eksiksiz okundu.
- Playwright: senaryo ve ilgili regresyon akışları masaüstü Chromium ve telefon Chromium görünümünde **6/6** geçti. Saat uygulama ve yatay taşma kontrolleri dahil. Masaüstü/telefon ekran görüntüleri incelendi.
- Web ve mobil TypeScript/lint; sunucu TypeScript; `pnpm parity:check` (**85 ortak callable**) geçti. Web üretim derlemesi yerelde başarılı; bu komut deploy yapmaz.
- Önceden devam eden kişi aktarımı çalışmasının 5.000 kayıtlık uzun testini içeren genel komut durduruldu; onun tamamı bu değişiklik için geçmiş sayılmıyor. Yukarıdaki ilgili entegrasyonlar ayrı çalıştırıldı ve geçti.

## Sınırlar ve canlıya geçiş

- Mobil uygulama kodu aynı kabiliyetleri ve ortak Türkçe metinleri içerir. Native cihaz/simülatör testi bu turda yapılmadı; telefon tarayıcısı testi native uygulama testi değildir.
- Sıfırlama bir üretim bakım aracı değildir. Yerel test çalışma alanındaki listelenen Firestore iş koleksiyonlarını temizler; Storage dosyalarını topluca silmez.
- 506 aday ve 1.000 kişi sınırları yerelde sınandı. Eşleşme hâlâ istek sırasında hesaplanır; çok büyük ofislerde kalıcı aday indeksi veya arka plan hesaplaması ayrıca yük ölçümü gerektirir.
- Canlıda eski metin notlarına yazılmış pazarlıklar otomatik taşınmadı. Mevcut kayıtlar için geriye dönük veri dönüşümü çalıştırılmadı.
- Web, mobil ve sunucu değişiklikleri birlikte gözden geçirilmeli. Kullanıcının talimatı gereği deploy için ayrıca haber ve onay beklenecek.

## 9 Eylül — sayaç kapsamı ve iş satırı

Kullanıcının ekran görüntülerindeki iki ek sorun düzeltildi:

- İş yolu sayaçları yalnız açık işleri sayıyordu. Artık aynı arama/tür kapsamındaki bütün durumları sayar: örnek senaryoda **Tümü 2, Portföy kazanma 1, Müşteri talepleri 1**; durum dağılımı **Açık 1, Kazanılan 1, Kaybedilen 0**. Kazanılan sekmesine geçmek üst toplamı değiştirmez. Görüntülenebilen mükerrer kapatmalar da kayıt sayaçlarına dahildir; performans ölçümü değiştirilmedi.
- İş satırındaki uzun düzenleme düğmesi kaldırıldı; kısa **Düzenle** ve **İlerlet** aynı eylem grubunda, aynı yükseklikte yan yana gösteriliyor. Randevu ve saat kendi alanında. Ayrıntı ekranındaki açıklayıcı etiket korunuyor.
- Sayım kuralı ve etiketler `@spherepath/shared` içinde. Mobilde de Tümü ve durum seçimleri aynı sayım kuralını kullanıyor.
- Saf kural testleri toplamın durumların toplamına eşitliğini ve filtre kapsamını doğrular. Tarayıcı senaryosu sayaçları, aramayı, durum/yol geçişlerini ve iki düğmenin hizasını kontrol eder.
- Doğrulama: paylaşılan kurallarda **256/256**, web birim testlerinde **11/11**, masaüstü ve telefon Chromium senaryosunda **2/2** geçti. Web/mobil TypeScript ve lint, **85 ortak callable** için platform eşliği ve yerel web üretim derlemesi başarılı. Ekran görüntüleri incelendi; native cihaz testi yapılmadı.

Bu ek değişiklikler için de deploy yapılmadı.

## 9 Eylül — seçili sekmeye uygun üst aksiyon

Kazanılan sekmesinde Melis'in açık talebine ait “İlerlet” kısayolu görünüyordu. Üst aksiyon artık yalnız **Açık** sekmesindeki görünür kayıtlardan seçilir. Kazanılan/Kaybedilen sekmelerinde ve arama, tür, iş yolu veya aşama filtresi sonucu açık kayıt kalmadığında gösterilmez. Açık sekmesine dönünce görünür iş için tekrar kullanılabilir.

Native uygulamada aynı üst kısayol bulunmuyor; ilerletme düğmesi zaten yalnız görünür, kapanmamış iş kartlarında gösteriliyor. Sunucu kabiliyeti veya aşama geçiş kuralı değiştirilmedi.

Doğrulama: masaüstü ve telefon Chromium senaryoları **2/2** geçti. Testler kapalı sekmeleri, açık kayıt bırakmayan filtreleri, Açık sekmesine dönüşü ve doğru kişinin ilerletme ekranının açılmasını kapsıyor. Web TypeScript/lint ve platform eşliği kontrolü geçti. Deploy yapılmadı.

## 9 Eylül — canlı yayın

Kullanıcının son sürümü yayınlama talimatıyla `spherepath-96ecd` projesindeki sunucu fonksiyonları, Firestore indeksleri ve Firebase Hosting dağıtıldı. Web adresi: https://www.getspherepath.com. Native mağaza yayını bu dağıtımın kapsamında değil.

- `pnpm check` geçti: **342 birim testi** (256 ortak, 72 sunucu, 11 web, 3 mobil), bütün platformların tip/lint kontrolleri ve **85 ortak callable** için platform eşliği. Kontrolde bulunan test dosyasındaki `structuredClone` tip uyumsuzluğu, değişmezlik kontrolünü koruyan JSON karşılaştırmasıyla giderildi.
- Ayrı Firestore/Storage emülatörlerinde **5/5 güvenlik kuralı testi** geçti. İlk deneme kapalı Storage emülatörü nedeniyle zaman aşımına uğramıştı; başarılı sonuç izole ortamdan alındı.
- Sunucudaki **97 fonksiyonun tamamı ACTIVE**. Web üretim derlemesi başarılı; **134 dosya** yayınlandı. Üretim derlemesinde emülatör bağlantısı kapalı.
- Ana sayfa, İşler, Kişiler, Portföy ve Kişi aktarımı HTTP 200 döndü. Beş sayfanın HTML'i ve İşler ekranındaki **14 JS/CSS dosyasının** SHA-256 değerleri yerel üretim derlemesiyle aynı.
- Kullanıcının açık canlı oturumunda **Tümü 2 / Açık 1 / Kazanılan 1**, hizalı **Düzenle / İlerlet** düğmeleri ve **Kazanılan sekmesinde üst ilerletme kısayolunun gizlenmesi** doğrulandı. Tarayıcı Kazanılan sekmesinde bırakıldı. Canlı iş kayıtlarına test mutasyonu uygulanmadı.

## 9 Eylül — listede eşleşme görünürlüğü (yayınlandı)

Açık alıcı/kiracı taleplerinin satırına portföy sayısını gösteren bir kısayol eklendi. Bu senaryoda rozet **“1 portföy adayı · Bilgi eksik”** gösterir; yeterli puandaki sonuçlar **“eşleşen portföy”**, diğerleri bilgi eksiği veya kriter farkıyla belirtilir. Rozet doğrudan ilgili talebin portföy panelini açar. Kazanılan/kaybedilen işler ile sonuç bulunmayan taleplerde rozet gösterilmez; yükleme ve hata durumları sıfır eşleşmeyle karıştırılmaz.

Liste ve detay aynı React Query kaynağını ve önbelleği kullanır; listede satır başına ayrı sunucu isteği açılmaz. Sayımlar kişi yerine fırsat kimliğiyle ayrılır ve aynı portföy mükerrer sayılmaz. Sayım ve Türkçe metinler ortak pakette, web/mobil uygulama kodunda aynı davranışla kullanılır. Sunucu API'si değiştirilmedi.

Doğrulama: ortak pakette **261/261 test**, web/mobil TypeScript ve lint, platform eşliği; masaüstü ve telefon Chromium senaryosu **2/2** geçti. Yerel web üretim derlemesi başarılı. Tarayıcı testi rozet, doğru portföy paneli, kapatınca odağın dönmesi, kapalı sekmelerde gizlenmesi ve aksiyon düğmelerinin hizasını kapsar. Masaüstü/telefon ekran görüntüleri incelendi. Native cihaz testi yapılmadı. Bu ek özellik kullanıcının sonraki deploy talimatıyla 9 Eylül saat 01:43 civarında Firebase Hosting üzerinden yayınlandı. Üretim derlemesi başarılı; beş sayfa ve İşler ekranındaki 14 JS/CSS dosyası canlıda yerel derlemeyle aynı. Kullanıcının canlı oturumunda “1 portföy adayı · Bilgi eksik” rozeti ve tıklayınca Anıl Emene’nin 620 m² arsasının açılması doğrulandı. Açık sekmedeki eski dosyalar taze sayfa isteğiyle yenilendi. Sunucu API değişikliği olmadığından bu turda yalnız web dağıtıldı; native mağaza yayını yapılmadı.
