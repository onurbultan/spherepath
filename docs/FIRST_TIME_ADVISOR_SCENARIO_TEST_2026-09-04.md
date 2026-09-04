# İlk kez kullanan emlak danışmanı senaryo testi

Tarih: 4 Eylül 2026  
Ortam: Chrome, `http://localhost:5050`  
Kapsam: Web uygulaması; tamamen sentetik kişi, telefon, portföy, teklif ve kapama verileri  
Referans: [ADVISOR_FIRST_USE_IMPLEMENTATION_PLAN.md](./ADVISOR_FIRST_USE_IMPLEMENTATION_PLAN.md) ve [REAL_ESTATE_ADVISOR_ACCEPTANCE.md](./REAL_ESTATE_ADVISOR_ACCEPTANCE.md)

## Yönetici özeti

Spherepath'in çekirdek zinciri çalışıyor: kişi oluşturma, görüşme kaydı, sonraki aksiyon, fırsat, portföy, sunum, işlem, kapama ve huni sonucu aynı veri setinde uçtan uca tamamlandı. En hızlı ve güvenilir yol, kişi zaten seçiliyken manuel temas formunda **sonraki aksiyon ve tarihi de doldurmak**; bu durumda talep tek düğmeyle fırsata dönüşüyor ve Akış doğru işi gösteriyor.

İlk kez kullanan danışmanın en doğal alternatif yolu olan **Akış'a hızlı not bırakma** ise hâlâ kırılgan. Yeni bir kişi içeren satıcı notu “Takip” diye sınıflandı, fakat ilgili kişi henüz olmadığı için ilerleyemedi. Tür “Kişi” olarak düzeltilince isim tekrar yazıldı; satıcı rolü, kaynak ve notta açıkça yazan takip tarihi taşınmadı. Danışman aynı görüşmeyi yeniden temas formuna girmek zorunda kaldı.

Pilot öncesi en kritik üç konu:

1. Tek olayın kişi, temas, talep/fırsat ve takip kayıtlarına parçalanırken bilgi kaybetmemesi.
2. Kapama ve fırsat terminal durumlarının bütün ilişkili açık işleri atomik kapatması.
3. Kiracı talebi ile kiralık ofis havuzu portföyünün eşleşebilmesi ve fırsat üzerinde talep kriterlerinin görülebilmesi.

## Test edilen müşteri senaryoları

| Senaryo | Gerçek danışman amacı | İzlenen yol | Sonuç |
| --- | --- | --- | --- |
| Yeni alıcı | Bugünkü telefon görüşmesini kaydet, ilk takibi planla, talep aç | Temas kaydet → aynı akışta kişi → manuel görüşme → alıcı fırsatı → aşamalar | Tamamlandı; ilk takip ile fırsat takibi arasındaki ilişki açıklanmadı |
| Yeni satıcı | Duyulan bilgiyi hızlı bırak, değerleme planla, portföy kazan | Akış hızlı not → kişi dönüşümü → temas → değerleme → portföy → fiyat → aktif | Tamamlandı; hızlı notta rol/tarih kaybı ve tekrar veri girişi oluştu |
| Alıcıya sunum ve kapama | Portföy öner, izinleri yönet, gezi/teklif/sözleşme/kapamayı takip et | Sunum taslağı → kullanıcı onayı → işlem → Gezi → Teklif → Sözleşme → Kapandı | Tamamlandı; sunum “Gönderildi” olmadan işlem kapatılabildi |
| Yeni kiracı | İlan kanalından gelen kişiyi ve yarınki portföy paylaşımını kaydet | Kişi → manuel temas → Kiracı talebi → yarın mesaj işi | Tamamlandı; bu akış aksiyon/tarihi fırsata doğru taşıdı |
| Ofis havuzu | WhatsApp grubundaki kiralık ilanı yapılandır, talebe eşleştir | Havuza ekle → mesajı çözümle → insan onayı → eşleşme kontrolü | Kısmi; ilan doğru ayrıştırıldı fakat tam eşleşen kiracı talebi bulunamadı |
| Günlük operasyon | Bugünün işlerini bitir, yaklaşanları gör, gereksiz işleri kapat | Akış → görev sonucu → fırsat terminal durumu → yeniden kontrol | Kısmi; görevler ancak ilişkili fırsat ayrıca sonuçlandırılınca temizlendi |

