import { expect, test, type Page } from "@playwright/test";

interface Meeting {
  name: string;
  phone: string;
  place: string;
  role: string;
  channel: string;
  outcome: string;
  action: string;
  datePreset?: string;
  opportunity?: string;
}

async function recordMeeting(page: Page, meeting: Meeting, first = false) {
  await page.goto("/capture");
  await expect(page.getByRole("heading", { name: "Temas kaydet" })).toBeVisible();
  await page.getByRole("button", { name: first ? "Yeni kişi ekle" : "Yeni kişi", exact: true }).click();
  const personDialog = page.getByRole("dialog", { name: "Yeni kişi ekle" });
  await personDialog.getByLabel("Ad soyad", { exact: true }).fill(meeting.name);
  await personDialog.getByLabel("Telefon numarası").fill(meeting.phone);
  await personDialog.getByLabel("Tanışma yeri isteğe bağlı").fill(meeting.place);
  await personDialog.getByLabel("Rol").selectOption({ label: meeting.role });
  await personDialog.getByRole("button", { name: "Kişiyi ekle ve görüşmeye dön" }).click();

  await page.getByRole("tab", { name: "Manuel yaz" }).click();
  await page.getByLabel("Kanal").selectOption({ label: meeting.channel });
  await page.getByLabel("Kısa sonuç").fill(meeting.outcome);
  await page.getByLabel("Aksiyon").selectOption({ label: meeting.action });
  if (meeting.datePreset) await page.getByRole("button", { name: meeting.datePreset }).click();
  await page.getByRole("button", { name: `${meeting.name} için kaydet` }).click();
  await expect(page.getByRole("heading", { name: `${meeting.name} için temas kaydedildi` })).toBeVisible();
  if (meeting.opportunity) {
    await page.getByRole("button", { name: `Fırsat aç: ${meeting.opportunity}` }).click();
    await expect(page.getByRole("link", { name: "Fırsatı görüntüle" })).toBeVisible();
  }
}

