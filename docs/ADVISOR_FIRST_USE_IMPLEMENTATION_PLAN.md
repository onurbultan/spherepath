# Spherepath danışman deneyimi ve implementasyon planı

Tarih: 3 Eylül 2026  
Kapsam: Ürünü daha önce hiç kullanmamış bireysel emlak danışmanı; web ve mobil aynı ürün davranışı

## Karar özeti

Spherepath'in çekirdeği doğru yönde: görüşme kaydını kalıcı hafızaya, sonraki aksiyona, fırsata, portföy eşleşmesine ve kapanışa bağlayabiliyor. Asıl risk özellik eksikliği değil; ilk kullanımda bu değer zincirinin kullanıcıya görünmemesi ve bazı kritik ekranların veri modelini iş akışının önüne koyması.

Ürünün ilk sözü şu olmalı:

> Görüşmeyi kapat, Spherepath kiminle ne zaman ne yapacağını hazırlasın; sen yalnızca doğrula.

İlk sürüm hedefi, yeni danışmanı sekiz boş modülü keşfetmeye zorlamak yerine üç dakikadan kısa sürede şu doğrulanmış sonuca götürmektir:

1. kişi kaydedildi;
2. anlamlı temas veya talep kaydedildi;
3. bugüne ya da geleceğe ait doğru sonraki adım oluştu;
4. danışman kaydın nereye gittiğini ve sırada ne olduğunu gördü.

Öncelik sırası:

1. güven ve doğruluk hatalarını düzelt;
2. ilk değere giden yolu tek akışa indir;
3. günlük işi uygulama içinde sonuçlandır;
4. bildirim, takvim ve mesajlaşma entegrasyonlarıyla unutulan işi azalt;
5. ancak bundan sonra gelişmiş rapor ve ofis ölçeğini büyüt.

## Araştırma yöntemi

Bu plan dört kanıt grubuna dayanır:

- Yerel Firebase emülatöründe tamamen yeni bir hesapla, hiçbir başlangıç verisi olmadan web ürünü ekran ekran kullanıldı.
- Doğal dilde gerçekçi bir alıcı talebi girildi; kişi oluşturma, sınıflandırma, AI çıkarımı, insan düzeltmesi, fırsat ve günlük plan sonucu izlendi.
- Web ve mobil kodu, paylaşılan domain kuralları, callable Functions, testler, analitik sözleşmeleri ve platform parite denetimi incelendi.
- Sektör beklentileri ve Türkiye yükümlülükleri güncel kaynaklarla çaprazlandı.

Araştırmanın önemli dış sinyalleri:

