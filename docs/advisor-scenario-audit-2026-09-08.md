# Danışman senaryosu: bulgular ve düzeltme planı

İnceleme tarihi: 8 Eylül 2026. Canlı ortam: https://www.getspherepath.com/.

Senaryo: Anıl Emene’nin Kadıovacık’taki 620 m² arsası, 5.000.000 TL satış talebi ve sözlü yetki; Melis Şaşmaz’ın 4.500.000 TL teklifi; satıcının 4.800.000 TL karşı teklifi; 9 Eylül 2026 saat 12.00 için Melis’le randevu planlama aksiyonu.

Bu belge bir uygulama planıdır. Ürün kodu değiştirilmedi. Bu incelemede canlı kayıtlar değiştirilmedi; açılan erteleme taslağı kaydedilmeden kapatıldı. Önceki testteki randevu 9 Eylül 12.00 olarak duruyor. Çalışma ağacında önceden devam eden değişiklikler var; aşağıdaki kod referansları mevcut yerel kopyaya aittir. Canlı gözlemler ile yalnız kodda görülen riskler ayrı belirtilmiştir.

## Eşleşme özelliğinin mevcut durumu

**Özellik var, ancak alıcı talebi → kendi portföyün → teklif akışı tamamlanmış değil.**

- Canlı arayüzde üst çubukta “Eşleşme bildirimleri” var. “Tümünü gör” bağlantısı Portföy → Ofis havuzu ekranına gidiyor.
- Motor `portfolioItems` içindeki kullanılabilir ofis havuzu kayıtlarını okuyor. `listings` içindeki kendi yetkili portföylerini aday listesine katmıyor. Arsanın yayına hazırlanması tamamlanmış olsa da mevcut okuyucu onu kendiliğinden kapsamaz.
- Arama tarafında aktif alıcı işlerinden çok, kişilerin `memory.propertySituations` / `memory.propertyPreferences` bilgileri kullanılıyor. Sadece `createOpportunity` ile alıcı işi açılması arama kriterlerini oluşturmaz. Kriterleri düzenlemek veya ilgili onaylı çıkarım akışını kullanmak gerekir.
- İşlem türü, mülk türü, bölge, bütçe, oda, alan ve özellikler karşılaştırılıyor. Uyum nedenleri ve bilgi kapsamı gösteriliyor. Temel puanlama kural tabanlı; metinden bilgi çıkarımı ve mesaj taslağı ayrı yapay zekâ adımları.
- Mevcut eşikler: en az %40 bilgi kapsamı; 60 ve üzeri puan “eşleşme”, 35–59 “yakın eşleşme”. Yakın eşleşmeler bildirim üretmiyor.
- Bildirimler bir sunucu sorgusu sırasında hesaplanıp kaydediliyor. Web’deki 60 saniyelik `staleTime`, her 60 saniyede tarama yapıldığı anlamına gelmiyor; düzenli sorgulama tanımlı değil. Kriter kaydetme ve havuza ekleme sonrasında bildirim sorgusu açıkça yenilenmiyor.

**Bu senaryoda neden görünmedi?** Canlıda Portföyüm 1, Ofis havuzu 0. Dolayısıyla eşleşme motorunun aday kümesi boş. Buna ek olarak, aynı arsayı yerel puanlayıcıya aday olarak verip Melis’in kayıtlı işlem türü, arsa ve Kadıovacık kriterlerini kullandığımda sonuç `eligible: true`, puan 52, kapsam 52, çelişen kriter sayısı 0 oldu. Bütçe ve diğer kriterler bilinmediği için sonuç güçlü eşleşme eşiğine ulaşmıyor. Bu, canlıda üretilmiş bir eşleşme değildir; mevcut kuralın bağımsız hesaplama örneğidir.

Melis’in 4.500.000 TL teklifi, kendiliğinden “en yüksek bütçesi” olarak yorumlanmamalı. Belirli bir arsaya talip olması da genel arama kriterlerine dönüştürülmeden önce ayrı bir açık ilgi ilişkisi olarak saklanabilmeli.

