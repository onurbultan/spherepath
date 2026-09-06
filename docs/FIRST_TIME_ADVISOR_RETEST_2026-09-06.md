# İlk kez kullanan danışman — uygulama sonrası tekrar deneme

Tarih: 6 Eylül 2026. Kaynak: [5 Eylül bulguları](FIRST_TIME_ADVISOR_LIVE_AUDIT_2026-09-05.md). Uygulama sırası: [implementasyon planı](ADVISOR_AUDIT_IMPLEMENTATION_2026-09-06.md).

## Sonuç

İlk müşteri kaydı artık talep incelemesinden ayrılmadan tamamlanabiliyor. Bölge dışındaki portföy yüksek uyumlu öneri olarak sunulmuyor; zorunlu bölge seçildiğinde eleniyor. Görevin tamamlanması kişi ve fırsatta aynı sonucu gösteriyor. Alıcı ve satıcı bilgileri ile gönderim, teslim ve kapama durumları birbirinden ayrıldı.

Bu sonuç yerel uygulama ve Firebase Emulator denemesidir. Üretime dağıtım yapılmadı. Yerel web: `http://localhost:5052`; hesap: `danisman.retest.20260906@example.test` — Deniz Aral Test. Gerçek müşteriye arama veya mesaj gönderilmedi.

## Uygulanan düzeltmeler

| Önceki bulgu | Uygulanan davranış |
| --- | --- |
| Urla İskele talebi ile Alaçatı villası %82 uyumlu görünüyordu | Esnek bölge uyuşmazlığı en fazla %59; tüm puan gerekçeleri görünür. Kesin bölge tercihi adayı eler. Şehir veya tek ortak sözcük farklı mahalleleri eşleştirmez. Mesaj alternatif olduğunu açıklar. |
| Talep notundan yeni kişi oluşturma tıkanıyordu | Aynı inceleme ekranında yeni kişi oluşturulur; ad, telefon, kaynak, rol, talep ve takip birlikte onaylanır. Mevcut idempotent komut kişi + görüşme + fırsat + takibi atomik kaydeder. Asenkron analiz onaysız biçimde kişi hafızasını değiştirmez. |
| Aşama düzeltme başka aşamayla açılıyordu | Mevcut aşama seçili gelir, eski → yeni özeti görünür, değişmeyen aşama kaydedilemez. Ardışık aşama ilerletmede veri yenilenmeden pencere kapanmaz. |
| Satıcı fırsatı alıcı formu gösteriyordu | Mülk adresi, beklenen fiyat, alan, yetki durumu ve satış/kiralama nedeni ayrı formda tutulur. Fırsatın kendi kriteri önceliklidir; satıcı özeti alıcı kriterine düşmez. Aynı kişide iki tarafın bilgisi korunur. |
| Tamamlanan takip kişi kartında kalıyordu | Aynı işi temsil eden kişi/fırsat hatırlatıcıları birlikte güncellenir; bağımsız takipler korunur. İlgili sorgular her iki platformda yenilenir. |
| Kapandı aşaması yeni aksiyon istiyordu | Kapandı ve Kaybedildi ekranlarında sonraki aksiyon alanları kaldırıldı. |
| Ofis/rol kararı ve ilk adım belirsizdi | Yeni çalışma alanı ile davetli katılımın sonuçları açıklanır. Mobil kayıt da davet kodunu destekler. Boş hesap müşteri, görüşme ve portföy başlangıçlarını sunar. |
| Enter, takvim ve seçim kontrolleri sorunluydu | Düzenleme formlarında Enter yanlışlıkla kaydetmez; tarih seçildikten sonra saat değiştirilebilir ve birlikte uygulanır. Menü adları ve seçim durumları erişilebilir hale getirildi. |
| Gönderim, veri talebi, huni ve indirme dili yanıltıcıydı | Gönderim açık kullanıcı teyidi ister. Erişim talebi kimlik doğrulama → hazırlama → teslim olarak ayrıldı. Son tarih “Yanıt için son tarih” olarak adlandırıldı. Huni oranının hesaplanma biçimi ve yenileme durumu açıklandı; indirme/şablon geri bildirimi eklendi. |

