# Spherepath — kalan sürtünmeler ve franchise tasarım değerlendirmesi

Tarih: 6 Eylül 2026. Hedef: Coldwell Banker ve RE/MAX benzeri büyük emlak ağları. Bu değerlendirme ürünün mevcut ekranlarına, ortak tasarım tokenlarına, önceki danışman denemesine ve bu turdaki tarayıcı tekrarına dayanır. Bir marka onayı veya bu firmaların satın alma kriterleri hakkında araştırma değildir.

## Karar

Mevcut arayüz amatör görünmüyor. Sakin renkler, tutarlı kontroller, güçlü açık/koyu tema temeli ve emlak işine özgü akışlar profesyonel bir başlangıç oluşturuyor. Görsel karakteri daha çok butik bir danışmanlık ürününe yakın. Çok sayıda ofisin ve danışmanın kullanacağı bir ana ürün için **Kurumsal** tasarım yönünü öneriyorum; **Operasyon** daha yoğun kullanım tercihi, **Seçkin** ise prestijli portföy ofislerine sunulabilecek alternatif olabilir.

Bu bir tasarım yargısıdır. Görsel olgunluk, tüm bir franchise ağına satış için teknik ve operasyonel hazırlığın doğrulandığı anlamına gelmez. Tek franchise ofisine satış ile ağ merkezinden tüm ofislere yayılım farklı kapsamlardır.

## Bu turda uygulanan düzeltmeler

| Sürtünme | Önce | Şimdi |
| --- | --- | --- |
| Bütçe aralığı | `18–35 milyon TL` ifadesinin alt sınırı kaybolabiliyordu. | İki sınır da korunuyor. Milyon, bin, Türkçe ondalık ve noktalı binlik yazımlar destekleniyor. |
| Metrekare alt sınırı | Ayrı cümledeki `En az 180 m²` kayboluyor; “en az” bütçeyi de etkileyebiliyordu. | Niteleyici yalnız bitişiğindeki ölçüye uygulanıyor. Alan alt/üst sınırı ve alan aralığı ayrı çıkarılıyor. |
| Çıkarımı kontrol etme | Onay ekranında yalnız azami bütçe görünüyordu. | Web ve mobilde asgari/azami bütçe ile minimum/maksimum m² birlikte görülebiliyor ve düzenlenebiliyor. Bir bütçe sınırını temizlemek diğerini silmiyor. |
| İlk fırsat görünümü | Yalnız alıcı/kiracı işi bulunan hesap boş portföy sekmesiyle açılıyordu. | Mevcut aktif taleplerin sekmesi açılıyor. Danışmanın açık sekme seçimi ve fırsata doğrudan bağlantı davranışı korunuyor. |
| Açık tema durum etiketleri | Amber ve gri metinlerin kendi zeminleri üzerindeki kontrastı normal metin eşiğinin altındaydı. | Ortak tokenlar koyulaştırıldı; web ve mobil çıktıları birlikte üretildi. |

Bütçe ve alan çıkarımı, asıl tercih ile ilgili mülk durumu içinde aynı değerleri tutuyor. Satılacak mülkün bilgileri sonraki alım talebine aktarılmıyor. Sadece telefon numarası bulunan bir nottan bütçe üretilmiyor.

## Danışman gibi tekrar kullanım

Yerel Firebase Emulator ortamında sentetik Ece Demir kaydıyla denedim:

1. Akışa `Urla İskele'de bahçeli villa arıyor. Bütçesi 18–35 milyon TL. En az 180 m² olmalı. Yarın 11:00'de aramamı istedi.` notunu girdim.
2. Düzenleme ekranında asgari bütçe `18000000`, azami bütçe `35000000`, minimum m² `180`, maksimum m² boş olarak göründü.
3. Kişi, görüşme ve alıcı talebi tek işlemde oluşturuldu.
4. Fırsatlar ekranını açtığımda müşteri talepleri doğrudan göründü; sekme aramama gerek kalmadı.
5. Kaydedilen fırsat detayında `₺18.000.000 – ₺35.000.000`, `En az 180 m²`, `Urla İskele`, `Bahçeli` ve `7 Eyl 2026 11:00` takip saati doğrulandı.

Dış mesaj veya arama gönderilmedi. Kayıtlar sentetiktir. Mobil tarayıcı akışı otomatik olarak doğrulandı; bu turda native iOS/Android cihaz üzerinde yeni görsel kabul testi yapılmadı.

## Temanın güçlü yanları

- Karla, Zilla Slab ve ölçülü mavi/yeşil tonları ürüne belirgin bir kimlik veriyor.
- Açık ve koyu görünüm ortak semantik tokenlarla yönetiliyor. Form katmanı iki platformda aynı tasarım niyetini taşıyor.
- Hızlı not, sonraki adım, talep, portföy ve kapama kavramları günlük emlak işini görünür kılıyor.
- Açık temada geniş beyaz yüzeyler ve ölçülü çizgiler düzenli bir görünüm oluşturuyor. Koyu tema ikinci bir bağımsız palet gibi ele alınmış.

## Kurumsal görünüm için değiştireceğim noktalar