Kaynaklar: [adaylar ve eşikler](../functions/src/matching/portfolio-api.ts), [puanlama](../packages/shared/src/matching/portfolio-match.ts), [kriter kaydı](../functions/src/opportunities/opportunity-api.ts), [bildirim arayüzü](../apps/web/src/shared/ui/TopBar.tsx).

## Canlı testte görülen sorunlar

P1: işi engeller veya yanlış yönlendirir. P2: anlaşılabilirlik, veri kalitesi ve kullanım zorluğu. P3: test işletimi.

| No | Öncelik | Gözlem ve etkisi | Düzeltme / kabul koşulu |
|---|---|---|---|
| 1 | P1 | Hazırlanıyor durumundaki arsada “İşlem başlat” kapalı. EİDS ve medya hazırlığı, gerçekleşmiş bir alıcı teklifinin içeride kaydını da engelliyor. | Dahili talep/teklif kaydı ile dışarıya yayın ve sunum koşullarını ayır. Yayına hazırlık eksikken gelen teklif kaydedilebilsin; bu işlem ilanı yayınlamasın veya doğrulama üretmesin. |
| 2 | P1 | İlk teklif ve karşı teklif için ayrı tutar/taraf/tarih geçmişi yok. Bu testte bilgiler görüşme ve geçiş notlarına yazıldı. | Aynı arsa–alıcı görüşmesinde 4,5 milyon alıcı teklifi ve 4,8 milyon satıcı karşı teklifi ayrı olaylar olarak görünsün. Son karşı teklif önceki tutarı silmesin; karşı teklif kabul veya kapanış sayılmasın. |
| 3 | P1 | Yeni alıcı işi kaydedildiği hâlde ekran “0 açık iş” gösterdi. “Müşteri talepleri” seçilince Melis bulundu. | Oluşturulan kaydın gerçek türüyle listeyi seç ve yeni işi görünür kıl. Yerel kodda kayıt için `draftType`, kayıt sonrası filtre için farklı `type` kullanılıyor. |
| 4 | P1 | İşler ve Melis’in kişi detayı 9 Eylül 12.00 aksiyonunu gösteriyor; Kişiler listesi “Sonraki adım belirlenmedi” diyor. | Kişi listesi, kişi detayı ve günlük plan aynı açık iş aksiyonu özetini kullansın. Yaklaşan adım sıralaması ve dışa aktarım da aynı veriye dayansın. |
| 5 | P1 | Satıcıyla görüşme kaydederken sonraki aksiyonun karşı tarafı olarak Melis seçilemiyor. | Görüşülen kişi ile aksiyonun hedef kişisini ayır. Anıl görüşmesi, aynı arsa/iş bağlamında Melis’e ait bir randevu aksiyonu oluşturabilsin. |
| 6 | P2 | Fırsat detayında doğrudan “Aksiyonu düzenle/ertele” yok. Kişi detayında “Tamamla veya ertele” var; ilk akışta bulunması güçtü. | Aynı düzenleme eylemini iş satırına ve iş detayına getir. Yalnız saat değiştirmek aşama olayı oluşturmamalı. |
| 7 | P1 | “Randevu yap · yarın 12.00” için Ertele açıldığında yeni aksiyon “Ara”, tarih yarın 10.00 oluyor. | Ertelemede mevcut aksiyon türü ve saat korunsun; danışman yalnız istediği kısmı değiştirsin. Varsayılan değişiklik sessizce randevuyu aramaya çevirmesin. |
| 8 | P2 | Satıcı, alıcı, arsa, teklif ve karşı teklif ayrı ekranlarda; tek işlem görünümü yok. Alıcı işinde bağlam gösterebilmek için bu testte pazarlık metni “Zamanlama”ya yazıldı. | İş detayında taraflar, ilgili mülk, fiyatlar, görüşme geçmişi ve sonraki aksiyon birlikte gösterilsin. Zamanlama alanı ihtiyaç tarihini anlatsın; pazarlık ayrı kayıt olsun. |
| 9 | P2 | Anıl’ın yetkili portföyü zaten varken yeni görüşme sonrası yeniden satılık fırsat/portföy açma öneriliyor. Alıcı görüşmesi sonrasında da “Yetkili portföy ekle” gösterildi. | Önerileri yalnız kişi rolüne göre değil, seçili iş ve mülke göre oluştur. Aynı mülkte “Mevcut işi sürdür”, farklı mülkte bilinçli “Yeni iş aç” seçenekleri sun. Çok rollü kişileri destekle. |
| 10 | P2 | Arsa formunda Oda, Zemin kat, Asansörsüz, Çatı katı gibi konuta özgü kontroller açık kalıyor. | Mülk türüne göre alan ve özellik kümesi kullan. Arsada arsa alanı; gerektiğinde ada/parsel ve imar bilgisi. Bilinmeyen alanları zorunlu veya doğrulanmış yapma. |
| 11 | P2 | Portföyde 5 milyon TL’lik kayıt varken başlık “AKTİF ENVANTER · ₺0”. Hesap aktif kayıtları topluyor, fakat hazırlanan portföyün değeri açıklanmıyor. | “Hazırlanan: 1 / 5 milyon TL; aktif: 0” gibi kapsamı açık özet göster. Portföy adedi ve aktif değer birbirine karıştırılmasın. |
| 12 | P2 | “Tümü” görünümündeki aşama şeridi satıcı terimlerini kullanıyor. “Kazanıldı” hem yetki kazanımı hem tamamlanan satış gibi anlaşılabiliyor. | Ortak görünümde nötr aşama grupları, satırda iş türüne uygun etiket; “Yetki alındı”, “Müşteri kazanıldı”, “Satış kapandı” ayrı gösterilsin. |
| 13 | P2 | Kısa sonuç içindeki tarih, fiyat ve mülk bilgisi manuel kayıttan yapılandırılmış işe otomatik taşınmıyor; tarih ayrıca gizli ayrıntı bölümünden giriliyor. | Görüşme tarihi ve ilişkilendirilen iş görünür olsun. “Yazılı notu çözümle” ve “Manuel gir” farkı açık anlatılsın. Çıkarılan değerler kullanıcıya taslak olarak sunulsun, onaysız güvenilir durum oluşturulmasın. |
| 14 | P2 | “Randevu yap” bir gelecek aksiyonu; karşı tarafın kabul ettiği randevu ile ayrımı kaydın özetinde yeterince belirgin değil. | “Randevu planla”, “Randevu teyit edildi”, “Görüşme yapıldı” durumları ayrışsın. Bu senaryonun son durumu planlama/bekleyen kabul olarak kalsın. |
| 15 | P2 | Pasif “İşlem başlat” ve boş eşleşme ekranları, neden ve sonraki adımı ilgili yerde açıklamıyor. Ofis havuzu boşluğu WhatsApp mesajı eklemeyi öneriyor; mevcut kendi portföyünün neden kapsanmadığını söylemiyor. | “Aday portföy yok”, “Kriter eksik”, “Uygun aday yok”, “Tarama başarısız” ayrı boş durumlar olsun; her birinde ilgili düzeltme bağlantısı bulunsun. |
| 16 | P3 | Ayarları koruyarak test verisini sıfırlamak için tarayıcıda toplu test sıfırlama yolu bulunamadı; önceki testte bakım erişimi gerekti. | Ayrı bir test çalışma alanı ve yalnız onun verilerini sıfırlayan akış kur. Kapsam önizlemesi, kullanıcı/ofis sınırı ve ayarların korunması doğrulansın. Üretim geneline açık bir silme düğmesi ekleme. |