- [NAR 2025 Technology Survey](https://cms.nar.realtor/sites/default/files/2025-09/2025-realtors-technology-survey-report-09-18-2025.pdf): danışmanların teknoloji benimsemesindeki ilk iki amaç zaman kazanmak (%66) ve müşteri deneyimini iyileştirmek (%64); CRM, kaliteli lead üreten teknolojilerde sosyal medyadan sonra ikinci sırada (%23). Katılımcıların %59'u yeni teknolojileri kullanıyor ama hâlâ öğreniyor. Bu, onboarding'in “özelliği öğretmek” değil “işi bitirtmek” üzerine kurulması gerektiğini gösterir.
- [NAR 2024 Member Profile](https://www.nar.realtor/sites/default/files/documents/2024-nar-member-profile-highlights-07-10-2024.pdf): tipik danışmanın işinin medyan %20'si tekrar müşteriden, %21'i geçmiş müşterilerin referansından gelir. Spherepath'in ilişki hafızası ve takip vaadi ikincil değil, doğrudan gelir motorudur.
- [Follow Up Boss günlük çalışma modeli](https://help.followupboss.com/hc/en-us/articles/25372778781463-FUB-Zillow-Preferred-Playbook): başarılı günlük rutin “öncelikli listeleri sıfırla, gelen kutusunu bitir, açık görevleri tamamla” biçimindedir. Spherepath'in beş iş yaklaşımı doğru, fakat “bugün” ve “gelecek” ayrımı kesin olmalıdır.
- [Follow Up Boss agent deneyimi](https://www.followupboss.com/how-it-works/agent): yüksek hızlı emlak CRM'leri tek tık arama/mesaj, birleşik iletişim geçmişi, dinamik öncelik listeleri ve mobil bildirimleri temel akış yapar. Spherepath bugün doğru işi söylüyor fakat işi aynı yüzeyde yaptırmıyor.
- [KVKK'nın üçüncü kişiden alınan iletişim verileri duyurusu](https://www.kvkk.gov.tr/Icerik/8830/ucuncu-kisilerden-elde-edilen-kisisel-verilerin-reklam-ve-pazarlama-amacli-kullanilmasina-iliskin-kamuoyu-duyurusu): referansla gelen telefon/e-posta bilgisi doğrudan pazarlama yetkisi vermez; aydınlatma ve gerekiyorsa açık rıza ayrı yönetilmelidir.
- [KVKK aydınlatma yükümlülüğü duyurusu](https://www.kvkk.gov.tr/Icerik/6765/AYDINLATMA-YUKUMLULUGUNUN-YERINE-GETIRILMESI-HAKKINDA-KAMUOYU-DUYURUSU): veri doğrudan ilgili kişiden alınmadıysa aydınlatma makul sürede, iletişim amacıyla kullanılacaksa en geç ilk iletişim sırasında yapılmalıdır. Uyum, ayarlar sayfasındaki rapor olmaktan çıkıp ilk temasın uygulanabilir adımı olmalıdır.
- [Ticaret Bakanlığı EİDS açıklaması](https://siirt.ticaret.gov.tr/duyurular/elektronik-ilan-dogrulama-sistemi-eids-yetki-dogrulama-uygulamasi-hayata-gecirildi): ilan yetkisi, yetkilendirme sözleşmesi ve diğer zorunlu belgelerin yerine geçmez. Portföy “yayına hazır” olmadan önce ürün bu kontrolleri ayrı ve görünür izlemelidir.

## Yeni kullanıcı testinde görülen blokajlar

| No | Öncelik | Gözlem | Danışmana etkisi | Hedef davranış |
| --- | --- | --- | --- | --- |
| B1 | P0 | Kayıttan sonra kullanıcı doğrudan sekiz ana hedefi olan boş bir kabuğa düşüyor. Yönlendirilmiş başlangıç yok. | “Önce hangisini yapmalıyım?” sorusu cevapsız; ilk değer gecikiyor. | İlk oturumda tek bir iş seçtir: görüşme kaydet, mevcut portföy ekle veya kişi/referans içe aktar. |
| B2 | P0 | Akış'taki hızlı not ile üstteki “Temas kaydet” iki farklı modele götürüyor; fark ilk kez kullanan kişiye açıklanmıyor. | Görüşme notu yanlışlıkla “duyulan bilgi” akışına girip temas sayılmayabiliyor. | Tek giriş yüzeyi; önce “Bu neydi?” yerine sistem niyet önerir: görüşme, talep, portföy, hatırlatma. |
| B3 | P0 | Gerçekçi talep notu sınıflandıktan sonra kişi elle seçildi, ikinci AI analizi çalıştırıldı, alanlar düzeltildi ve ayrıca oluşturuldu. | Basit bir görüşme 6+ karara ve iki bekleme turuna dönüşüyor. | Tek analiz, tek inceleme, tek onay. Seçili kişi bağlamı baştan modele verilir. |
| B4 | P0 | “Elif Deneme Urla'da...” metninden bölge “Deneme Urla” çıktı. | Yanlış eşleşme üretir; AI'a güveni ilk kullanımda bitirir. | Bilinen kişi adını aday konumdan deterministik çıkar; alan bazlı kanıt ve güven göster; düşük güveni boş bırak. |
| B5 | P0 | İşlenen not aktif listeden kayboldu; görünür başarı özeti veya güçlü “oluşan fırsatı aç” devamı yoktu. | Kullanıcı işlemin başarıyla bitip bitmediğini anlamıyor. | Kalıcı sonuç makbuzu: “Elif için alıcı talebi + 4 Eyl arama oluşturuldu”; Aç, Geri al, Başka kayıt seçenekleri. |
| B6 | P0 | “Bugünkü tüm işler” içinde yarının işi göründü. Günlük plan tarih filtresi olmadan tüm gelecek görevlerden seçim yapıyor. | “Bugün” sözü güvenilmez; danışman gerçek gündemini ayıramıyor. | Geciken, bugün ve yaklaşan ayrı kovalar; günlük 3–5 yalnız gün sonuna kadar yapılacak işlerden oluşur. |
| B7 | P0 | Aynı kişi için “ilk anlamlı teması kaydet” ve fırsatın “ara” işi birlikte üretilebiliyor. | Sistem bir kişiyi iki kez çalıştırıyor ve bağlamı parçalıyor. | Kişi başına birleşik görev; en yüksek değerli gerekçe ve tüm bağlam tek kartta. |
| B8 | P0 | Alıcı talebi panosunda kolonlar “Değerleme” ve “Yetki konuşuluyor” olarak göründü. Detayda bağlamsal etiket fonksiyonu olsa da pano genel etiketi kullanıyor. | Alıcı süreci satıcı süreci gibi görünür; domain güveni bozulur. | Alıcı/kiracı ve satıcı/kiraya veren için bağlamsal yol ve pano. |
| B9 | P0 | Huni, alıcı talebi için “Elif ile tanıştırma veya doğrudan görüşme izni iste” önerdi; Elif zaten doğrudan kayıtlı kişiydi. | Koçluk önerisi uygulanamaz ve yanlış ilişki varsayar. | Öneri motoru kayıt kaynağını, fırsat tipini, ilişkiyi ve mevcut aksiyonu birlikte kullanır. |
| B10 | P1 | Manuel temas kaydında “sonraki adım yok” varsayılandır ve gerekçe istemez. | Ürünün ana vaadi olan takip sessizce düşebilir. | Sonraki adım öner; “yok” seçilirse neden veya takip dışı durumu açıkça onaylat. |
| B11 | P1 | Web, boş Kayıt ekranında kişiyi aynı sheet içinde oluşturuyor; mobil Kişiler sekmesine gönderiyor. Mevcut parite kontrolü yalnız callable isimlerini karşılaştırdığı için bunu yakalamıyor. | Mobilde daha fazla gezinme, daha düşük aktivasyon; iki ekran aynı ürün gibi davranmıyor. | Davranışsal platform paritesi ve iki platformda aynı inline ilk kişi akışı. |
| B12 | P1 | Ayarlar ilk günde profil, hatırlatma, santral, toplu telefon, VERBİS, WhatsApp, ses gizliliği ve veri sahibi taleplerini tek uzun sayfada gösteriyor. | Yeni danışman kritik üç ayarı bulamıyor; ileri kurulum göz korkutuyor. | “Başlangıç”, “İletişim”, “Ofis”, “Uyum” olarak aşamalı açılım; ilk gün yalnız bölge, hedef ve hatırlatma. |
| B13 | P1 | Portföy ve kapama boş ekranları bağımlılığı söylüyor ama doğrudan gerekli kaydı aynı akışta oluşturamıyor. | Kullanıcı ekranlar arasında geri gönderiliyor. | Boş durum CTA'sı ön koşulu inline oluşturur ve kaldığı yere döner. |
| B14 | P1 | Analitik event adları tanımlı ama uygulama veya Functions tarafında kullanılan bir event sink yok. | Aktivasyon, hata ve zaman kazanımı ölçülemiyor; ürün kararı sezgiye kalıyor. | Metinsiz, PII içermeyen event boru hattı ve aktivasyon hunisi. |
| B15 | P1 | Hızlı notun ilk kaydı ağ sorunu gibi “gönderilmeyi bekliyor” dedi; daha sonra yaklaşık 10 saniyede sınıflandı. Sistem nihai sonucu bildirdi ama iki işleme katmanını açıklamadı. | Kullanıcı tekrar basabilir veya kaydın kaybolduğunu sanabilir. | Durum dili: “Cihazda güvende → kaydedildi → öneri hazırlanıyor → incelemeye hazır”; her aşama idempotent. |
| B16 | P2 | Bildirim ve takvim sadece sınırlı/yerel davranışta; uygulama kapalıyken yeni lead, geciken vaat ve eşleşme için güvenilir dağıtım yok. | Takip disiplini uygulamayı açma alışkanlığına bağlı. | İzinli push + takvim yayınlama + teslim telemetrisi; sessiz saat ve kanal tercihi. |
| B17 | P0 | Santral kodu danışmanın ve müşterinin iki bacağını santralde birleştirip görüşmeyi kaydetmeye göre tasarlanmış; ayarlarda kayıt anonsu seçilmeden arama yine başlatılabiliyor. Bu, ürünün kalıcı “karşı tarafı asla kaydetme” sınırıyla çelişiyor. | Hukuki ve itibari risk; ürünün en temel güvenlik vaadi kod tarafından ihlal edilebilir. | Görüşme kaydını ve kayıt işleme hattını devre dışı bırak; yalnız webhook kaynaklı arama zamanı/süresi/sonucu ile danışmanın görüşme sonrası notunu tut. |
| B18 | P0 | Satıcı fırsatı kazanıldı, portföy oluşturuldu ve işlem kapandıktan sonra Mehmet için “Değerleme · 10 Eyl” görevi hem Akış'ta hem kişi kaydında açık kaldı. | Danışman bitmiş satış için yanlış işi yapar; günlük plan operasyonel gerçekliğini kaybeder. | Kazanma, kaybetme, satış ve kapama komutları ilişkili açık aksiyonları aynı transaction'da kapatmalı veya yeniden hesaplamalı. |
| B19 | P0 | Kimlik doğrulaması `pending_verification` olan veri erişim talebinde “JSON indir/Paylaş” eylemi etkin. Sunucu export endpoint'i de onaylı talep kimliği istemeden yalnız kişi yetkisini kontrol ediyor. | Kimlik doğrulama süreci arayüz ve API üzerinden baypas edilebilir; ekrandaki uyum sözü teknik davranışla uyuşmaz. | Export komutu `approved/completed` erişim talebiyle contact bağını sunucuda doğrulasın; iç operasyon export'u gerekiyorsa ayrı yetki ve açık amaçla tasarlansın. |
| B20 | P1 | Tek bir satıcı görüşmesinden sonra temas ayrıca kaydedildi, fırsat ayrıca oluşturuldu ve kazanıma kadar üç ara aşamada aynı “sonraki adım + tarih” kararı tekrar istendi. | Güvenli bir kayıt zinciri, günlük kullanımda veri giriş işine dönüşüyor. | Temas sonucundan fırsat taslağı ve önerilen aşama üret; geçerli mevcut aksiyonu koru, yalnız değişiyorsa kullanıcıya sor. |
| B21 | P1 | Yetki kazanıldıktan sonra portföy bilgileri tamamlandı; kayıt yine “Hazırlanıyor” kaldı ve ayrı bir durum diyaloğundan “Aktif” yapılabildi. Belge/EİDS/medya readiness kontrolü yoktu. | “Aktif” ticari durum mu ilan hazır olma mı belirsiz; zorunlu hazırlıklar atlanabilir. | Ticari durum ile yayın readiness'ini ayır; aktifleşmeyi bloklayan eksikleri tek checklist'te göster. |
| B22 | P1 | Kapama akışı Sunum → Gezi → Teklif → Sözleşme → Kapandı yolunu gösteriyor fakat gezi ve sözleşme aşamalarında tarih, kanıt, taraf onayı veya sıradaki iş yok; saniyeler içinde geçirilebiliyor. | Pano ilerler ama danışmanın gerçekten yapacağı iş ve kapanış riski görünmez. | Her aşamada minimum iş kanıtı ve sonraki aksiyon; kapamada bedel/komisyon yanında tapu, teslim ve tahsilat checklist'i. |
| B23 | P1 | Referans formunda “Elif Deneme” başlığı altında seçilen “Mehmet Kaya”nın Elif'in getirdiği kişi mi yoksa Elif'i getiren kaynak mı olduğu açık değil. | Referans yönü ters kaydedilebilir; ilişki koçluğu yanlış kişiye gider. | Cümle biçimli yön: “Elif, Mehmet'i önerdi” / “Elif'i Mehmet önerdi”; kaydetmeden önce iki taraflı özet. |
| B24 | P1 | Alıcı hafızasında aynı 12 milyon TL hem “üst sınır” hem “en az” olarak iki ayrı chip'te gösterildi. | Bütçe tek sayı iken yapay bir aralık oluşur; eşleşme gerekçesi kafa karıştırır. | Tek fiyat ifadesini `max` olarak yorumla veya “yaklaşık bütçe” diye göster; `min=max` aralığını iki chip'e bölme. |
| B25 | P2 | Satılan portföy tabloda görünmeye devam ederken yan menü rozeti `Portföy 0` oldu; rozet yalnız aktif envanteri sayıyor fakat etiket bunu söylemiyor. | Kullanıcı kaydın kaybolduğunu sanabilir. | Rozeti kaldır veya “Aktif 0” diye açık adlandır; arşiv/satıldı görünümünü ayrı filtrele. |
| B26 | P0 | Silinen bir Auth hesabının mobilde kalan oturumu “Çalışma alanı açılamadı” ekranına düştü. “Oturumu kapat” çağrısı `[auth/no-current-user]` hatasını yakalamadı; kullanıcı ancak uygulama yeniden yüklenince giriş ekranına dönebildi. | Hesabı kapatılan veya token'ı bozulan danışman uygulamada kilitlenebilir. | Sign-out idempotent olsun; `no-current-user` başarı kabul edilsin, session/query cache temizlenip giriş ekranına deterministik dönülsün. |
| B27 | P0 | Aynı eşleşme web'de `%76`, mobilde `%7600` gösterildi. Mobil `match.score` zaten 0–100 iken tekrar 100 ile çarpıyor. | Karar desteğinin sayısal güvenilirliği bozuluyor; platformlar aynı gerçeği farklı gösteriyor. | Puan ölçeğini shared branded type/formatter ile tekleştir; web/mobil golden test aynı çıktıyı zorunlu kılsın. |
| B28 | P1 | Mobil eşleşme CTA'sı ilk adımda “Mesajı gönder” diyor, gerçekte yalnız taslak hazırlıyor; sonraki adım “Paylaş” sistem paylaşım sayfasını açıyor. | Danışman ilk dokunuşun müşteriye mesaj göndereceğini sanıp çekinebilir; dış aktivite durum dili belirsizleşir. | İlk CTA “Mesaj taslağı”, ikinci “Paylaşım sayfasını aç”; gönderim hiçbir zaman share sheet açılmasıyla tamamlandı sayılmasın. |

## Baştan sona danışman yolculuğu sonucu

Yerel emülatörde sentetik iki kişiyle şu zincir fiilen tamamlandı:

```text
ilk kişi → doğal dilde alıcı talebi → AI inceleme → alıcı fırsatı
→ satıcı teması → aydınlatma kaydı → satıcı fırsatı
→ görüşüldü → randevu → değerleme → yetki → portföy
→ aktif ilan → alıcı sunum taslağı → işlem → gezi → teklif
→ sözleşme → kapama → satıldı
→ WhatsApp metninden ofis havuzu portföyü → açıklanabilir eşleşme
→ ekip daveti oluştur/iptal → veri sahibi erişim talebi
```

İyi çalışan noktalar da doğrulandı: AI ofis havuzu metninden danışman telefonunu güvenli özete taşımadı, eşleşmede `%76` puanın gerekçelerini gösterdi, sunum taslağını dış uygulamaya kopyalamayı “gönderildi” saymadı, işlem kapanınca portföyü atomik olarak `Satıldı` yaptı ve ekip daveti tek kullanımlık/iptal edilebilir çalıştı.

Danışman açısından toplam deneyim üç ayrı ürüne bölünüyor: ilişki ve not alma, portföy kazanma, satış kapama. Veri zinciri bunları bağlıyor ama iş akışı aynı görüşme bilgisini ve “sonraki adım” kararını yeniden istemeye devam ediyor. Hedef, domain kayıtlarını silmek değil; tek gerçek olayın arka planda ilgili kayıtları önermesi ve danışmanın tek bir birleşik sonucu doğrulamasıdır.

## Korunacak güçlü taraflar

- İnsan onayı olmadan AI çıktısının gerçek kişi/fırsat kaydına dönüşmemesi.
- Karşı tarafın kaydedilmemesi; sesin yalnız danışmanın görüşme sonrası özeti olması.
- Ham/maskelenmemiş dökümün kalıcı tutulmaması.
- İdempotent komutlar ve güvenilir sunucu geçişleri.
- Açıklanabilir portföy eşleştirmesi.
- Kişi hafızası, fırsat, portföy ve kapanışın tek domain zincirinde olması.
- Web ve mobilde ortak domain/copy/analytics sözleşmeleri.
- Kullanıcı tarafından doğrulanmamış dış arama veya mesajın “tamamlandı” sayılmaması.

Bu plan hız uğruna bu güvenlik sınırlarından hiçbirini gevşetmez. Hız, daha az doğrulama değil; doğru anda tek doğrulama demektir.

## Hedef kullanıcı deneyimi

### 1. İlk üç dakika

Yeni hesap açıldığında normal Akış yerine bir aktivasyon kartı görünür:

1. “Bugün neyle başlayalım?”
   - Görüşme bitti, notumu anlatacağım.
   - Elimde bir portföy var.
   - Kişilerimi ekleyeceğim.
2. Seçilen iş tek akışta tamamlanır. Kişi yoksa aynı formda kişi yaratılır; başka sayfaya gönderilmez.
3. Sistem oluşan kayıtları açıkça özetler.
4. Akış, yalnız gerçek ilk işi ve onun nedenini gösterir.

Profil ayarı aktivasyonu bloklamaz. Bölge, aylık portföy hedefi ve hatırlatma saati ilk başarılı kayıttan sonra “işini kişiselleştir” adımı olarak sunulur. Santral, WhatsApp, VERBİS ve veri sahibi talepleri onboarding'e girmez.

### 2. Görüşme sonrası tek kayıt

Hedef akış:

```text
Kişiyi seç/oluştur → 5–90 sn anlat veya yaz → sistem tek kez çıkarır
→ değişen alanları kanıtlarıyla incele → “Kaydet ve sıradaki işi planla”
→ sonuç makbuzu
```

İnceleme ekranı ham domain alanlarını değil, dört karar grubunu gösterir:

- Kim: kişi ve kayıt kaynağı.
- Ne oldu: kısa sonuç ve güvenli hafıza.
- İş fırsatı: alıcı/kiracı talebi veya satıcı/kiraya veren portföy adayı.
- Sırada: aksiyon, gün ve saat.

AI her alan için `sourceSpan`, `confidence` ve `normalization` üretir. Kullanıcı tarafından değiştirilen alanlar kalite metriği olur; metnin kendisi analitiğe gönderilmez.

### 3. Günlük çalışma döngüsü

Akış üç bölümdür:

- **Şimdi:** cevapsız gelen arama, gecikmiş söz, bugün yapılacak randevu/takip.
- **Bugünün odağı:** en fazla 3–5 farklı kişi; neden seçildiği görünür.
- **Yaklaşan:** yarın ve sonrası; bugünün tamamlama oranına girmez.

Her görev kartı kullanıcıyı başka bir modüle atmak yerine işi aynı yerde sonuçlandırır:

- Ara / Mesaj taslağı / Randevu aç.
- Sonucu 1–2 cümleyle kapat.
- Tamamla / Ertele / Ulaşamadım / İletişim istemiyor.
- Gerekirse fırsat aşaması ve sonraki adım aynı sheet içinde güncellenir.

### 4. Fırsat yolları

Teknik depolama ortak kalabilir, ancak kullanıcı iki ayrı iş yolunu görür:

| Portföy kazanma | Müşteri talebi |
| --- | --- |
| Yeni aday | Yeni talep |
| Görüşüldü | Görüşüldü |
| Değerleme randevusu | İhtiyaç görüşmesi |
| Değerleme tamamlandı | Talep netleşti |
| Yetki konuşuluyor | Hizmet ve çalışma şekli onaylandı |
| Yetki alındı | Aktif müşteri |

Karma pano yerine önce “Portföy adayları / Müşteri talepleri” segmenti seçilir. Böylece kolon etiketi tek anlam taşır.

### 5. Portföyü yayına hazırlama

Portföy durumu ile ilan hazırlığı ayrılır:

- ticari durum: hazırlanıyor, aktif, rezerve, sonuçlandı;
- hazırlık kontrolü: mülk bilgisi, fiyat, yetkilendirme sözleşmesi, EİDS ilan izni, medya, aydınlatma/işleme dayanağı;
- dış yayın: henüz entegre değil / taslak / gönderildi / doğrulandı / hata.

EİDS izni diğer sözleşmelerin yerine geçmiş gibi gösterilmez. Dış provider doğrulaması olmayan adım “doğrulandı” olamaz.

## Uygulama planı

### Uygulama durumu — 4 Eylül 2026

İlk güvenilir pilot çekirdeği bu çalışma kapsamında uygulandı. Aşağıdaki işaretler “tam plan bitti” değil, bugün çalışan ürün yüzeyini gösterir:

- **Tamamlandı:** SP-000, SP-002, SP-003 ve SP-007. Arama kaydı kaldırıldı, export onaya bağlandı, günlük işler tarih/kişi bazında düzeltildi, fırsat yolları ayrıldı ve mobil güvenilirlik/parite açıkları kapandı.
- **Pilot kapsamı tamamlandı:** SP-005. Fırsat, portföy ve kapama terminal durumları ilişkili yinelenmiş açık işleri güvenli tenant/owner kontrolleriyle temizliyor.
- **Kısmi:** SP-004 ve SP-006. Bilinen kişi adı konumdan çıkarılıyor, tek fiyat doğru yorumlanıyor ve aşama geçişinde mevcut aksiyon korunuyor; alan bazlı `sourceSpan/confidence` ile birleşik başarı/geri alma hâlâ sıradaki dilimde.
- **Kısmi:** SP-101, SP-102 ve SP-201. Sıfır durumda işe dayalı üç başlangıç seçeneği, web/mobil inline kişi oluşturma, cevapsız arama işi ve görev sonuçlandırma mevcut; versioned activation state ve tek transaction'lı birleşik capture orchestrator henüz yok.
- **Kısmi:** SP-401. Fiyatsız portföy gerçek sahibine bağlı günlük iş üretir, web/mobilde fiyat tamamlanabilir ve fiyat olmadan portföy aktifleşemez. Belge, EİDS ve medya readiness adımları sonraki dilimdedir.
- **Planlandı, dış bağımlılıklı:** SP-001, SP-301, SP-302, SP-303, SP-402 ve SP-403. Telemetri sağlayıcısı, push sertifikaları, Google/Outlook OAuth ve mesaj sağlayıcısı seçimi/kimlik bilgileri olmadan üretim entegrasyonu açılmadı.

### Faz -1 — Güvenlik durdurucuları (yayın öncesi, 1–3 iş günü)

#### SP-000: Arama kaydını kaldır ve export doğrulamasını sunucuda zorunlu kıl

Değişiklikler:

- `startContactCall` sağlayıcı komutundan görüşme kaydı/anons bağımlılığını kaldır; çağrı webhook'undan yalnız doğrulanmış metadata (`startedAt`, `endedAt`, `duration`, `outcome`) kabul et.
- `processCallRecording`, kayıt indirme ve transcript üretme yollarını devre dışı bırak; Storage ve Firestore için sıfır kayıt denetimi ekle.
- Mevcut üretimde kayıt bulunuyorsa kapsamı salt okunur envanterle belirle; onaylı ve audit edilen silme migrasyonu ayrı yürüt. Testte üretim Storage bucket'ı boş bulundu.
- `getContactDataExport` girişine `requestId` ekle; talebin aynı `contactId`, ofis ve sahip için, türü `access`, durumu `approved` veya `completed` olduğunu sunucuda doğrula.
- Web ve mobilde export eylemini yalnız doğrulanmış talepte göster; ham `pending_verification` yerine Türkçe durum etiketi kullan.

Kabul:

- Hiçbir arama yolu karşı tarafın sesini veya transcript'ini üretmez/saklamaz.
- Kayıt/anons yapılandırması olmasa da güvenli metadata akışı test edilir; recording alanları şemadan çıkarılır.
- Bekleyen, reddedilen veya başka kişiye ait talep kimliğiyle export alınamaz.
- Export denemeleri PII içermeyen audit event üretir.

### Faz 0 — Ölçüm ve veri doğruluğu (3–5 iş günü)

#### SP-001: Gizlilik güvenli ürün telemetrisi

Değişiklikler:

- `packages/shared/src/analytics/events.ts` olay sözleşmesini payload şemalarıyla genişlet.
- PII taşımayan `trackProductEvent` platform adaptörünü web ve mobilde ayrı uygula.
- Event sink kararı ver; metin, kişi adı, telefon, adres, transcript ve serbest not gönderme.
- İlk huni: `account_ready → first_intent_selected → first_contact_created → first_capture_reviewed → first_value_achieved`.
- API süresi için var olan `onRequestComplete` sinyalini endpoint, süre, deneme ve hata kategorisiyle bağla; UID yerine döndürülemez workspace pseudonym kullan.

Kabul:

- Event schema testi PII anahtarlarını reddeder.
- Web ve mobil aynı event adlarını ve zorunlu alanları üretir.
- Metin alanları event sink'e hiçbir yoldan ulaşamaz.

#### SP-002: Günlük planın tarih ve kişi tutarlılığı

Değişiklikler:

- `packages/shared/src/today/build-overview.ts` içinde İstanbul gün sınırıyla `overdue`, `today`, `upcoming` kovaları üret.
- `packages/shared/src/daily-plan/*` yalnız geciken ve gün sonuna kadar vadesi gelen işleri günlük plana alsın.
- Aynı kişide kişi ve fırsat görevini `mergeContactTasks` saf kuralıyla birleştir; fırsat aksiyonu varsa genel “ilk temas” kartında bağlam olarak göster.
- `dailyPlans` belgelerine `schemaVersion` ve `candidateFingerprint` ekle; yanlış/eski plan güvenle yenilensin.
- Web ve mobil Akış'ta “Yaklaşan” ayrı gösterilsin.

Kabul:

- Yarın 10:00 görevi bugün tamamlanacaklar arasında görünmez.
- Aynı kişi günlük listede bir kez görünür.
- Saat dilimi ve yaz/kış sınır testleri vardır.
- Gün içindeki tamamlanmış iş kaybolmaz; yanlış aday ise listeden çıkar.

#### SP-003: Bağlamsal fırsat yolu

Değişiklikler:

- `packages/shared/src/opportunities` altında `opportunityPath(type)` ve `allowedTransitionsFor(type, stage)` saf kurallarını ekle.
- Web panosu ve mobil kartlar aynı bağlamsal etiket kaynağını kullansın.
- Functions geçiş doğrulaması fırsat tipini de okuyup type-aware kuralı uygulasın.
- Huni öneri üretimi `opportunity.type`, `sourceContactId/referralId`, doğrudan kişi ve mevcut next action'ı dikkate alsın.

Kabul:

- Alıcı/kiracı panosunda “Değerleme” veya “Yetki konuşuluyor” görünmez.
- Doğrudan kayıtlı alıcıya “tanıştırma iste” önerilmez.
- Her dört fırsat tipi için geçiş ve copy testleri vardır.

#### SP-004: Çıkarım doğruluğu ve alan kanıtı

Değişiklikler:

- `analyzeInboxItem` ve voice extraction girişine seçilen kişi adı/kimliği ile bilinen bölgeleri ayrı context olarak ver.
- Bilinen kişi token'larını konum adayından çıkaran deterministik normalizasyon ekle.
- `InboxItemAnalysis` ve voice draft'a alan bazında `confidence`, `sourceSpan`, `normalizedBy` ekle.
- Düşük güvenli alanı dolu ve doğru gibi göstermek yerine boş/uyarı durumuna getir.
- Kullanıcı düzeltme oranını yalnız alan adı ve değişti/değişmedi olarak ölç.

Kabul:

- “Elif Deneme Urla'da...” testinde konum `Urla` olur, `Deneme Urla` olmaz.
- Aynı cümlede satılan ve aranan iki mülk birbirine karışmaz.
- Kaynak metinde olmayan fiyat, bölge veya özellik üretilmez.

#### SP-005: Yaşam döngüsü ve açık iş uzlaştırması

Değişiklikler:

- Fırsat `won/lost`, portföy `sold/withdrawn` ve işlem `closed/lost` komutlarında ilişkili açık aksiyonları aynı sunucu transaction'ında kapat veya yeni bağlama dönüştür.
- `reconcileOpenWork(entityEvent)` saf kuralı hangi kişi/fırsat/listing görevlerinin kapanacağını ve hangilerinin korunacağını döndürsün.
- Değişiklik günlük plan `candidateFingerprint` değerini geçersiz kılsın; bugünün sabit planında kapanmış işi tutmasın.
- Alıcıyla işlem kapandığında ilgili alıcı talebini kullanıcıya “kapat / aktif tut” önerisiyle uzlaştır.

Kabul:

- Satılmış portföyün sahibinde eski değerleme/yetki işi kalmaz.
- Kaybedilmiş fırsat outreach görevi üretmez.
- Aynı event'in tekrarı ikinci kez görev kapatmaz veya audit çoğaltmaz.

#### SP-006: Aşama geçişlerinde tekrarlanan veri girişini azalt

Değişiklikler:

- Temas sonucu, fırsat türü ve mevcut aşamaya göre önerilen geçiş + aksiyon + tarih paketi üret.
- Geçerli gelecek aksiyonu bir sonraki aşamada varsayılan olarak koru; kullanıcı yalnız gerçekten değiştirecekse alanları açsın.
- Fırsat oluşturma önerisini temas başarı makbuzuna koy; kişi, temas ve fırsat arasında tekrar seçim yaptırma.
- Aşama geçişine “ne değişti?” özeti ve tek geri alma noktası ekle.

Kabul:

- Standart satıcı yolu boyunca aynı kişi yeniden seçilmez.
- Değişmeyen next action yeniden girilmez.
- Her geçiş yine kullanıcı onayı ve idempotent sunucu komutuyla yapılır.

#### SP-007: Mobil güvenilirlik ve görünür parite

Değişiklikler:

- `match.score` ölçeğini shared schema ve `formatMatchScore` ile tanımla; platformların kendi yüzde hesabını kaldır.
- Mobil `signOut` fonksiyonunu idempotent yap; Auth'ta kullanıcı kalmamışsa session state ve kalıcı React Query cache'ini yine temizle.
- Mobil eşleşme CTA metnini gerçek duruma göre `Mesaj taslağı → Paylaşım sayfasını aç → kullanıcı onayı/webhook` olarak değiştir.
- Parite manifestine sayı/currency formatter çıktıları, dış eylem durum dili ve auth recovery senaryosu ekle.

Kabul:

- Aynı eşleşme iki platformda `%76` görünür.
- Sunucuda silinen kullanıcı mobilde tek dokunuşla güvenli biçimde giriş ekranına döner.
- Share sheet'in açılması sunumu veya mesajı `sent` yapmaz.

### Faz 1 — İlk değere tek akış (1 sprint)

#### SP-101: Aktivasyon durumu ve işe dayalı onboarding

Değişiklikler:

- `users` belgesine geriye uyumlu `activation` map'i ekle: `version`, `selectedIntent`, `firstValueAt`, `dismissedAt`.
- `getActivationOverview` query'si yalnız gerekli sayaçları döndürsün; client Firestore erişimi açılmasın.
- Web ve mobilde aynı üç başlangıç niyeti ve aynı tamamlanma koşulları kullanılsın.
- Tam ekran ürün turu yapma; gerçek kayıt oluştururken bağlamsal yardım göster.

Kabul:

- Yeni hesap 30 saniye içinde ilk eylemi başlatabilir.
- Onboarding atlanabilir ve daha sonra geri açılabilir.
- Aktivasyon mevcut kullanıcıların normal Akış'ını bozmaz.

#### SP-102: Birleşik capture orchestrator

Değişiklikler:

- Hızlı not ve temas kaydının arkasında ortak `CaptureDraft` modeli oluştur: `intent`, `contactCandidate`, `safeText/audioRef`, `analysis`, `proposedActions`.
- Bir kez analiz et; review'de kişi oluşturma/bağlama, interaction, memory, opportunity ve next action tek sunucu transaction'ında onaylansın.
- Mevcut `confirmVoiceNote` güvenlik davranışını genelleştir; işlem komutu idempotent kalsın.
- Web'deki inline kişi oluşturmayı mobilde de uygula.
- Otomatik kişi eşleştirme yalnız normalize telefon veya yüksek kesinlikli benzersiz ad eşleşmesinde aday sunsun; kullanıcı onayı olmadan bağlamasın.

Kabul:

- Kişi yokken kullanıcı başka sekmeye gitmeden kişi + temas + sonraki adım oluşturur.
- Not başına en fazla bir AI çıkarım çağrısı vardır.
- Review'den sonra tek ana submit vardır.
- Çift tıklama veya offline replay yinelenen kişi/fırsat üretmez.

#### SP-103: Sonuç makbuzu ve geri alma

Değişiklikler:

- Başarı durumunu oluşan entity'lerle döndür: contact, interaction, opportunity, task.
- Akış kartında işlenmiş not izi ve doğrudan entity linkleri görünür olsun.
- Geri alma yalnız güvenli entity'lerde ve sonraki değişiklik yoksa çalışsın; mevcut `undoInboxApplication` kapsamı interaction/opportunity için tasarlanarak genişletilsin.

Kabul:

- Kullanıcı kaydın nereye gittiğini arama yapmadan görür.
- Geri alma domain bütünlüğünü ve audit trail'i korur.

### Faz 2 — Günlük işi uygulama içinde bitirme (1 sprint)

#### SP-201: Görev eylem sheet'i

Değişiklikler:

- Akış kartından kişi özeti, son temas, fırsat, talep ve önerilen cümle tek sheet'te açılır.
- Arama/mesaj niyeti başlatılır; provider/webhook yoksa kullanıcı sonucu açıkça doğrular.
- Sonuç, fırsat aşaması ve yeni next action tek komutta kaydedilir.
- “Ulaşamadım” hızlı sonucu yeniden deneme kuralı üretir; “İletişim istemiyor” mevcut kalıcı engeli uygular.

Kabul:

- Tipik görev başka sayfaya gitmeden kapanır.
- Dış aktivite webhook veya kullanıcı onayı olmadan tamamlanmış sayılmaz.
- Opt-out tüm ilişkili açık outreach aksiyonlarını kaldırır.

#### SP-202: Akıllı iş listeleri

Hazır segmentler:

- Yeni ve henüz aranmadı.
- Bugün söz verilenler.
- Gecikenler.
- Cevapsız gelen aramalar.
- Açık fırsat, sonraki adım yok.
- 30/60/90 gündür temas edilmeyen geçmiş müşteri ve referans kaynakları.
- Satıcı güncellemesi bekleyen aktif portföyler.

Kabul:

- Segmentler saf paylaşılan kurallardan türetilir.
- Her segment “neden burada?” açıklaması verir.
- Kullanıcı tanımlı görünümler P2'ye bırakılır; P1'de sekiz yeni filtre sistemi kurulmaz.

#### SP-203: Uyumun tam iş anına taşınması

Değişiklikler:

- Referans/üçüncü kişi kaynağında ilk iletişim kartına aydınlatma görevi ekle.
- Aydınlatma, işleme dayanağı, pazarlama onayı ve İYS durumunu ayrı tut.
- Kanal bazlı uygunluk kontrolü arama/mesaj CTA'sından hemen önce çalışsın.
- Ayarlar sayfasını başlangıç, iletişim entegrasyonları, ofis ve uyum olarak böl.

Kabul:

- Referans kişiye pazarlama CTA'sı gerekli uygunluk durumu olmadan sessizce aktif olmaz.
- Aydınlatma tamamlandı diye pazarlama onayı verilmiş sayılmaz.
- Hukuki metin sürümü ve yöntem audit edilebilir.

### Faz 3 — Hatırlatma ve dış sistem köprüleri (1–2 sprint)

#### SP-301: Güvenilir bildirim teslimi

- Browser/device token kaydı, iptal ve çoklu cihaz yönetimi.
- Bildirim tercihleri: geciken vaat, yeni lead, cevapsız arama, yeni eşleşme; sessiz saat.
- FCM/APNs/web push delivery worker ve teslim hata telemetrisi.
- Bildirim içeriğinde kişisel veri minimizasyonu; kilit ekranda ad/adres tercihi.

#### SP-302: Takvim yayınlama

- Google/Outlook OAuth bağlantısı.
- İlk sürüm tek yönlü: Spherepath randevu/takibini takvime yayınlar.
- Event ID, idempotency, timezone ve iptal eşlemesi.
- İki yönlü conflict çözümü ayrı sürüm olur.

#### SP-303: Provider mesaj köprüsü

- Tek onaylı sağlayıcıyla başla; birden çok kanal soyutlaması kurarak gecikme yaratma.
- Şablon, izin, provider message ID, delivery/read/reply webhook, retry ve opt-out senkronizasyonu.
- Kişisel WhatsApp aktivitesi kullanıcı onayı olmadan teslim edilmiş sayılmaz.

### Faz 4 — Portföy, ilan hazırlığı ve kapanış (1 sprint)

#### SP-401: Portföy readiness modeli

- `ListingReadiness` saf kuralı ve eksik adımlar.
- EİDS ilan izni, yetkilendirme sözleşmesi ve diğer belgeler ayrı alanlar.
- Bugün planına yalnız gerçekten bloklayan eksik adım girer.
- Belge saklama ve e-imza entegrasyonu seçilene kadar yalnız durum/referans tutulur; hassas belge yükleme aceleye getirilmez.

#### SP-402: Sunum ve eşleşmeden sonraki iş

- Eşleşmeyi “mesaj taslağı → kullanıcı onayı → gönderildi/doğrulandı → yanıt → gösterim” yoluna bağla.
- Yakın eşleşmede hangi kriterin esnetildiğini açıkça göster.
- Alıcı talebi kapandığında ilgili sunum/işlem durumu açık kalmasın.

#### SP-403: Kapanış checklist'i

- Teklif, sözleşme, tapu/teslim, komisyon ve kapanış için minimal checklist.
- Muhasebe/e-imza yoksa varmış gibi davranma; dış referans ve kullanıcı doğrulaması kullan.

#### SP-404: Referans yönü ve müşteri hafızası sunumu

- Referans kaydını özne-fiil-nesne cümlesiyle doğrulat; kaynak ve getirilen kişi rollerini ters kayda karşı test et.
- Tek sayı bütçeyi yaklaşık/azami olarak açıkça temsil et; `min=max` durumunu iki çelişkili chip olarak gösterme.
- Bütçe, oda/salon ve mülk türü eksiklerini eşleşme öncesi tek bir “talebi netleştir” görevi olarak öner.

## Teknik değişiklik haritası

| Alan | Başlıca dosya/katman | Değişiklik |
| --- | --- | --- |
| Arama güvenliği | `functions/src/calls`, web/mobile call resources, Storage | Karşı taraf kaydını kaldır; yalnız doğrulanmış arama metadata'sı |
| Veri sahibi export | `packages/shared/src/privacy`, `functions/src/privacy`, web/mobile settings | Talep kimliği + durum + kişi bağı sunucu zorunluluğu |
| Aktivasyon | `packages/shared/src/settings`, `functions/src/auth`, web/mobile auth + Akış | Versioned activation state ve derived overview |
| Capture | `packages/shared/src/voice`, `packages/shared/src/inbox`, `functions/src/voice`, `functions/src/inbox` | Ortak draft/proposed-action ve tek confirm transaction |
| Günlük plan | `packages/shared/src/today`, `packages/shared/src/daily-plan`, `functions/src/today` | Due bucket, kişi bazlı merge, schema version |
| Fırsat | `packages/shared/src/opportunities`, `functions/src/opportunities`, web/mobile opportunity views | Type-aware path ve bağlamsal board |
| Yaşam döngüsü | yeni shared reconciliation rule, fırsat/listing/deal Functions | Terminal event sonrası açık görev uzlaştırması |
| Huni | `packages/shared/src/funnel`, `functions/src/funnel` | Kaynak/type/action-aware koçluk |
| Uyum | contact privacy modeli, contact Functions, web/mobile görev sheet'i | Just-in-time notice/consent/IYS gate |
| Bildirim | yeni shared contract, Functions worker, web SW, mobile notification resource | Token, preference, delivery lifecycle |
| Mobil güvenilirlik | mobile session, matching view, shared formatters | Idempotent logout, doğru yüzde, dürüst paylaşım CTA'sı |
| Parite | `scripts/check-platform-parity.mjs`, E2E ve mobil interaction testleri | Callable eşitliğine ek davranış matrisi |

Mimari kurallar değişmez:

- view → React Query → resource → shared API client → callable Function;
- client tarafında Firestore domain erişimi yok;
- mutasyonlar stabil command ID taşır;
- trusted transition sunucudadır;
- her yeni capability aynı değişiklikte web ve mobilde vardır veya gerekçeli parite istisnasıdır;
- saf karar kuralları unit test ile gelir.

## Ölçüm planı

### Ana metrik

Haftalık olarak en az 5 doğrulanmış ilişki aksiyonu ve en az 1 nitelikli talep veya portföy adayı üreten aktif danışman oranı.

### Aktivasyon

- Hesap hazır → ilk eylem başlatma medyanı: `< 30 sn`.
- Hesap hazır → ilk değer medyanı: `< 3 dk`.
- İlk değeri aynı oturumda tamamlama: `≥ %70` pilot hedefi.
- İlk değer tanımı: kişi + interaction/talep + geçerli next action; yalnız kişi eklemek aktivasyon değildir.

### Hız ve güven

- Görüşme sonrası review'e gelme p50: `< 15 sn`, p95: `< 45 sn`.
- Review'de değiştirilen kritik alan oranı; konum/fiyat için ayrı.
- Yanlış kişi otomatik bağlama: `0` tolerans.
- Yinelenen komutla çoğalan entity: `0`.
- Bugünün listesinde gelecek tarihli görev: `0`.
- Kişi başına günlük yinelenen görev: `0`.

### İş sonucu

- Zamanında tamamlanan next action oranı.
- Sonraki adımı olmayan açık fırsat oranı.
- Temas → nitelikli talep/portföy adayı dönüşümü.
- Talep → sunum, portföy adayı → yetki dönüşümü.
- 30/60/90 günlük yeniden temas ve referans üretimi.

### Guardrail

- Opt-out sonrası outreach girişimi: `0`.
- Karşı tarafın ses kaydı veya transcript'i: `0`.
- Doğrulanmış erişim talebi olmadan kişi export'u: `0`.
- Aydınlatma/onay alanlarının birbirine dönüşmesi: `0`.
- Ham transcript veya serbest metnin analitiğe gitmesi: `0`.
- Kullanıcı onayı/webhook olmadan dış aktivitenin tamamlandı sayılması: `0`.

## Test stratejisi

### Paylaşılan unit testler

- İstanbul gün sınırı, geciken/bugün/yaklaşan görev ayrımı.
- Aynı kişi görev merge ve deterministic sıralama.
- Eşleşme puanı formatter'ının `76 → %76` üretmesi; 0–1 ve 0–100 ölçeklerini karıştıran girdiyi schema'nın reddetmesi.
- Dört fırsat tipi için label ve transition.
- Kişi adını konumdan çıkarma; çok bölgeli ve yabancı isimli örnekler.
- Aydınlatma, consent, IYS kanal gate matrisi.
- Listing readiness ve kapanış checklist.

### Callable + emulator testleri

- Arama komutunun hiçbir recording/transcript alanı veya Storage nesnesi üretmemesi.
- Veri export'unun bekleyen, reddedilen, farklı kişi/ofis ve eksik request ID durumlarını reddetmesi.
- Silinmiş Auth kullanıcısında mobil logout'un hata vermeden cache temizleyip signed-out durumuna geçmesi.
- Tek capture confirm komutunun contact/interaction/memory/opportunity/stage event/next action atomikliği.
- Aynı command ID tekrarında tek sonuç.
- Yanlış tenant/owner erişimi.
- Offline replay ve yarıda kalan AI işinin retry davranışı.
- Geri alma sırasında sonraki düzenleme varsa güvenli ret.
- Fırsat kazanma, portföy satışı ve işlem kapamada eski açık görevlerin uzlaştırılması.

### Web ve mobil kabul senaryosu

Her release'te aynı senaryo iki platformda çalışır:

1. Sıfır verili yeni kullanıcı hesabı.
2. Kayıt ekranından ayrılmadan “Elif Deneme” kişisini oluştur.
3. “Elif Deneme Urla'da 12 milyon TL bütçeyle 3+1 bahçeli ev arıyor, yarın 10:00'da ara” notunu gir.
4. Sistem kişiyi aday gösterir, bölgeyi `Urla`, bütçeyi `12.000.000 TRY`, oda/salonu `3+1` çıkarır.
5. Kullanıcı tek review ve tek submit ile interaction + buyer requirement + next action oluşturur.
6. Başarı makbuzundan kişi ve fırsat açılır.
7. Bugün 3 Eylül ise 4 Eylül görevi “Yaklaşan” bölümündedir; bugünün tamamlama sayısına girmez.
8. Alıcı panosunda yalnız müşteri-talebi dili görünür.
9. Opt-out verildiğinde açık outreach aksiyonları kalkar.

`scripts/check-platform-parity.mjs` ayrıca şu davranış manifestini karşılaştırmalıdır:

- ekran bazında primary intent;
- empty-state CTA;
- aynı akışta kişi oluşturma;
- capture modları;
- task resolution seçenekleri;
- fırsat type/path kapsamı;
- ayar/uyum capability'leri.

### Kullanılabilirlik pilotu

Kod tamamlandıktan sonra 5 bireysel danışman ve 2 broker ile moderasyonsuz görev testi:

- İlk görüşmeyi kaydet.
- Yarın aranacak kişiyi bul.
- Yeni bir alıcı talebi oluştur.
- Mevcut portföyü ekle ve yayına engel eksikleri gör.
- İletişim istemeyen kişiyi güvenle kapat.

Başarı koşulu: katılımcıların en az 6/7'si ilk üç görevi yardım almadan tamamlar; kritik yanlış kayıt oluşmaz; ilk değer medyanı üç dakikanın altındadır.

## Teslim sırası ve yaklaşık takvim

| Sprint | Teslim | Bağımlılık |
| --- | --- | --- |
| Acil | Karşı taraf kaydını kaldırma, doğrulanmış export gate | Yok; diğer yayınların ön koşulu |
| 0 | Telemetri, günlük plan + yaşam döngüsü düzeltmesi, type-aware fırsat, extractor guardrail | Acil güvenlik paketi |
| 1 | İşe dayalı onboarding, birleşik capture, sonuç makbuzu, web/mobile inline kişi | Sprint 0 event ve doğruluk kuralları |
| 2 | Görev action sheet, akıllı listeler, just-in-time uyum | Birleşik capture ve daily task modeli |
| 3 | Push ve tek yönlü takvim | İzin tercihleri ve event telemetry |
| 4 | Provider mesaj köprüsü, listing readiness, eşleşme→sunum akışı | Uyum gate, webhook/idempotency altyapısı |

İki haftalık sprintlerle ilk güvenilir pilot çekirdeği Sprint 0–2 sonunda, dış sistemli operasyon Sprint 3–4 sonunda hedeflenebilir. Acil güvenlik paketi sprint beklemez. Takvim ekip kapasitesine göre değişir; sıralama değişmemelidir.

## Veri temizliği ve doğrulama kaydı

3 Eylül 2026'da üretim projesindeki açıkça test amaçlı veriler temizlendi:

- Auth: dört test/QA hesabı silindi; yalnız ana kullanıcı kaldı.
- Firestore: 2 test kişi, 2 test inbox notu, 4 test command receipt ve 1 test günlük plan silindi.
- Korunan ayar/durum kayıtları: `users 1`, `offices 1`, `callIntegrations 1`, `whatsappGroupIntegrations 1`.
- Son kontrolde `dailyPlans 1` vardı; ana kullanıcının normal çalışma sırasında üretilmiş boş planı olduğu için korundu (`taskIds 0`, `taskSnapshots 0`, `suppressedContactIds 0`).
- Production Storage bucket boş.

4 Eylül 2026 son doğrulamasında üretimde yalnız `users`, `offices`, `callIntegrations` ve `whatsappGroupIntegrations` koleksiyonları kaldı. Yeniden oluşmuş iki boş `dailyPlans` önbelleği de silindi; ayarlar ve ana kullanıcı korundu. Üretim Storage yeniden kontrol edildi ve boştu.

Deneyim testi için üretilen Elif/Mehmet kayıtları yalnız yerel Firebase emülatöründe oluşturuldu; üretime taşınmadı. Ekip daveti yerelde oluşturulup iptal edildi.

Teknik doğrulama:

- `pnpm check` geçti: typecheck, toplam 236 unit test, lint ve mevcut platform parite kontrolü başarılı.
- Parite kontrolü 70 callable Function'ın iki platformda da çağrıldığını doğruladı; `%76/%7600`, inline kişi oluşturma ve CTA dili gibi davranış farklarını yakalamadığı ayrıca kanıtlandı.
- iOS development build başarıyla derlendi ve yerel Firebase emülatörüne bağlı gerçek Simulator oturumunda Akış, Kayıt, Huni, Portföy, Kişiler ve Ayarlar ekranları incelendi.

4 Eylül uygulama turunda `pnpm typecheck`, `pnpm lint`, 244 unit test ve 3 callable/emülatör dikey test yeniden geçti. Davranışsal kontroller eklenen parite kapısı 70 callable Function'ın iki platformda da erişilebilir olduğunu doğruladı. Emülatör akışı ayrıca fiyatsız portföyün aktifleşemediğini, fiyat güncellemesinden sonra aktifleştiğini ve bekleyen veri erişim talebinin export alamadığını doğruladı.

## Şimdilik yapılmayacaklar

- Genel amaçlı CRM özelleştirme platformu.
- Serbest biçimli workflow builder.
- AI'ın kullanıcı onayı olmadan kişi, fırsat veya stage üretmesi.
- Kişilik, duygu, güven, eğitim veya hassas özellik çıkarımı.
- Aktif görüşmede karşı tarafı kaydetme.
- Sağlayıcı doğrulaması olmayan mesaj/ilan durumunu tamamlandı gösterme.
- İlk değer doğrulanmadan gelişmiş dashboard ve yeni rapor çeşitleri.

## Başlama kararı

İlk implementasyon paketi SP-000 olmalıdır. Ardından SP-001–SP-007 birlikte ele alınmalıdır. Bunun nedeni yalnız teknik borç değildir: bugün onboarding'i hızlandırmak mevcut güvenlik çelişkisini, yanlış günlük planı, kapanmış işlerin eski görevlerini, yanlış fırsat dilini, mobil parite sorunlarını ve hatalı alan çıkarımını daha fazla kullanıcıya daha hızlı taşır. Önce sistemin yaptığı ve söylediği şey güvenli, doğru ve izlenebilir olmalı; sonra ilk kullanım tek akışa indirilmelidir.
