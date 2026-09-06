# İlk kez kullanan emlak danışmanı — canlı uçtan uca kullanım raporu

Tarih: 5 Eylül 2026

Ortam: Spherepath web, `http://localhost:5050`

Yöntem: Yeni hesapla, yalnız sentetik veriler kullanılarak gerçek kullanıcı arayüzünden uçtan uca kullanım
Kapsam: Kayıt, kişi, temas, fırsat, görev, portföy, izin, sunum, işlem, kapama, ofis havuzu, arama, dışa aktarma, ekip, ayarlar, uyum ve huni

## Yönetici özeti

Spherepath'in temel ticari zinciri çalışıyor. Yeni kişi ve görüşme kaydedilebildi; talep fırsata, satıcı görüşmesi portföye, portföy sunuma ve işlem kapamaya dönüştürüldü. Kapanan işlem huniye doğru bedel ve komisyonla yansıdı. Özellikle günlük iş listesi, portföy hazırlık kontrolü, izin kapısı ve global arama bir danışmanın günlük hızını artırabilecek kadar iyi.

İlk kullanım deneyimi ise henüz “hiç düşünmeden ilerle” seviyesinde değil. En doğal başlangıç yolu olan hızlı nota yeni bir müşteri yazıldığında sistem talebi doğru çıkarsa bile kişi henüz mevcut olmadığı için kullanıcı akışın ortasında duruyor. Ayrıca eşleştirme motoru Urla talebi ile Çeşme portföyünü `%82` uyumlu gösteriyor; bu sonuç danışmanın sisteme güvenini doğrudan zedeler. Fırsat düzeltme ve satıcı kriter ekranlarında da yanlış varsayılanlar veri bütünlüğü riski oluşturuyor.

Genel ilk kullanım puanı: **7/10**. Mevcut kişide günlük operasyon hızlı; sıfırdan yeni müşteri ve talep açma yolunda sürtünme yüksek.

## Zorluk özeti

Ölçek: 1 = sezgisel, 3 = düşünmeyi/geri dönmeyi gerektiriyor, 5 = akış tıkanıyor veya yanlış kayıt riski var.

| Danışmanın amacı | Sonuç | Zorluk | Ana sürtünme |
| --- | --- | ---: | --- |
| Yeni hesap açmak | Tamamlandı | 2/5 | Rol seçimi ve ilk kurulum yok; davet kodu boş bırakılınca kullanıcı sessizce broker oldu |
| Hızlı nottan yeni alıcı ve talep oluşturmak | Tamamlandı, dolambaçlı | 5/5 | Talep kişiyle bağlanamadı; kişi ayrı oluşturulup forma geri dönüldü |
| Yeni satıcı ve sonraki işi oluşturmak | Tamamlandı | 2/5 | Form anlaşılır; mevcut takip devralma metni iyi |
| Görüşme kaydetmek | Tamamlandı | 3/5 | Klavyede Enter, tarih tamamlanmadan tüm formu gönderdi |
| Talep/fırsat yönetmek | Tamamlandı | 3/5 | Aynı kişide mükerrer fırsat uyarısı yok; düzeltme formu yanlış aşamayla açılıyor |
| Portföy hazırlamak ve aktifleştirmek | Tamamlandı | 2/5 | 7 maddelik hazırlık listesi başarılı; kısa süreli sayaç gecikmesi var |
| İzin alıp sunum hazırlamak | Tamamlandı | 3/5 | Uyum kapısı iyi; “Gönderildi” eylemi yanlış teyide fazla açık |
| İşlemi tekliften kapamaya götürmek | Tamamlandı | 3/5 | Kapanmış işlemde bile sonraki aksiyon alanı kalıyor |
| Günlük işleri tamamlamak | Tamamlandı | 1/5 | En güçlü akış; fakat kişi başlığındaki sonraki adım güncellenmedi |
| Ofis havuzundan eşleştirmek | Teknik olarak tamamlandı | 5/5 güven riski | Urla–Çeşme uyumsuzluğu yüksek skor aldı ve açıklanmadı |
| Arama, filtreleme ve dışa aktarma | Tamamlandı | 1/5 | Hızlı; indirme sonrası başarı geri bildirimi yok |
| Ayarlar ve veri sahibi talebi | Tamamlandı | 2/5 | Gelecek tarih “Son yanıt” diye gösterildi; kimlik doğrulama ve tamamlama tek tık |
| Huni okumak | Tamamlandı | 2/5 | Yavaş yükleme ve `%200` dönüşümün açıklanmaması |

## Kritik bulgular

### P0 — Coğrafi uyumsuz eşleşme danışmana yüksek güvenle öneriliyor