## Saat alanı ve test aracına özgü zorluklar

**Doğrulanan belirti:** Tarayıcı otomasyonuyla saat alanına 12.00 girilip “Tarih ve saati uygula” seçildiğinde üst form eski saatte kalabiliyor. İlk testte 19.00 kaydedildi; klavye oklarıyla değişim olayı tetiklenince 12.00 düzeltilebildi. Bu incelemede erteleme taslağında 10.00 → 12.00 aynı yöntemle tekrar denendi; üst form 10.00 kaldı. Taslak kaydedilmedi.

**Sınır:** Bunun normal kullanıcı klavye/yapıştırma kullanımında da aynı şekilde oluştuğu henüz kanıtlanmadı. Otomasyon doldurması ile React’in zaman girdisi değişim olayı arasındaki fark bir aday neden. Bu nedenle kesin bir tüm-kullanıcı saat kaybı olarak raporlanmıyor.

**Plan:** `QuickDateField` için gerçek klavye yazımı, yapıştırma, ok tuşları ve takvim seçimiyle tarayıcı testi ekle. Görünen saat, React form değeri ve gönderilen zaman aynı olmalı. “Uygula” yalnız açılır alanı kapatıyor; ya gerçek bir taslak-uygula davranışı sağlanmalı ya da anında kaydetme davranışına uygun etiket kullanılmalı. Erişilebilirlik ağacında özel takvim yanında gizli `datetime-local` kontrolü de görünüyor; aynı alanın iki farklı odak/kontrol gibi algılanması giderilmeli. “Yarın öğlen” kısayolu eklenebilir.