## Öncelikli bulgular

### P0 — Operasyonu veya veri doğruluğunu bloklayanlar

#### 1. Yeni kişi içeren hızlı not tek akışta işlenemiyor

Yeniden üretim:

1. Akış'a “Selin Aras, Balıklıova'daki 4+1 villasını satmayı düşünüyor. Pazartesi 14:00'te değerleme randevusu için ara.” yaz.
2. Notu “Düzenle ve işle” ile aç.
3. Sistem türü “Takip” önerir; ilgili kişi alanında Selin yoktur ve aynı pencerede kişi oluşturma seçeneği bulunmaz.
4. Türü “Kişi” yap.

Gözlem:

- İsim nottan algılanmasına rağmen kişi formuna otomatik gelmedi.
- Satıcı rolü, gelen arama kaynağı ve Pazartesi 14:00 takip bilgisi kişi kaydına taşınmadı.
- Oluşan iş “İlk anlamlı teması kaydet · Tarihsiz” oldu.
- Danışman aynı görüşme sonucunu temas formuna ikinci kez yazdı.

Beklenen:

> Yeni kişi + görüşme sonucu + rol + talep/portföy adayı + sonraki iş tek inceleme ekranında önerilmeli ve tek onayla oluşturulmalı.

Bu bulgu mevcut B2, B3, B5, B15 ve B20'nin pratikte hâlâ hissedildiğini gösteriyor.

#### 2. Kapama, aynı alıcıya ait açık fırsatı ve takip işini kapatmıyor

Balıklıova portföyü Deniz için işlemde `Kapandı` yapıldı; gerçekleşen bedel ve komisyon kaydedildi, portföy `Satıldı` oldu. Buna rağmen Deniz'in alıcı fırsatı `Görüşüldü` aşamasında ve 11 Eylül araması Akış'ta açık kaldı. Ancak alıcı fırsatı ayrıca tüm aşamalardan geçirilip `Müşteri kazanıldı` yapıldıktan sonra takip temizlendi.

Etkisi:

- Bitmiş satış için yanlış arama işi üretilir.
- Danışman işlem, fırsat ve günlük görev olmak üzere üç ayrı kaydı elle kapatmak zorunda kalır.
- Huni ve açık fırsat sayıları geçici olarak aynı ticari sonucu farklı gösterir.

Beklenen:

> İşlem kapanırken bağlı alıcı/kiracı fırsatı önerilen terminal duruma gelmeli; ilişkili açık aksiyonlar aynı sunucu komutunda kapanmalı veya açıkça yeniden planlanmalı.

Bu, B18/SP-005 kapsamının alıcı/kiracı fırsatı ve `transaction → demand opportunity` bağı için genişletilmesi gereken bir boşluk.

#### 3. Kiracı talebi ile tam eşleşen kiralık havuz portföyü bulunmuyor

Talep:

- Karşıyaka, 2+1 kiralık daire
- Aylık üst sınır 45.000 TL
- 1 Ekim taşınma

Havuz kaydı:

- Karşıyaka Bostanlı, 2+1 kiralık daire
- 100 m², 43.000 TL
- 1 Ekim'de boş

Sonuç: Ofis havuzu “Henüz uygun eşleşme yok” gösterdi; bildirim açıklaması da yalnız “alıcı–portföy eşleşmesi” diyor.

Muhtemel nedenler:

- Eşleşme yalnız `buyer_request` için çalışıyor olabilir.
- `tenant_request` desteklenmiyor olabilir.
- Temas özetindeki talep kriterleri fırsata yapılandırılmış biçimde taşınmıyor olabilir.

Beklenen:

> Satılık ↔ alıcı ve kiralık ↔ kiracı yolları aynı açıklanabilir eşleşme motorunu kullanmalı; eşleşmeme nedeni kullanıcıya gösterilmeli.

#### 4. Yetki durumu ticari gerçekliği korumuyor

Satıcı yalnız değerleme randevusu vermişken “Mevcut yetkiyi ekle” formu `Tek yetkili` ile açıldı. Testte `Belirsiz` seçilmesine rağmen portföy fiyat girildikten sonra `Aktif` yapılabildi; sunum ve işlem düğmeleri açıldı. Aynı portföy daha sonra satıldı ancak yetki sütunu hâlâ `Belirsiz` kaldı.

Beklenen:

- Değerleme randevusundan gelen kayıtta varsayılan `Yetki belirsiz` olmalı.
- `Aktif` ve dış pazarlama için ayrı readiness kontrolü olmalı.
- Yetki türü, belge/EİDS/medya ve pazarlama durumu portföy detayından sonradan düzenlenebilmeli.
- Huni `Yetkili portföy` sayısını `Belirsiz` kayıttan üretmemeli.

Bu, B21'in hâlâ gözlemlenen bir örneği.

#### 5. Ayarlar ekranında imzalı webhook adresleri düz metin görünüyor

Santral olay ve yönlendirme adresleri erişim belirteci içeren tam URL olarak salt okunur metin alanlarında gösteriliyor. Bu rapora değerler bilinçli olarak alınmadı.

Beklenen:

- Varsayılan görünüm maskeli olmalı.
- “Göster/kopyala” ayrı ve denetlenen bir eylem olmalı.
- Yenileme erişimi dar yetkiye ve açık uyarıya bağlanmalı.
- Belirteçlerin tarayıcı erişilebilirlik ağacında ve istemci loglarında gereksiz görünmesi engellenmeli.

### P1 — Danışmanı yavaşlatan veya güveni azaltanlar

#### 6. Manuel temas her girişte ikinci seçenek

Her kişi için `Temas kaydet` açıldığında varsayılan sekme `Sesli anlat`. Telefon görüşmesi zaten bitmiş, kısa metin yazmak isteyen danışman her seferinde `Manuel yaz` seçiyor. Son kullanılan yöntemi hatırlamak veya iki yöntemi eşit bir ilk karar olarak göstermek daha hızlı olur.

#### 7. “İlk takip” ve “görüşme sonrası adım” aynı kavram gibi görünse de farklı davranıyor

Kişi oluştururken 11 Eylül araması planlandı. Ardından manuel görüşmede `Sonraki adım = Henüz yok` bırakılınca başarı mesajı “Sonraki adım planlanmadı” dedi. “Fırsat ayrıntılarını tamamla” bağlantısı ise düzenleme şansı vermeden fırsatı ertesi gün 15:00 varsayılanıyla oluşturdu. Fırsat ilerletilirken tarih tekrar 11 Eylül'e düzeltildi.

Karşı örnek: Ece görüşmesinde aksiyon ve tarih temas formunda dolduruldu; `Fırsat aç: Kiracı talebi` bunları tek adımda doğru taşıdı.

Beklenen:

> Var olan kişi takibi formda görünmeli; yeni temas aksiyonu bunu devralmalı, değiştirmeli veya bilinçli olarak ayrı iş oluşturmalı. Sonuç ekranı hangi kaydın oluşacağını önceden açıkça söylemeli.

#### 8. Fırsat detayı talep kriterlerini göstermiyor

Kiracı ve alıcı fırsat detaylarında yalnız aşama ve zaman çizelgesi görüldü. Bölge, bütçe, oda, taşınma tarihi, olmazsa olmazlar ve geçerli sonraki aksiyon görüntülenemedi/düzenlenemedi.

Etkisi:

- Danışman fırsat panosundan müşterinin ne aradığını anlayamıyor.
- Eşleşmeme nedenini doğrulayamıyor.
- Yeni görüşmede aynı soruları tekrar sormak zorunda kalabilir.