## Danışman gibi elle denediğim akış

1. **Yeni hesap:** Rol/ofis açıklamasını ve üç başlangıç eylemini gördüm.
2. **Doğal not:** “Ayşe Kara bugün aradı… Urla İskele… 18–35 milyon… 3+1… yarın 14:00'te aramamı istedi… Telefon: 0555 000 11 22” notunu kaydettim. Son çözümlemede ad, telefon ve ertesi gün 14:00 takibi doğru geldi. Kişi türünü Talep olarak değiştirip aynı pencereden yeni kişiyi oluşturdum.
3. **Kayıt bütünlüğü:** Kişi sayısı 1 oldu; bir görüşme, bir alıcı fırsatı ve tek yaklaşan iş oluştu. Kişi kartında telefon ve takip saati korundu.
4. **Görev:** Takibi sentetik test notuyla tamamladım. Kişi kartında “Sonraki adım: Belirlenmedi”, fırsatta “Sonraki aksiyon yok” göründü; tamamlanma geçmişe eklendi.
5. **Bölge uyuşmazlığı:** Çeşme Alaçatı, 3+1, 200 m², bahçeli, 28 milyon TL villayı inceleyip havuza ekledim. Sonuç %59 ve “Yakın ama tam değil” oldu. “Urla İskele ↔ Çeşme Alaçatı” uyuşmazlığı ilk gerekçeydi; taslak mesaj alternatif bölgeyi açıkça belirtti. Müşteriye gönderilecek taslaktan dahili puan açıklaması ayrıca çıkarıldı.
6. **Kesin bölge:** Talebi “Bölge olmazsa olmaz” olarak kaydettim; eksik alt bütçe ve alan sınırını da elle girdim. Alaçatı villası eşleşme listesinden çıktı.
7. **Veri erişim talebi:** `RETEST-DSR-001` talebini oluşturdum. Kimlik doğrulamasından sonra durum yalnız “Onaylandı” oldu. Veri kopyası hazırlanınca “Veri hazır; teslim bekliyor” göründü. Teslim notu ve teyidi olmadan tamamlama düğmesi kapalı kaldı. Gerçek bir teslim yapılmadığından elle denenen talebi burada bıraktım.

Satıcı kriteri kaydetme/yeniden açma ile gönderim teyidi ve terminal kapama ayrıca gerçek tarayıcı ekranlarını kullanan kabul testlerinde masaüstü ve Pixel 7 boyutunda denendi. Kapama testinin başlangıç portföyü ve sözleşme aşaması sentetik sunucu komutlarıyla hazırlandı; son kapama ekranı UI üzerinden kaydedildi. Gönderim teyidi penceresi kontrol edilip iptal edildi, dış gönderim yapılmadı.

## Test sırasında ayrıca yakalanıp düzeltilenler

- “Aramamı istedi” ifadesi ve Türkçe noktasız `ı` nedeniyle geçmiş arama ile gelecek takip karışıyordu. Ad, telefon ve takip tarihi için regresyon testleri eklendi.
- Alıcı kriteri komutu, boş satıcı alanının Firebase taşınmasında `null` olmasından dolayı reddedilebiliyordu. Bu alan artık yalnız satıcı/kiralayan işleminde gönderiliyor.
- Hızlı ardışık aşama ilerletmede eski aşama yeniden açılabiliyordu. Pencere veri yenilendikten sonra kapanıyor.
- “Bu görüşmeye uygulanmaz” sonucu “Uygun değildi” diye gösterilerek olumsuz görüşme izlenimi veriyordu; ortak metin düzeltildi.
- Tekrar çalıştırılan entegrasyon testlerindeki sabit komut ve WhatsApp test kimlikleri eski test ofisleriyle çakışıyordu. Her çalıştırmaya özel hale getirildi.

## Doğrulama