Chrome’un eski sekmesini devralırken yaşanan bağlantı zaman aşımı Spherepath ürün hatası değildir. Ayarlar sekmesindeki eşzamanlı kullanıcı düzenlemesi de ürün hatası listesine alınmadı.

## Eşleşmede kod incelemesiyle bulunan ek eksikler

| No | Öncelik | Durum | Düzeltme |
|---|---|---|---|
| M1 | P1 | Kendi yetkili portföyleri eşleşme adaylarına dahil değil. Canlı senaryoyla da tutarlı. | Kendi portföyü ve ofis havuzunu sunucuda ortak aday görünümüne normalize et. Kaynak kimliğini koru, aynı mülkü iki kez göstermeme kuralı ekle. Dahili inceleme uygunluğunu yayına hazırlıktan ayır. |
| M2 | P1 | Yeni alıcı işinde kriter girişi ve sonrasında eşleşme özeti yok. Kriterler sonradan ayrı formda dolduruluyor. | Talep oluştururken temel kriterler alınabilsin veya onaylı taslaktan taşınsın. İş detayında “Bu talebe uygun portföyler” olsun; eksikler açıkça gösterilsin. |
| M3 | P2 | Bildirim sorgusu kriter/havuz mutasyonlarından sonra geçersiz kılınmıyor. Boş bildirim görünümü hata ile gerçekten sonuç olmamasını ayırmıyor. | İlgili komutlar sonrası eşleşme ve bildirim sorgularını birlikte yenile. Sorgu sırasında son tarama/hata durumunu göster; uzun süre açık oturum için kontrollü yenileme belirle. |
| M4 | P2 | Eksik bilgi düşük puan doğurup “Yakın ama tam değil / bazı kriterleri karşılamıyor” olarak sunulabiliyor; örnek hesaplamada hiç çelişki yoktu. Arsada oda kriteri de genel ağırlık toplamında. | Uyum, çelişki, bilgi eksikliği ve uygulanamaz kriterleri ayır. Arsaya oda şartı uygulama. Eksik bilgi nedeniyle elenen adayların nedeni açık olsun. Kesin ilgi ilişkisini puan eşiğine bağlama. |
| M5 | P2 | Web arayüzü güçlü eşleşmelerin ilk 3’ünü, yakınların ilk 3’ünü, havuzun ilk 12 kaydını gösteriyor. Devamını getiren kontrol yok. Sunucuda da kişi 200, havuz 500, sonuç 100/50 sınırı var. Bu hesapta ölçek testi yapılmadı. | Sayfalama ve talep/kişi filtresi ekle. “Tümünü gör” gerçekten erişilebilir tüm sonuçları sunsun. Sunucu taraması sayfalı olsun; sınır nedeniyle sessiz veri kaybı olmasın. |
| M6 | P1 | Eşleşme aktif fırsat kimliğine değil kişi hafızasına bağlı. Kriter güncellemesi aynı bağlamdaki ilk durumu değiştirebiliyor. Aynı kişinin iki alıcı talebi birbirini etkileyebilir; kapanan talep hafızada kaldığı sürece aday üretme riski var. Canlıda çoklu talep denenmedi. | Eşleşmeyi kararlı `opportunityId` / talep kimliğine bağla. Açık/kapalı durumu kontrol et. Eski kişi hafızası için açıkça tanımlanmış geriye uyumluluk yolu kullan. |
| M7 | P2 | Ofis havuzu arsası `landAreaM2`, kendi portföyü genel `areaM2` kullanıyor. | Ortak aday dönüştürücüsünde mülk türüne göre alan eşlemesini tanımla ve test et. |