Ayşe Kara'nın talebi `Urla İskele`, villa, 18–35 milyon TL, 3+1, en az 180 m² ve bahçeli olarak kaydedildi. Ofis havuzuna eklenen `Çeşme Alaçatı` villası bu taleple `%82` eşleşti. Açıklama işlem tipi, mülk tipi ve bütçeyi olumlu saydı; bölge uyumsuzluğunu hiç göstermedi.

Etkisi:

- Danışman yanlış müşteriyi arar ve zaman kaybeder.
- Yüksek yüzde, açıklanabilir eşleşme modeline olan güveni hızla tüketir.
- Oluşturulan müşteri mesajı da yanlış bölgeyi sorgulamadan önerir.

Öneri ve kabul kriteri:

- Bölgeyi kullanıcı “olmazsa olmaz” olarak işaretleyebilmeli.
- Kesin bölge talebinde farklı ilçe varsayılan olarak tam eşleşme üretmemeli.
- Yakın eşleşme gösterilecekse `Bölge eşleşmiyor: Urla İskele ↔ Çeşme Alaçatı` maddesi ve skor cezası görünmeli.
- Skorun hangi alanlardan oluştuğu kullanıcıya açılabilmeli.

### P0 — Hızlı not, yeni kişi içeren talepte akış ortasında tıkanıyor

Notta Ayşe'nin adı, telefonu, bölgesi, bütçesi, mülk tipi ve takip zamanı birlikte yazıldı. Sistem talep alanlarını başarılı biçimde çıkardı. Ancak `İlgili kişi` alanında eşleşme olmadığı ve aynı pencerede kişi oluşturma seçeneği bulunmadığı için `Talep oluştur` kapalı kaldı. Kullanıcı pencereyi kapatıp kişi kaydını tamamladıktan sonra talebe geri dönmek zorunda kaldı.

Ek veri kaybı: Notta bulunan telefon kişi formuna otomatik taşınmadı.

Öneri ve kabul kriteri:

- Sonuç ekranında `Ayşe Kara'yı oluştur ve talebe bağla` eylemi bulunmalı.
- Tek onay kişi + temas + talep/fırsat + sonraki işi atomik oluşturmalı.
- Ayrıştırılan ad, telefon, rol, kaynak ve takip tarihi düzenlenebilir biçimde korunmalı.
- Geri dönme veya aynı bilgiyi ikinci kez yazma gerekmemeli.

### P1 — Fırsat düzeltme formu yanlış aşamayla açılıyor

Ayşe'nin açık fırsatı `İhtiyaç görüşmesi` aşamasındayken `Aşamayı düzelt` formundaki `Doğru aşama` varsayılanı `Yeni talep` oldu. Kullanıcı nedeni yazıp diğer alanları kontrol etmeden kaydederse fırsat istemeden geriye taşınabilir.

Öneri: Form mevcut aşamayla açılmalı, farklı aşama kullanıcı tarafından bilinçli seçilmeli ve değişiklik özeti kayıttan önce gösterilmeli.

### P1 — Satılık portföy fırsatında alıcı kriter formu açılıyor

Satıcıya ait `Satılık portföy` fırsatında `Kriterleri düzenle` eylemi; bölge, mülk tipi, bütçe, oda ve minimum alan isteyen alıcı talep formunu açtı. Fırsat türü ile düzenlenen veri modeli uyuşmuyor.

Öneri: Portföy fırsatında mülk/adres, beklenen fiyat, yetki durumu, satma nedeni ve zamanlama alanları; alıcı/kiracı fırsatında arama kriterleri gösterilmeli.

### P1 — Tamamlanan görev kişi başlığında açık kalıyor

Akış ekranında Ayşe'nin `Ara` görevi tamamlandı ve günlük ilerleme `1/1` oldu. Aynı kişinin çalışma sayfası hâlâ `Sonraki adım Ara · 5 Eyl 2026 02:00 · fırsattan` gösterdi ve `Tamamla veya ertele` eylemini açık tuttu.

Öneri: Görev sonucu mutasyonu kişi özeti, fırsat kartı, günlük akış ve navigasyon sayaçlarının ortak sorgu anahtarlarını aynı anda yenilemeli. Tamamlanan görev hiçbir yüzeyde sonraki adım sayılmamalı.

### P1 — Kapanan işlem sonraki aksiyon istiyor

`Sözleşme → Kapandı` geçişinde gerçekleşen bedel, komisyon ve kapanış notu girildi; buna rağmen formda `Sonraki aksiyon: Diğer` ve tarih kaldı. Terminal ticari durumda yeni iş zorunlu olmamalı.

Öneri: Kapanışta sonraki aksiyon bölümü varsayılan olarak kaldırılmalı. Yalnız kullanıcı açıkça `Satış sonrası takip oluştur` seçerse gösterilmeli.

## Danışmanı yavaşlatan bulgular