| Öncelik | Gözlem | Öneri |
| --- | --- | --- |
| 1 | Başlıklar serif, pek çok küçük etiket mono ve büyük harf. Bazı rol/aşama/zaman etiketleri 9,5–10,5 px. | Ana çalışma ekranlarında tek sade sans ailesi; gövde yaklaşık 14–16 px, açıklamalar 12–13 px. Mono yalnız gerçekten hizalanması gereken kod/zaman gibi sınırlı yerlerde. Büyük harf kullanımını azalt. |
| 1 | Kurum/ofis/kişisel çalışma kapsamı görsel olarak sınırlı; çalışma alanı adı kişisel adın uzantısı gibi. | Ofis adı, kullanıcı rolü ve görüntülenen kapsamı üst alanda açık göster. Ağ düzeyinde ürüne geçilecekse ofis ve danışman kapsamını yetki modeliyle birlikte tasarla. |
| 1 | Aynı ağırlıkta çok sayıda kart ve eylem, işin önceliğini zayıflatabiliyor. | Sayfada tek belirgin ana işlem; sıralı takip listesi; seçilen kişi için kısa bağlam. Geciken iş renk yanında metinle de ayrışsın. |
| 2 | Renkler Spherepath kimliğine bağlı; farklı firmalara uyarlama arayüzü henüz bu örneğin parçası değil. | Ofis markası için kontrollü logo/vurgu alanı. Marka rengini başarı/uyarı anlamından ayrı tut. Kontrast sınırını koruyan önceden doğrulanmış paletler kullan. |
| 2 | Kart, liste, pano ve küçük etiketler birlikte yoğunlaşabiliyor. | Rahat ve sıkı yoğunluk tercihleri. Sıkı görünüm, yazıyı küçültmek yerine boşlukları azaltmalı. |
| 2 | Koyu tema güçlü, ama tek kurumsal sunum biçimi olarak ağır kalabilir. | Açık temayı da birinci sınıf seçenek olarak koru; sistem/kullanıcı tercihini izle. |

Tipografi ve marka sistemi önerileri bu turda üretim arayüzüne bütünüyle uygulanmadı; karşılaştırılabilir tasarım örneklerinde gösterildi. Üretim değişiklikleri işlevsel düzeltmeler ve iki erişilebilirlik rengiyle sınırlıdır.

## Ölçülen kontrast

Normal metin için WCAG 2.2 AA eşiği 4,5:1, büyük metin için 3:1'dir. [W3C, Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)

| Açık tema eşleşmesi | Önce | Sonra |
| --- | ---: | ---: |
| `warm` / `warmBg` | 3,67:1 | 4,88:1 |
| `cool` / `coolBg` | 3,62:1 | 4,88:1 |

Diğer örnekler: açık temada ana metin/kart 16,02:1, ikincil metin/kart 6,63:1; koyu temada üçüncül metin/kart 4,98:1, üçüncül metin/yükseltilmiş yüzey 4,54:1. Bunlar token çiftlerinin hesaplarıdır; tüm arayüz için WCAG uygunluk sertifikası veya eksiksiz erişilebilirlik denetimi değildir.

Marka değişkenlerini semantik tokenların üzerinde ayrı bir katman olarak yönetme önerisi, IBM Carbon'un token rolleri ve tema değerlerini ayıran yaklaşımıyla uyumludur. [IBM Carbon, Themes](https://carbondesignsystem.com/elements/themes/overview/)

## Hazırlanan tasarım yönleri

- **A — Kurumsal:** lacivert gezinme alanı, nötr çalışma yüzeyi, sans tipografi, seçili işin yanında kişi bağlamı. Büyük ağlar için önerilen ana yön.
- **B — Operasyon:** yatay gezinme, daha sıkı satırlar, daha geniş çalışma alanı. Yoğun masaüstü kullanımı için alternatif.
- **C — Seçkin:** sıcak nötr yüzeyler, sakin yeşil gezinme, yalnız önemli başlıklarda serif. Prestijli portföy ofisleri için alternatif.

Üçünde aynı örnek işler kullanılıyor. Tasarım yönü, ofis rengi ve satır yoğunluğu değiştirilebiliyor. Kişi seçimi, not açma/kapatma, örnek not kaydı ve menü filtreleri yerel olarak çalışıyor. Bu örnekler gerçek çalışma alanına veri yazmıyor; menüler tam uygulama sayfalarının yerine geçmiyor.

## Doğrulama

- `pnpm check`: TypeScript, birim testleri, lint ve platform paritesi geçti.
- Birim testleri: **291** (220 ortak, 67 sunucu, 1 web, 3 mobil).
- Güncellenmiş kabul testleri: **4/4**; masaüstü Chrome ve Pixel 7 boyutunda Chrome.
- Kabul senaryoları bütçe/m² çıkarımı, tek akışta oluşturma, alanların kalıcılığı, boş sekme seçimine saygı, alıcı/satıcı ayrımı, gönderim teyidi ve terminal kapama davranışını kapsıyor.
- `pnpm design:check`: geçti; ortak tokenlar ve iki platformun üretilmiş dosyaları tutarlı.
- Web üretim derlemesi: geçti. 15 sayfa/statik yol çıktısı oluşturuldu.
- Görsel örnekler açık/koyu görünümde ve geniş/dar boyutlarda kontrol edildi; ayrıntı seçimi ve örnek not kaydı tarayıcıda çalıştı.

Değişiklikler yerel çalışma ağacındadır. Üretime dağıtım veya gerçek marka entegrasyonu yapılmadı.
