# İlk kez kullanan emlak danışmanı — bağımsız UI/UX incelemesi

Tarih: 4 Eylül 2026  
İnceleyen: Ayrı UI ajanı  
Kapsam: Spherepath web uygulamasının ilk danışman deneyimi  
Yöntem: Kaynak kodu, ekran yapısı ve erişilebilirlik semantiği üzerinden salt okunur inceleme

## İnceleme sınırı

Ayrı ajanın tarayıcı oturumunda yetkili kullanıcı oturumu bulunmadığı için giriş gerektiren ekranlarda canlı veri değiştirilmedi. İnceleme kaynak kodu ve erişilebilirlik yapısı üzerinden yapıldı; hassas değer okunmadı veya kaydedilmedi. Ana ajan daha sonra görünür Chrome oturumunda kritik ekranları test etti.

## Yönetici özeti

İlk kullanımda en büyük sürtünme tek bir gerçek olayın kişi, görüşme, fırsat ve takip olarak farklı ekranlara parçalanmasıydı. İkinci önemli alan portföy satırının ayrıntı göstermeden durum geçişine yönelmesi, üçüncüsü ise Ayarlar ekranında gizli adreslerin ve kayıt kapsamının yeterince açık olmamasıydı.

İnceleme ayrıca fırsat kriterlerinin görünürlüğü, kiracı–kiralık havuz dili, kişi detaylarının iki ayrı yüzeye bölünmesi ve navigasyon terimlerinin tutarlılığı için iyileştirmeler önerdi.

## P0 — Birleşik hızlı kayıt

### Bulgu

“Bu not neye dönüşsün?” ekranı tek tür seçtiriyordu. Yeni kişi + görüşme + satıcı/alıcı fırsatı + takip içeren doğal bir olay tekrar veri girişi gerektiriyordu.

### Önerilen tasarım

İnceleme ekranı dört anlaşılır bloktan oluşmalı:

1. **Kim:** kişi oluştur veya bağla, kaynak ve rolü kontrol et.
2. **Ne oldu:** görüşme sonucunu ve kişi hafızasına aktarılacak bilgiyi kontrol et.
3. **İş fırsatı:** talep veya portföy adayını kontrol et.
4. **Sırada:** aksiyon ve tarihi kontrol et.

Son eylem oluşacak kayıtları açıkça adlandırmalı; örneğin “Selin’i, satıcı fırsatını ve 7 Eylül aramasını oluştur”. İnsan onayı olmadan hiçbir gerçek kayıt oluşmamalı.

### Durum

**Uygulandı.** Web ve mobil inceleme ekranları düzenlenebilir hale getirildi. Kişi, temas, fırsat ve takip tek idempotent sunucu komutuyla oluşturuluyor; geri alma bağlı kayıtların tamamını kapsıyor.

## P0 — Portföy ayrıntısı ve yayına hazırlık

### Bulgu

Portföy satırına tıklamak mevcut durumu ve eksikleri göstermeden doğrudan sonraki durum penceresini açıyordu. Yetki varsayılanı ticari gerçekliği olduğundan daha hazır gösterebiliyordu.

### Önerilen tasarım

- Satır önce portföy detay penceresini açmalı.
- Ticari durum ile “Yayına hazırlık” kontrol listesi ayrı gösterilmeli.
- Fiyat, yetki, mülk bilgileri, sözleşme/EİDS, medya ve işleme dayanağı görünür olmalı.
- Durum ilerletme detay içindeki ikincil eylem olmalı.
- Belirsiz yetkiyle aktif veya yayına hazır görünmemeli.

### Durum

**Uygulandı.** Satır detay penceresini açıyor. Ortak web/mobil hazırlık listesi yetki türü, fiyat, mülk/adres, yetki sözleşmesi veya muafiyet, EİDS veya muafiyet, medya ve işleme dayanağını ayrı ayrı gösteriyor. Bu kanıtlar idempotent sunucu komutuyla saklanıyor ve eksiklerden herhangi biri aktivasyonu sunucuda da engelliyor.

## P0 — Ayarlar, gizli değerler ve kayıt kapsamı

### Bulgu

İmzalı webhook adresleri tam değerleriyle DOM'a render ediliyordu. Sayfanın ana `Kaydet` düğmesinin yalnız çalışma alanı formunu mu, santral ve WhatsApp ayarlarını da mı kaydettiği belirsizdi.

### Önerilen tasarım

- Gizli adres ilk render, erişilebilirlik ağacı ve istemci loglarında bulunmamalı.
- Gösterme ve kopyalama ayrı, denetlenen eylemler olmalı.
- Yenileme etkisi açıkça anlatılmalı.
- Her kayıt eylemi hangi bölümü kaydettiğini adlandırmalı.

### Durum

**Uygulandı.** Anahtarlı adres ilk yükte istemciye dönmüyor; broker'ın açık kopyalama eylemiyle kısa süreli alınıyor. Ana kayıt eylemi `Profil ve uyumu kaydet` olarak adlandırıldı; santral ve WhatsApp kendi bölüm eylemlerini koruyor.

## P1 — Akış'ta hızlı kayıt görünürlüğü

### Bulgu