### P2 — İlk kurulum rolü ve bilgi mimarisi

- Kayıtta rol seçimi yok. Ofis davet kodu boş bırakılınca kullanıcı `Broker / ofis yöneticisi` oldu.
- İlk girişte kısa bir kurulum veya görev odaklı yönlendirme yok.
- Yeni kullanıcı aynı anda Akış, Huni, Temas kaydet, Aktif portföy, Kişiler, Fırsatlar, Kapama, Ofis havuzu, Ekip ve Ayarlar seçeneklerini görüyor.

Öneri: İlk üç hedefi soran kısa kurulum kullanın: `Müşteri ekle`, `Görüşme kaydet`, `Portföy ekle`. Rolü açıkça seçtirin; davet kodu yoksa bunun yeni ofis ve broker yetkisi oluşturacağını söyleyin.

### P2 — Form ve klavye davranışı

- Manuel temas formunda sonraki aksiyon seçilirken Enter tuşu, tarih düzenlenmeden tüm formu gönderdi.
- Aynı gün tarih seçildiğinde takvim kapanıyor; saat alanına ulaşmak zorlaşıyor ve geçmiş saate görev kaydedilebiliyor.
- Telefon alanı görsel olarak dolu olsa da erişilebilirlik değerinde boş göründü.
- Kişi satırı eylem menüsündeki beş buton erişilebilirlik ağacında adsızdı.
- Mülk türü gibi seçim çipleri seçili durumlarını erişilebilir biçimde bildirmiyor.

Öneri: Enter yalnız aktif seçimi onaylamalı; tüm form yalnız belirgin ana eylem veya `Cmd/Ctrl+Enter` ile gönderilmeli. Tarih ve saat aynı panelde tamamlanmadan panel kapanmamalı. Menü düğmeleri adlandırılmalı ve seçim çiplerinde `aria-pressed`/eşdeğer durum kullanılmalı.

### P2 — Tutarsız veya eksik geri bildirim

- CSV ve veri sahibi JSON indirmelerinden sonra görünür başarı mesajı çıkmadı.
- Portföy oluşturma/kapama sonrasında yan menü sayaçları kısa süre eski değeri gösterdi.
- Eşleşme ilk oluştuğunda bildirim rozeti gecikti.
- Kişiye özel görünen mesaj kopyalanınca `Kişiye özel taslak üretilemedi; standart metin kopyalandı` uyarısı çıktı.
- Hızlı not, sınıflandırma tamamlanmadan birkaç saniye farklı türde görünebildi.

### P2 — Veri ve uyum dilindeki belirsizlikler

- Veri sahibi isteğinde gelecek son tarih `Son yanıt` etiketiyle gösterildi; `Yanıt için son tarih` olmalı.
- `Kimliği doğrula ve onayla` tek tıkta isteği tamamladı. Doğrulama kanıtı, veri hazırlama ve teslim ayrı durumlar olmalı.
- Sunum ekranındaki çıplak `Gönderildi` düğmesi, gerçek dış kanal teslimi olmadan yanlış kayıt üretmeye açık. Metin `Mesajı gerçekten gönderdiysen işaretle` olmalı; mümkünse doğrulanmış webhook kullanılmalı.
- Huni `2 kişi → 4 talep` için `%200` dönüşüm gösterdi. Matematik doğru olsa bile “talep olayı / tekil kişi” tanımı açıklanmadığı için performans göstergesi olarak yanıltıcı.

### P2 — Performans

- Huni her dönem değişiminde yaklaşık 2–4,5 saniye `Huni hazırlanıyor…` gösterdi.
- Ofis havuzu mesaj çözümleme yaklaşık 5 saniye, kişiye özel mesaj taslağı yaklaşık 3–4 saniye sürdü.
- Bu beklemelerde iskelet içerik, aşamalı sonuç veya “hangi iş yapılıyor” açıklaması yok.
- Test sırasında uygulamaya ait tarayıcı konsol hatası ya da uyarısı görülmedi.

## Güçlü çalışan noktalar