Ek veri bütünlüğü notu: Eşleşme bildirimleri `recipientUid` taşıyor, ancak oluşturulan belgeye `ownerUid` yazılmıyor. Kalıcı tenant sözleşmesi ve yalnız sahiplik alanıyla çalışan bakım/silme akışlarıyla uyum için bu kayıtların sahipliği netleştirilmeli. Bu senaryonun sıfırlama anında eşleşme bildirimi yoktu.

## Uygulama sırası

### 1. Görünür veri doğruluğu ve takip düzeltmeleri

Kapsam: 3, 4, 6, 7, saat alanı doğrulaması. Önce alıcı işinin kayıttan sonra görünmesi, kişi listesi/kişi detayı/işler arasında tek sonraki adım özeti ve ertelemede aksiyonun korunması.

- İş filtrelemesini sunucunun döndürdüğü kayıt türüyle yap.
- Açık aksiyon özetini paylaşılan saf kural veya ortak sunucu okuma modeli üzerinden üret; kişi üzerindeki farklı bağımsız aksiyonu körlemesine ezme.
- Aynı görev düzenleme akışını iş satırı, kişi detayı ve günlük planda kullan.
- Saat alanındaki belirtinin normal klavye kullanımına etkisini belirle, ardından gerekli kontrol düzeltmesini yap.

**Kabul:** Melis her ilgili ekranda 9 Eylül 12.00 görünür. Yalnız saat değiştirildiğinde fırsat aşaması değişmez. Ertele açıldığında aksiyon “Randevu yap” kalır. Kayıt sonrası alıcı işi kaybolmaz.

### 2. Belirli mülke talep ve pazarlık akışı

Kapsam: 1, 2, 5, 8, 14.

- Mevcut `deal` yapısını alıcı talebi ve mülk ile bağlanan dahili görüşme için genişlet; yeni paralel CRM nesneleri üretmeden mevcut alanları değerlendir.
- Hazırlanan portföye gelen gerçek talep/teklifin içeriye kaydını sağlayan sunucu komutu oluştur. Kapalı, kaldırılmış veya başka ofise ait kayıtlar için kontroller sürsün.
- Teklif olaylarında taraf, tutar, para birimi, gerçekleşme tarihi, kaynak görüşme, önceki teklif ve yanıt durumu tutulabilsin. Aynı aşamada birden fazla teklif/karşı teklif eklenebilsin.
- Liste fiyatı, alıcı teklifi, satıcı karşı teklifi ve kabul edilen bedel ayrı gösterilsin. 4,8 milyon karşı teklif liste fiyatını otomatik değiştirmesin.
- Sonraki aksiyonun hedef kişisi, sorumlu danışmanı ve bağlı iş/mülk açık olsun.