#### 9. Hızlı notta geçici durum dili gereksiz hata hissi veriyor

İlk kayıtta kısa süre “1 kayıt gönderilmeyi bekliyor; yeniden deneniyor” göründü; hemen sonra not sınıflandırıldı. Ağ hatası olmayan olağan bir AI bekleme anı hata/kuyruk gibi sunuluyor. B15 hâlâ yeniden üretilebildi.

#### 10. AI alan aktarımı kısmi

- “Balıklıova'daki 4+1 villa” bilgisinden konum ve mülk türü doldu, `4+1` oda/salon alanlarına dolmadı.
- WhatsApp havuz mesajındaki “otoparklı” güvenli özette kaldı, düzenlenebilir `Diğer özellikler` alanına taşınmadı.
- Hızlı nottan portföy formunda kullanılan bilinen mülk özeti, kişi detayındaki `Hafıza` sekmesinde görünmedi.

Beklenen: Aynı çıkarım sonucu kişi hafızası, fırsat kriterleri ve portföy formunda tek kaynaktan ve alan bazlı kanıtla kullanılmalı.

#### 11. İç etiket müşteri mesajına taşınıyor

Kişi adı `Deniz Kaya · Test Alıcı` olarak girildiğinde sunum taslağı “Merhaba Deniz Kaya · Test Alıcı,” diye başladı. Gerçek kullanımda danışmanların ada eklediği ayırt edici etiketler doğrudan dış mesaja sızabilir.

Beklenen: `displayName` ve danışman içi `label/note` ayrı alanlar olmalı; dış taslak yalnız temiz hitap adını kullanmalı.

#### 12. Sunum teslimi ile işlem başlangıcı bağlı değil

Sunum `Kullanıcı onayladı` durumundayken ve `Gönderildi` teyidi verilmeden işlem başlatılıp `Kapandı` durumuna kadar ilerletilebildi. Dış mesajın gönderildiği özellikle işaretlenmedi; bu güvenlik sınırı doğru korundu. Ancak kapama zincirinin sunum teslimiyle ilişkisi görünür değil.

Beklenen: İşlem başka kanaldan başlatılabiliyorsa neden/kaynak seçilmeli; sunum üzerinden başlatılıyorsa teslim/yanıt bağı açık olmalı.

#### 13. Kapama aşamaları çok az operasyonel kanıt istiyor

`Sunum → Gezi → Teklif → Sözleşme → Kapandı` zincirinde gezi ve sözleşme aşamaları tarih, taraf teyidi veya sonraki iş istemeden saniyeler içinde geçilebildi. Bu, B22'nin hâlâ gözlemlenen kısmı.

#### 14. İlk kullanım kişiselleştirmesi görünmüyor

Profilin varsayılan bölgeleri `İstanbul, Kadıköy`; test operasyonları Urla/İzmir olmasına rağmen ilk kişi veya ilk portföy akışında bu uyumsuzluk görünmedi. Ayarlar sayfası hâlâ profil, hatırlatma, santral, WhatsApp, VERBİS, ses gizliliği ve veri taleplerini tek uzun sayfada gösteriyor. B12 devam ediyor.

### P2 — Anlam ve görünürlük sorunları

- Satılan portföy tabloda kalırken yan menü `Portföy 0` gösteriyor. Bu B25 ile aynı; “Aktif 0” denmeli veya rozet kaldırılmalı.
- Kapanan portföy toplam liste değerine dahil görünüyor; başlığın aktif envanter mi dönem hacmi mi olduğu belirsiz.
- Huni `Yetkili portföy = 1` gösterirken tek kaydın yetki alanı `Belirsiz` kaldı.
- Fırsat panosunda varsayılan segment `Portföy adayları`; alıcı/kiracı fırsat bağlantısıyla gelindiğinde ana pano boş görünse de detay açılıyor. Bağlama göre segment otomatik seçilmeli.
- Kişi düzenleme penceresi kapandıktan sonra URL'deki `action=edit` parametresi kaldı; yenilemede formun istemeden tekrar açılma riski var.