- Ana ekrandaki hızlı not alanı görünür ve danışmanın doğal dilini kullanmasına izin veriyor.
- Yapay zekâ; kişi adı, alım amacı, villa, Urla İskele, bütçe, 3+1, bahçe ve takip tarihini büyük ölçüde doğru çıkardı.
- Kişi + görüşme + fırsat + görev birleşik oluşturma yolu, kişi bağlandıktan sonra çok güçlü.
- Manuel görüşme akışı `Kim / Ne oldu / Sırada ne var` mantığıyla anlaşılır.
- `Tamamlandı / Ertele / Atla / İletişim istemiyor` görev sonuçları gerçek danışman operasyonuna uygun.
- Portföyün 7 maddelik hazırlık listesi, eksikleri ve aktivasyon şartını anlaşılır gösteriyor.
- Portföy aktifleşmeden sunum ve kapama eylemlerinin kapalı olması doğru.
- Sunumdan önce aydınlatma ve kanal izni kapısı güvenli ve açıklayıcı.
- Ham WhatsApp grup mesajının saklanmayacağı ve yalnız onaylanan yapılandırılmış alanların tutulacağı açıkça belirtiliyor.
- Portföy satıldığında aktif envanter değeri ve huni komisyonu doğru güncellendi.
- Global arama; sayfa, kişi, fırsat, portföy ve hızlı eylemleri tek yerde çok hızlı buluyor.
- Kişi arama/filtreleme hızlı; CSV ve veri sahibi JSON çıktıları geçerli ve kullanılabilir.
- Tema değişimi, pano/liste görünümü, fırsat durum filtreleri ve kişi çalışma sekmeleri tutarlı çalışıyor.
- Sesli kayıtta “görüşme bitti / karşı taraf kaydedilmiyor” onayı iyi bir güvenlik sınırı.

## Önerilen ürün sırası

1. Bölge eşleşmesini sert kural/şeffaf ceza haline getir; `%82` Urla–Çeşme örneğini otomasyon testi yap.
2. Hızlı notta eksik kişiyi aynı inceleme ekranında oluştur ve tüm ayrıştırılmış veriyi koru.
3. Fırsat türüne göre ayrı kriter formları kullan; düzeltme formunu mevcut aşamayla aç.
4. Görev tamamlama sonrasında tüm ilgili yüzeyleri eşzamanlı güncelle.
5. Terminal kapamada sonraki aksiyonu kaldır; satış sonrası takibi isteğe bağlı yap.
6. İlk girişte rol/ofis kararını açıklaştır ve üç görevli kısa başlangıç sun.
7. Formların Enter davranışını, tarih-saat seçimini ve erişilebilirlik adlarını düzelt.
8. Dış gönderim, veri sahibi talebi ve dönüşüm oranı dilini denetlenebilir hale getir.
9. Asenkron işlemlerde aşamalı yükleme ve indirme/başarı geri bildirimi ekle.

## Oluşturulan sentetik test durumu

| Tür | Kayıt |
| --- | --- |
| Hesap | Deniz Yılmaz — `danisman.ux.20260905.0900@example.com` — Broker/ofis yöneticisi |
| Kişiler | Ayşe Kara (alıcı), Mehmet Demir (satıcı) |
| Ayşe talebi | Urla İskele, villa, 18–35 milyon TL, 3+1, min. 180 m², bahçeli, 3 ay |
| Portföy | Urla Kuşçular villa, 32,5 milyon TL liste; test işleminden sonra `Satıldı` |
| Sunum | Ayşe için taslak, `Kullanıcı onayladı`; gönderildi işaretlenmedi |
| İşlem | 30 milyon TL gerçekleşen bedel, 600 bin TL komisyon, `Kapandı` |
| Ofis havuzu | Çeşme Alaçatı villa, 34 milyon TL; Ayşe ile `%82` eşleşme |
| Veri sahibi isteği | Ayşe, erişim/veri kopyası, `UX-DSR-001`; tamamlandı ve JSON indirildi |
| Açık durum | Ayşe için bir açık alıcı fırsatı; Mehmet için ileri tarihli takip/portföy fırsatı |

Bu veriler test hesabında bırakıldı; hiçbir gerçek kişi veya iletişim bilgisi kullanılmadı.

## Bilinçli olarak yapılmayan işlemler

- Gerçek telefon araması başlatılmadı.
- WhatsApp veya başka dış kanaldan mesaj gönderilmedi; sunum `Gönderildi` işaretlenmedi.
- Mikrofon izni verilmedi ve ses kaydı alınmadı.
- Ekip davet kodu oluşturulmadı.
- Tarayıcı bildirim aboneliği açılmadı.
- Kayıt silme/arşivleme yapılmadı.
- Santral ve WhatsApp işletme bağlantıları gerçek hesaplarla yapılandırılmadı.
- Mobil uygulama bu turda çalıştırılmadı; rapor web deneyimini kapsıyor.

## Sonuç

Spherepath bugün deneyimli bir kullanıcı için iş görebilecek kadar bütünlüklü; özellikle mevcut müşteriyle günlük çalışma akışı güçlü. İlk kez kullanan danışmanın hızını belirleyecek üç eşik ise henüz tam çözülmemiş durumda: yeni kişiyi doğal nottan tek seferde oluşturmak, eşleşme skoruna güvenmek ve fırsat/görev durumlarının her ekranda aynı gerçeği göstermesi. Bu üç alan düzeltildiğinde ürünün ilk gün öğrenme yükü belirgin biçimde azalır.