| Kontrol | Sonuç |
| --- | --- |
| `pnpm check` | Geçti: TypeScript, birim testleri, lint ve platform paritesi |
| Birim testleri | **279 geçti**: ortak paket 218, Functions 57, web 1, mobil 3 |
| Firebase Emulator API paketi | **4 senaryo geçti**: ana iş akışı, yeni atomik kayıt/görev testi, ekip sınırları ve ölçek |
| Playwright — masaüstü Chromium + Pixel 7 | **8/8 geçti**; son toplu koşu yaklaşık 1,3 dakika |
| `pnpm design:check` | Geçti |
| Web üretim derlemesi | Geçti; son değişikliklerle 15 sayfa derlendi |
| Callable paritesi | **74 fonksiyon** iki platformda da erişilebilir; yeni istisna yok |
| `git diff --check` | Geçti |

Son API komutu çalışan emülatörlere `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 pnpm --dir firebase-tests test:api` ile bağlandı. Tarayıcı kabul komutu `pnpm --filter @spherepath/web test:e2e` idi. Test kimlikleri ve portföyler sentetiktir.

Kalıcı yeni UI testleri: `apps/web/e2e/advisor-audit-regression.spec.ts`. Atomik kayıt, kişi/fırsat görev tutarlılığı, satıcı kriterinin alıcı bilgisini koruması ve veri talebi geçişleri: `firebase-tests/api.integration.test.ts`. Bölge, mesaj, not ve gönderim kuralları için ortak paket ve Functions birim testleri eklendi.

## Kalan sürtünme ve sınırlar

- Yerel kurallı not çözümlemesi örnek nottaki **18 milyon alt bütçeyi** ve ayrı cümledeki **en az 180 m²** bilgisini otomatik doldurmadı. Kriter düzenleyicisinden tamamladım. Ad/telefon/takip düzelmiş olsa da çıkarılan kriterleri danışmanın gözden geçirmesi hâlâ gerekli; bu tur doğal dil çıkarımının eksiksiz olduğunu göstermiyor.
- Yalnız alıcı fırsatı olan hesapta Fırsatlar sayfası başlangıçta “Portföy adayları” filtresiyle boş görünebiliyor; “Müşteri talepleri” seçilince kayıt geliyor. Veri kaybı yok, ilk kullanımda ek bir keşif adımı var.
- **Native iOS kullanımı doğrulanamadı:** Simülatör başlatılabildi, fakat bilgisayarın kilitli olması UI erişimini engelledi. Mobil TypeScript, lint, birim testleri ve 74 callable fonksiyonun web/mobil paritesi doğrulandı. Pixel 7 tarayıcı testi native mobil uygulama testi değildir.
- Yeni müşteri notunun emülatör yolu kurallı çıkarım kullanır. Üretimdeki ses tanıma, gerçek arama, WhatsApp işletme bağlantısı ve fiziksel cihaz davranışı bu turda doğrulanmadı.
- Veri şeması ekleri opsiyoneldir; mevcut fırsatlar için ilgili kişi hafızasından okuma devam eder. Firestore/Storage kuralları değiştirilmedi; üretim dağıtımı yapılmadı.

İlk günün ana işi artık tek akışta tamamlanabiliyor. Yeni danışman açısından kalan belirgin öğrenme yükü, çıkarılan kriterleri kontrol etmek ve fırsatların iki ayrı görünümünü keşfetmek.


## Devam çalışması — 6 Eylül 2026

Bu rapordaki kalan iki sürtünme sonraki çalışmada giderildi: bütçe/alan sınırları çıkarılıyor ve kontrol ekranında düzenlenebiliyor; yalnız müşteri talebi bulunan hesap doğru fırsat sekmesiyle açılıyor. Açık temadaki iki durum renginin kontrastı da iyileştirildi. Yeni manuel tekrar, 291 birim testi ve 4 tarayıcı kabul senaryosu ile tasarım değerlendirmesi için [franchise tasarım raporuna](FRANCHISE_DESIGN_REVIEW_2026-09-06.md) bakın.