## Güçlü çalışan noktalar

- Sıfır kişili Kayıt ekranı aynı sheet içinde ilk kişiyi oluşturdu ve görüşmeye geri döndürdü.
- Kişi, telefon, kaynak ve rol alanları Türkçe ve anlaşılır; ülke kodu desteği iyi.
- Manuel temas sonucu, kanal, ayrıntılar ve sonraki işi tek ekranda tutuyor.
- Temas formunda aksiyon/tarih girildiğinde fırsat tek düğmeyle, tekrar veri girişi olmadan oluştu.
- Akış bugün ile yaklaşan işi ayırdı; tamamlanan görev `1 / 1` olarak kaldı ve yaklaşan iş terminal fırsat sonrası temizlendi.
- Görev sonuçlandırma seçenekleri `Tamamlandı / Ertele / Atla / İletişim istemiyor` gerçek danışman operasyonuna uygun.
- Fırsat yolları müşteri talebi ve portföy adayı olarak ayrılmış; kartta geçerli aksiyon/tarih görünür.
- Eksik fiyat portföy aktivasyonunu blokladı; fiyat tamamlandıktan sonra aktifleşme açıldı.
- WhatsApp havuz alımı ham mesajı saklamayacağını açıkça söyledi, yapılandırılmış taslağı insan onayına sundu ve test telefon numarası çıkarmadı.
- Uyum kapısı sunum taslağından önce aydınlatma ve kanal iznini istedi; taslak kaydı dış gönderim sayılmadı.
- Kapama bedeli, teklif ve komisyon doğru hesaplanıp Huni'ye yansıdı.
- Global arama aynı sonuçta kişi ile fırsatı ayrı gösterdi; sayfa ve eylem kısayolları faydalı.
- Ekip ekranı veri sahipliğini ve ofis geçişinin neden kapalı olduğunu açıkça anlattı.
- Uygulamaya ait tarayıcı konsol hatası görülmedi; görülen uyarılar üçüncü taraf Chrome uzantısındandı.

## Oluşturulan sentetik test verisi

| Tür | Kayıt |
| --- | --- |
| Kişiler | `Deniz Kaya · Test Alıcı`, `Selin Aras · Test Satıcı`, `Ece Aydın · Test Kiracı` |
| Fırsatlar | Deniz kazanıldı, Selin portföy fırsatı kazanıldı, Ece kiracı talebi açık |
| Kendi portföyü | Balıklıova villa, 18.500.000 TRY, test işleminden sonra `Satıldı`, yetki `Belirsiz` |
| Ofis havuzu | Karşıyaka Bostanlı 2+1 kiralık, 43.000 TRY, açık yetki |
| Sunum | Deniz ↔ Balıklıova, `Kullanıcı onayladı`; **Gönderildi işaretlenmedi** |
| İşlem | 17.800.000 TRY gerçekleşen bedel, 356.000 TRY komisyon, `Kapandı` |
| Açık iş | Ece için 5 Eylül 10:00 `Mesaj gönder` |

## Güvenlik nedeniyle bilinçli olarak tamamlanmayan adımlar

- Gerçek telefon araması başlatılmadı.
- WhatsApp sunumu `Gönderildi` işaretlenmedi ve dış uygulamaya mesaj gönderilmedi.
- Ekip davet kodu oluşturulmadı.
- Bildirim aboneliği açılmadı.
- Veri sahibi talebi oluşturulmadı, veri dışa aktarılmadı ve hiçbir kayıt silinmedi.
- Santral/Meta bağlantı ayarları değiştirilmedi; görünen gizli değerler rapora alınmadı.

## Önerilen düzeltme sırası