**Kabul:** 5 milyon liste fiyatı korunur; 7 Eylül 4,5 milyon teklif ve 8 Eylül 4,8 milyon karşı teklif ayrı görünür. Anıl görüşmesinden Melis için 9 Eylül öğlen planı çıkar. Sahte EİDS, fotoğraf, teslimat, kabul veya satış kapanışı üretilmez.

### 3. Talep merkezli eşleşme

Kapsam: M1–M7.

- `listings/properties` ve `portfolioItems` kaynaklarını tek aday sözleşmesine dönüştür; kaynak, yetki, hazırlık ve erişim kapsamı korunsun.
- Talep oluşturma/kriter düzenleme sonrası ilgili eşleşmeleri ve bildirimleri yenile.
- İş detayında kriterlere göre adaylar göster; kişinin birden fazla talebini birbirine karıştırma.
- Açık mülk ilgisini “Danışman bu taleple ilişkilendirdi / alıcı bu mülke talip” olarak göster. Bu ilişki otomatik uyum puanından bağımsız olsun.
- Güçlü eşleşme, alternatif, bilgi eksik ve uygunsuz kategorilerini gerekçeleriyle göster. Teklif tutarını bütçeye dönüştürme.
- Sayfalama, kayıt değişiklikleri, kapanan işler, profil itirazı ve ofis erişimi için doğrulama ekle.

**Kabul:** Kendi portföyündeki arsa Melis’in işinden bulunabilir; havuza ikinci kez elle kopyalamak gerekmez. Dördüncü eşleşme ve on üçüncü havuz kaydı erişilebilir. Eksik bütçe “bütçe uyumsuz” diye gösterilmez.

### 4. Formlar, metinler ve görünüm

Kapsam: 9–15 ve geçmiş tarihler.

- Mülk türüne uygun alanlar; görüşme tarihi ve bağlı iş görünür.
- İş satırında uzun pazarlık notunu başlık yerine kısa mülk özeti + teklif/karşı teklif + aksiyon olarak göster; ayrıntıyı açılır detayda tut.
- Kazanılan yetki ile satış kapanışını ve hazırlanan değer ile aktif değeri ayır.
- Başarı ekranını kaydedilen sunucu kaydından üret; mevcut işi devam ettirme bağlantısını öne çıkar.
- Tarih/saatte mutlak tarih, yerel saat ve gerektiğinde saat dilimi net olsun. Geçmiş satış yetkisi için `acquiredAt` ile `createdAt` ayrılabilsin; mevcut import akışı yetkiyi kayıt zamanına tarihlendiriyor.
- Dar ekranda takvim/alt eylemler kesilmesin; klavye odağı, alan etiketleri ve hata mesajları doğrulansın.

**Kabul:** Danışman “kimle, hangi arsa, son fiyatlar, şimdi ne yapacağım” bilgilerini tek bakışta okuyabilir. Telefon veya belge bilinmiyorsa bilgi uydurulmaz; gerekli adımda açıkça istenir.

### 5. Tekrarlanabilir senaryo testi

- Ayrı test çalışma alanında ayarları koruyan sıfırlama ve senaryo hazırlığı.
- Saf domain kuralları `@spherepath/shared` altında; sunucu komutları idempotent command ID ile. Görünümler React Query → feature resource → shared API → callable Function zincirini kullanır.
- Web ve mobil aynı kabiliyeti, Türkçe metinleri ve analytics olaylarını aynı değişiklikte alır. Bileşenler platformlar arasında paylaşılmaz; kontrol katmanı ve semantik token sözleşmesi korunur.
- Yeni koleksiyon/alan eklenirse her tenant kaydında `officeId` ve `ownerUid`; kurallar değişirse üretim öncesi Emulator testleri.
- Kontroller: ilgili saf kural testleri, callable entegrasyonları, web tarayıcı senaryosu, mobil karşılığı, TypeScript ve `pnpm parity:check`.

## Nihai kabul senaryosu