Hızlı kayıt, yoğun bir günde görevlerin altında kalırsa görüşme notu bırakma süresi uzar. Görev sonuçlandırma ekranında yeterli kişi ve takip bağlamı bulunmaması da sayfalar arası gidip gelmeye neden olabilir.

### Önerilen tasarım

- Dar ve genişleyebilen hızlı kayıt alanını başlığın hemen altına yerleştirin.
- Kişi özeti, son temas, talep ve sonraki adımı görev sonuçlandırma ekranında gösterin.
- Görev sonucu ile yeni takibi mümkün olduğunda aynı pencerede tamamlayın.

### Durum

**Uygulandı.** Hızlı kayıt Akış başlığının hemen altında. Görev penceresi rol, son temas ve fırsat/aşama bağlamını gösteriyor; sonuçlandırma ve yeni tarih/aksiyonla erteleme aynı pencerede tamamlanıyor. Kişi çalışma sayfasındaki sonraki adım da doğrudan bu pencereyi açıyor.

## P1 — Fırsat bağlamı ve kriterler

### Bulgu

Talep kriterleri sınırlı özetler halinde görünüyor, düzenlenemiyor ve derin bağlantı açıldığında arka plandaki segment yanlış kalabiliyordu.

### Önerilen tasarım

- Bölge, bütçe, tür, oda/salon, alan, taşınma zamanı ve olmazsa olmazları etiketli gösterin.
- Geçerli sonraki adımı zaman çizelgesinden önce gösterin.
- `Talebi düzenle` eylemi ekleyin.
- Derin bağlantı doğru müşteri talebi veya portföy adayı segmentini seçsin.

### Durum

**Uygulandı.** Talep kriterleri web ve mobil fırsat detayında görüntülenip düzenleniyor; güncel kişi hafızasıyla besleniyor. Derin bağlantılar ilgili fırsat tipinin segmentini seçiyor.

## P1 — Ofis havuzu ve eşleşmeme açıklaması

### Bulgu

Metinler yalnız alıcı taleplerinden söz ediyor, kiracı yolunu görünmez kılıyordu. `Mesaj taslağı` eylemi taslak üretirken panoyu da değiştirebiliyordu.

### Önerilen tasarım

- Satılık–alıcı ve kiralık–kiracı kapsamını açıkça belirtin.
- Tam eşleşme yoksa yakın adayın kaçırdığı kriteri gösterin.
- Taslak üretme, düzenleme ve kopyalamayı ayrı kullanıcı eylemleri yapın.

### Durum

**Uygulandı.** İşlem aileleri ve havuz metni iki yolu da kapsıyor. Yakın eşleşmeler gerekçeleriyle gösteriliyor. Web'de taslak önce düzenlenebilir önizleme olarak açılıyor; pano yalnız ayrı `Kopyala` eylemiyle değişiyor. Mobilde paylaşım sayfası yine ayrı açık eylem.

## P1 — Kişi çalışma yüzeyi

### Bulgu

Kişi drawer'ı ile tam kişi çalışma sayfası iki farklı detay deneyimi oluşturuyor. Tek ad alanına iç etiket eklenmesi müşteri hitabına sızabiliyor.

### Önerilen tasarım

- Tek kanonik kişi çalışma sayfası kullanın.
- `Ad soyad` ve `İç etiket` alanlarını ayırın.
- Sonraki adımı doğrudan sonuçlandırma/erteleme eylemine bağlayın.
- Rol bağlamına göre birincil eylem gösterin.

### Durum

**Uygulandı.** Liste üzerindeki eski detay drawer'ı kaldırıldı; kişi tek kanonik çalışma sayfasında açılıyor. Formda `Ad soyad` ile müşteriye gösterilmeyen `İç etiket` ayrıldı ve sunucuda ayrı saklanıyor. Sonraki adım aynı sayfadan tamamlanıyor veya erteleniyor. Rol satıcı/kiraya veren olduğunda portföy, alıcı/kiracı/yatırımcı olduğunda talep fırsatı eylemi gösteriliyor.

## P2 — Bilgi mimarisi ve küçük hız kazanımları

| Öneri | Durum |
| --- | --- |
| `Portföy` rozetinin aktif kayıtları saydığını açıklaştır | `Aktif portföy` olarak uygulandı. |
| Son kullanılan `Sesli anlat / Manuel yaz` tercihini hatırla | Web ve mobilde uygulandı. |
| `Portföyüm / Ofis havuzu` kalıcı sayfa içi segmentleri | Web ve mobilde uygulandı; bildirimler ve yan menü doğrudan havuz segmentini açıyor. |
| Yan menü ve üst barda tek kayıt terimine geç | Web ve mobilde `Temas kaydet` olarak birleştirildi. |
| Ayarlar'ı `Başlangıç / İletişim / Ofis / Uyum` adımlarına böl | Web ve mobilde uygulandı; her alan yalnız ilgili kart ve eylemleri gösteriyor. |

## Sonuç

UI ajanının rapordaki P0, P1 ve P2 önerileri web ve mobilde uygulandı. Yeni veri modeli ve komutlar ortak pakette tanımlandı; istemciler aynı callable Function setini kullanıyor. Rapor artık gerçekleştirilen durumun kabul kaydıdır.