1. `transaction closed → linked demand opportunity terminal → open task cleanup` ilişkisini tek komutta tamamla.
2. Hızlı nottan yeni kişi + temas + rol + fırsat + takip için birleşik inceleme ekranı oluştur.
3. Kiracı ↔ kiralık eşleşmesini ekle; fırsatta yapılandırılmış kriterleri görünür ve düzenlenebilir yap.
4. Yetki/readiness modelini ayır; `Belirsiz` yetkiyle aktif pazarlama ve kapamayı açık gerekçe olmadan engelle.
5. Sunum teslimi ile işlem kaynağını bağla; dış aktivite teyidini koru.
6. Webhook belirteçlerini maskele ve kontrollü göster/kopyala/yenile akışına al.
7. Son kullanılan kayıt yöntemini hatırla; manuel ve sesli girişi ilk gün eşit görünür yap.
8. Alan çıkarımını kişi hafızası, fırsat ve portföy arasında tek kanıtlı modele taşı.

## Düzeltme sonrası tekrar test

Tarih: 4 Eylül 2026  
Durum: Bu rapordaki bulgular yerel kaynak kodda giderildi; ilk gözlemler tarihçe olarak yukarıda korunmuştur.

| Bulgu | Uygulanan sonuç | Tekrar test |
| --- | --- | --- |
| 1 · Hızlı nottan yeni kişi | Düzenlenebilir tek inceleme ekranı kişi, temas, rol, portföy/talep fırsatı ve tarihli sonraki işi tek idempotent komutta oluşturuyor. Uygulama geri alma eylemi bütün bağlı kayıtları birlikte geri alıyor. | Web ve mobil akışları, Functions entegrasyonu |
| 2 · Kapama sonrası açık fırsat | İşlem bağlı alıcı/kiracı fırsatını `won` yapıyor, terminal olayını yazıyor ve açık sonraki aksiyonu aynı transaction içinde temizliyor. | Functions entegrasyonu ve shared kapanış testleri |
| 3 · Kiracı–kiralık eşleşmesi | Satılık/alıcı ve kiralık/kiracı işlem aileleri eşleştiriliyor; Karşıyaka–Bostanlı gibi üst/alt bölge adları örtüşüyor ve nedenler gösteriliyor. | Shared eşleşme testleri ve API entegrasyonu |
| 4 · Yetki ve readiness | Yeni kayıt `Belirsiz` ile başlıyor; yetki, fiyat ve mülk bilgisi hazır olmadan aktivasyon kapalı. Yetki detaydan düzenleniyor; belirsiz kayıt huni yetki sayısına girmiyor. | Web canlı kontrol, E2E ve API entegrasyonu |
| 5 · Webhook anahtarı | Anahtarlı adres ilk yükte istemciye dönmüyor ve DOM/erişilebilirlik ağacında bulunmuyor; yalnız broker'ın açık kopyalama eylemiyle kısa süreli alınabiliyor. | Web canlı DOM kontrolü ve Functions yetki testleri |
| 6 · Kayıt yöntemi | Son kullanılan sesli/manüel yöntem web ve mobilde hatırlanıyor. | Masaüstü ve mobil E2E |
| 7 · Takip devralma | Kişinin mevcut aksiyon ve tarihi temas formuna getiriliyor; danışman değiştirdiğinde yeni görüşme sonucu bilinçli olarak yerini alıyor. | Web ve mobil uygulama testi |
| 8 · Fırsat kriterleri | Bölge, bütçe, oda/salon ve olmazsa olmazlar fırsat detayında görüntülenip düzenleniyor; kişi hafızasıyla güncel tutuluyor. | API entegrasyonu, web ve mobil görünüm |
| 9 · Yanlış kuyruk dili | Olağan AI analizi bekleme durumu kuyruk hatası sayılmıyor; güvenli kuyruk yalnız gerçek ağ/çevrimdışı hatalarında gösteriliyor. | Shared testler ve E2E çevrimdışı senaryosu |
| 10 · Alan çıkarımı | `4+1`, `45 bin`, havuz, otopark ve kiralık/satılık işlem türleri yapılandırılmış alanlara aktarılıyor; kişi hafızası, fırsat ve portföy aynı sonucu kullanıyor. | Normalizasyon ve portföy çıkarım testleri |
| 11 · İç etiket | `·` sonrasındaki danışman içi ayırt edici etiket müşteri hitabından temizleniyor. | Shared kapanış/sunum testleri |
| 12 · Sunum–işlem bağı | İşlem kaynağı ve gönderilmiş sunum bağı saklanıyor; sunumdan işlem başlatırken doğrulanmış teslim kanıtı gerekiyor. Başka kanaldan işlem açılırsa kaynak açıkça seçiliyor. | API entegrasyonu ve kapanış testleri |
| 13 · Kapama kanıtları | Gezi, teklif, sözleşme ve kapanış geçişlerinde aşamaya uygun tarih/bedel/kanıt alanları isteniyor ve doğrulanıyor. | Web/mobil kapama akışı ve Functions testleri |
| 14 · İlk kullanım | Yeni çalışma alanı hayali İstanbul/Kadıköy bölgesiyle başlamıyor; Akış ilk gerçek işe göre üç kısa başlangıç yolu sunuyor. | Bootstrap ve masaüstü/mobil E2E |
| P2 görünürlük | Navigasyon `Aktif portföy` diyor, toplam yalnız aktif/rezerve envanteri içeriyor, fırsat bağlantısı doğru segmente gidiyor ve kişi düzenleme URL durumu kapanınca temizleniyor. | Web canlı kontrol ve E2E |