1. Ayarlar aynı kalır; yalnız test iş verileri sıfırlanır.
2. 5 Eylül tarihli Anıl görüşmesi ve aynı güne ait sözlü yetki kaydı oluşturulur.
3. 620 m² arsa 5 milyon TL ile kaydedilir; yayın hazırlığı eksikleri iç teklif kaydını engellemez.
4. 7 Eylül tarihli Melis görüşmesinden, ilgili arsaya bağlı 4,5 milyon TL teklif oluşturulur.
5. 8 Eylül Anıl görüşmesinden 4,8 milyon TL karşı teklif eklenir; ilk teklif ve liste fiyatı korunur.
6. Melis için 9 Eylül 12.00 planı oluşur; alıcının kabul etmediği randevu teyit edilmiş sayılmaz.
7. Kişiler, kişi detayı ve İşler tutarlı aksiyonu gösterir. Günlük plan ilgili gün geldiğinde aynı işi tek kez gösterir.
8. Aynı komut tekrar gönderilirse mükerrer teklif, kişi veya aksiyon oluşmaz.
9. Karşı teklif, otomatik bütçe güncellemesi, kabul, ilan yayını veya kapanış üretmez.
10. Aynı senaryo mobilde eşdeğer sonuç verir.

## Doğrulama ve kod haritası

Bu incelemede mevcut `portfolio-match`, `match-score`, `closing` ve `opportunity-draft` testleri çalıştırıldı: **4 dosya / 37 test geçti**. Canlı mobil, tüm ekran boyutları ve büyük veri eşleşmesi çalıştırılmadı. Testlerin geçmesi yukarıdaki yeni kabul koşullarının karşılandığı anlamına gelmez.

| Alan | Başlıca dosyalar |
|---|---|
| Teklif yaşam döngüsü ve kayıt engeli | [closing-api.ts](../functions/src/closing/closing-api.ts), [closing.ts](../packages/shared/src/closing/closing.ts), [ClosingSection.tsx](../apps/web/src/features/closing/views/ClosingSection.tsx) |
| Eşleşme kaynakları, kapsam ve bildirimler | [portfolio-api.ts](../functions/src/matching/portfolio-api.ts), [portfolio-match.ts](../packages/shared/src/matching/portfolio-match.ts), [OfficePortfolioSection.tsx](../apps/web/src/features/matching/views/OfficePortfolioSection.tsx), [TopBar.tsx](../apps/web/src/shared/ui/TopBar.tsx) |
| Alıcı işi ve kayıt sonrası filtre | [OpportunitiesView.tsx](../apps/web/src/features/opportunities/views/OpportunitiesView.tsx), [opportunity-api.ts](../functions/src/opportunities/opportunity-api.ts) |
| Sonraki adım ve erteleme | [ContactsView.tsx](../apps/web/src/features/contacts/views/ContactsView.tsx), [ContactWorkspaceView.tsx](../apps/web/src/features/contacts/views/ContactWorkspaceView.tsx), [TaskResolutionSheet.tsx](../apps/web/src/features/today/components/TaskResolutionSheet.tsx) |
| Tarih/saat ve görüşme | [QuickDateField.tsx](../apps/web/src/shared/ui/QuickDateField.tsx), [CaptureView.tsx](../apps/web/src/features/interactions/views/CaptureView.tsx) |
| Portföy formu ve varsayılan doğrulamalar | [ListingsView.tsx](../apps/web/src/features/listings/views/ListingsView.tsx), [listing-draft.ts](../packages/shared/src/listings/listing-draft.ts) |

Varsayılan doğrulama notu: sözlü yetkide sözleşme dayanağı kendiliğinden “Muaf / gerekmiyor”, işleme dayanağı kendiliğinden “Doğrulandı” başlıyor. Arayüz bu değerlerin hangi kullanıcı beyanına dayandığını açıklamalı; plan bunları hukuki doğrulama gibi sunmayı veya eksik kanıtları otomatik üretmeyi önermiyor.