async function advanceSeller(page: Page, note: string, action: string, datePreset: string) {
  await page.getByRole("button", { name: "Mehmet Yılmaz: ilerlet" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Geçiş notu isteğe bağlı").fill(note);
  await dialog.getByLabel("Sonraki adım").selectOption({ label: action });
  await dialog.getByRole("button", { name: datePreset }).click();
  await dialog.getByRole("button", { name: "Aşamayı kaydet" }).click();
  await expect(dialog).toBeHidden();
}

test("ilk kez kullanan danışman beş görüşmelik gününü kayıpsız yönetir", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Yeni misin? Çalışma alanı oluştur" }).click();
  await page.getByLabel("Ad soyad").fill("Deniz Kaya");
  await page.getByLabel("E-posta").fill(`advisor-day-${suffix}@example.test`);
  await page.getByLabel("Şifre").fill("spherepath-test-123");
  await page.getByRole("button", { name: "Hesap oluştur" }).click();
  await expect(page.getByRole("heading", { name: "Bugün" })).toBeVisible();
  await expect(page.getByText("Henüz planlanacak iş yok. İlk notunu veya kişini ekle.")).toBeVisible();

  const meetings: Meeting[] = [
    { name: "Ayşe Demir", phone: "5551001001", place: "Urla açık ev", role: "Alıcı", channel: "Yüz yüze", outcome: "Urla İskele’de 3+1 bahçeli ev arıyor; bütçe üst sınırı 14 milyon TL. Cumartesi iki evi gezeceğiz.", action: "Randevu yap", datePreset: "Yarın sabah", opportunity: "Alıcı talebi" },
    { name: "Mehmet Yılmaz", phone: "5551001002", place: "Gelen telefon", role: "Satıcı", channel: "Telefon", outcome: "Kuşçular’daki villasını satmak istiyor. Yetki için fiyat çalışması ve ekspertiz bekliyor.", action: "Değerleme", datePreset: "Gelecek hafta", opportunity: "Satılık portföy" },
    { name: "Zeynep Akın", phone: "5551001003", place: "Kiralık ilanı", role: "Kiracı", channel: "WhatsApp", outcome: "İskele veya Çeşmealtı’nda eşyalı 2+1 kiralık arıyor; aylık üst sınırı 45 bin TL.", action: "Mesaj gönder", datePreset: "Yarın sabah", opportunity: "Kiracı talebi" },
    { name: "Can Öztürk", phone: "5551001004", place: "Referans kahvaltısı", role: "Yatırımcı", channel: "Yüz yüze", outcome: "Alaçatı’da ticari mülk arıyor; 30 milyon TL bütçe ve düzenli kira getirisi öncelikli.", action: "Teklif hazırla", datePreset: "2 hafta", opportunity: "Alıcı talebi" },
    { name: "Selin Koç", phone: "5551001005", place: "Eski müşteri araması", role: "Henüz belirlenmedi", channel: "Telefon", outcome: "Şu an gayrimenkul ihtiyacı yok ve telefon ya da WhatsApp üzerinden tekrar iletişim istemiyor.", action: "Henüz yok" },
  ];
  for (const [index, meeting] of meetings.entries()) await recordMeeting(page, meeting, index === 0);

  await page.goto("/");
  const upcoming = page.getByRole("region", { name: "Yarın ve sonrası" });
  await expect(upcoming.getByRole("link")).toHaveCount(4);
  for (const name of ["Ayşe Demir", "Mehmet Yılmaz", "Zeynep Akın", "Can Öztürk"]) {
    await expect(upcoming.getByRole("link", { name: new RegExp(name) })).toHaveCount(1);
  }
  const memory = page.getByRole("region", { name: "Bugün kaydedilen temaslar" });
  await expect(memory.getByRole("link")).toHaveCount(5);
  for (const meeting of meetings) await expect(memory).toContainText(meeting.name);

  await page.goto("/opportunities");
  await page.getByRole("button", { name: "Portföy adayları" }).click();
  await advanceSeller(page, "İlk ihtiyaç görüşmesi tamamlandı.", "Randevu yap", "Yarın sabah");
  await advanceSeller(page, "Yerinde inceleme randevusu alındı.", "Değerleme", "Gelecek hafta");
  await advanceSeller(page, "Değerleme raporu hazırlandı.", "Teklif hazırla", "Gelecek hafta");
  await advanceSeller(page, "Yetki şartları ve pazarlama planı sunuldu.", "Ara", "Yarın sabah");
  await page.getByRole("button", { name: "Mehmet Yılmaz: ilerlet" }).click();
  const winDialog = page.getByRole("dialog");
  await winDialog.getByLabel("Geçiş notu isteğe bağlı").fill("Tek yetkili satış sözleşmesi imzalandı.");
  await winDialog.getByRole("button", { name: "Yetkiyi al ve portföyü tamamla" }).click();

  const listingDialog = page.getByRole("dialog");
  await expect(listingDialog.getByText("Yetki kazanıldı.")).toBeVisible();
  await listingDialog.getByLabel("Adres").fill("Kuşçular Mahallesi 1204 Sokak No 8");
  await listingDialog.getByLabel("Bölge").fill("Urla Kuşçular");
  await listingDialog.getByLabel("Mülk türü").selectOption({ label: "Villa" });
  await listingDialog.getByLabel("Oda sayısı").fill("4");
  await listingDialog.getByLabel("m²").fill("240");
  await listingDialog.getByRole("button", { name: "Bahçeli" }).click();
  await listingDialog.getByLabel("Yetki").selectOption({ label: "Tek yetkili" });
  await listingDialog.getByRole("button", { name: "Portföyü oluştur" }).click();
  await expect(page.getByRole("button", { name: "Fiyatı tamamla" })).toBeVisible();

  await page.goto("/funnel");
  await expect(page.getByRole("heading", { name: "Portföyü pazara hazırla" })).toBeVisible();
  await expect(page.getByText(/fiyat bekliyor/).first()).toBeVisible();
  await page.getByRole("link", { name: "Bu kaydı aç" }).click();
  await page.getByRole("button", { name: "Fiyatı tamamla" }).click();
  const pricingDialog = page.getByRole("dialog");
  await pricingDialog.getByRole("textbox", { name: "Liste fiyatı TRY" }).fill("18500000");
  await pricingDialog.getByRole("button", { name: "Fiyatı kaydet" }).click();
  await expect(page.getByText("₺18.500.000").first()).toBeVisible();
  await page.getByRole("button", { name: /Kuşçular Mahallesi 1204/ }).click();
  const readinessDialog = page.getByRole("dialog");
  await readinessDialog.getByLabel("Yetki sözleşmesi / dayanağı").selectOption("verified");
  await readinessDialog.getByLabel("EİDS").selectOption("verified");
  await readinessDialog.getByLabel("Fotoğraf ve medya").selectOption("ready");
  await readinessDialog.getByRole("button", { name: "Yayın hazırlığını kaydet" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Durumu güncelle" }).click();
  const statusDialog = page.getByRole("dialog");
  await statusDialog.getByLabel("Not isteğe bağlı").fill("Fotoğraf çekimi ve ilan metni hazır.");
  await statusDialog.getByRole("button", { name: "Durumu kaydet" }).click();
  await expect(page.getByRole("button", { name: /Kuşçular Mahallesi 1204.*Aktif/ })).toBeVisible();

  await page.goto("/contacts");
  await page.getByRole("button", { name: /Selin Koç \+90/ }).click();
  await page.getByRole("button", { name: "İzinler" }).click();
  await page.getByRole("link", { name: "İzinleri düzenle" }).click();
  const privacyDialog = page.getByRole("dialog");
  await privacyDialog.getByRole("button", { name: "Geri alındı" }).click();
  await privacyDialog.getByLabel("İYS durumu").selectOption({ label: "Ret" });
  await privacyDialog.getByRole("button", { name: "Uyum kaydını güncelle" }).click();
  await expect(page.locator(".contact-table-row").filter({ hasText: "Selin Koç" })).toContainText("İletişim istemiyor");

  await page.goto("/");
  const finalUpcoming = page.getByRole("region", { name: "Yarın ve sonrası" });
  await expect(finalUpcoming.getByRole("link")).toHaveCount(3);
  await expect(finalUpcoming).not.toContainText("Mehmet Yılmaz");
  await expect(page.getByRole("region", { name: "Bugün kaydedilen temaslar" }).getByRole("link")).toHaveCount(5);
});