### Tekrar test sonucu

- `pnpm check`: geçti — strict TypeScript, lint, 260 birim testi ve web/mobile callable parity (`73/73`).
- `pnpm design:check`: geçti.
- `pnpm build`: geçti.
- `pnpm test:rules`: geçti (`5/5`).
- `pnpm test:api`: geçti (`3/3`); birleşik not işleme, kriter güncelleme, kiracı eşleşmesi ve atomik kapama dahil.
- `pnpm test:e2e:web`: geçti (`4/4`); masaüstü ve mobil Chromium danışman yolculukları dahil.

Görünür Chrome tekrar testinde yeni kişi inceleme alanlarının dolması, `Belirsiz` yetkili portföyün `Hazırlanıyor` kalması, readiness blokları, aktif envanter değerinin kapanan/hazırlanan kayıtları dışlaması ve webhook anahtarının DOM'da bulunmaması doğrulandı. Bu Chrome oturumu yerel web arayüzünü henüz dağıtılmamış uzak Functions sürümüne bağlı kullandığı için sunucu tarafındaki atomik işlemlerin nihai kanıtı Firebase emülatörlü API ve E2E koşularından alındı; üretim dağıtımı bu çalışma kapsamında yapılmadı.

### Ayrı UI incelemesi

Ayrı ajan, yetkili ekrana erişmeden kaynak kodu ve erişilebilirlik yapısı üzerinden salt okunur bir UI incelemesi yaptı. Birleşik hızlı kayıt, portföy detay/readiness, gizli webhook, düzenlenebilir fırsat kriterleri, son kullanılan kayıt yöntemi, iç etiket temizliği ve aktif portföy dili bu değişiklik setine alındı. Ek olarak web'de mesaj taslağı üretme ile panoya kopyalama iki ayrı kullanıcı eylemine ayrıldı, havuz metni kiracı taleplerini de kapsayacak biçimde düzeltildi ve Ayarlar ana kayıt eylemi `Profil ve uyumu kaydet` olarak kapsamını açıkça adlandırdı.

İlerideki ayrı bilgi mimarisi çalışmasına bırakılan öneriler: kişi drawer'ı ile tam kişi çalışma sayfasını tek yüzeyde birleştirmek, Ayarlar'ı başlangıç/iletişim/ofis/uyum adımlarına bölmek ve `Portföyüm` ile `Ofis havuzu`nu kalıcı sayfa içi segmentlere ayırmak. Bunlar doğruluk veya güvenlik hatası değil; mevcut işlevleri daha az gezinmeyle sunacak daha geniş tasarım düzenlemeleridir.
