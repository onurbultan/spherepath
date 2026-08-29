import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(
    result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious"),
  ).toEqual([]);
}

test("emlak danışmanının ana iş akışı masaüstü ve mobilde tamamlanır", async ({ context, page }, testInfo) => {
  const runId = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const contactName = `E2E Ayşe ${runId.slice(-6)}`;

  await page.goto("/");
  await page.getByLabel("E-posta").fill(`missing-${runId}@example.test`);
  await page.getByLabel("Şifre").fill("spherepath-test-123");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "E-posta veya şifre hatalı." })).toHaveText(
    "E-posta veya şifre hatalı.",
  );
  await page.getByRole("button", { name: "Yeni misin? Çalışma alanı oluştur" }).click();
  await page.getByLabel("Ad soyad").fill("E2E Danışman");
  await page.getByLabel("E-posta").fill(`${runId}@example.test`);
  await page.getByLabel("Şifre").fill("spherepath-test-123");
  await page.getByRole("button", { name: "Hesap oluştur" }).click();
  await expect(page.getByRole("heading", { name: "Bugünün odağı" })).toBeVisible();
  await page.getByRole("button", { name: "90 gün" }).click();
  await expect(page.getByRole("button", { name: "90 gün" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Yıl" }).click();
  await expect(page.getByRole("button", { name: "Yıl" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "30 gün" }).click();

  await page.goto("/contacts");
  await expect(page.getByRole("heading", { name: "Kişiler" })).toBeVisible();
  await page.getByRole("button", { name: "Yeni kişi" }).click();
  const contactDialog = page.getByRole("dialog");
  await contactDialog.getByLabel("Ad, soyad veya tanımlayıcı").fill(contactName);
  await contactDialog.getByLabel("Telefon isteğe bağlı").fill("+905551112233");
  await contactDialog.getByLabel("Tanışma yeri isteğe bağlı").fill("Urla açık ev etkinliği");
  await contactDialog.getByLabel("Rol").selectOption({ label: "Satıcı" });
  await contactDialog.getByRole("button", { name: "Kişiyi kaydet" }).click();
  await expect(page.getByRole("button", { name: new RegExp(contactName) }).first()).toBeVisible();

  await page.getByRole("button", { name: "Yeni kişi" }).click();
  const secondContactDialog = page.getByRole("dialog");
  await secondContactDialog.getByLabel("Ad, soyad veya tanımlayıcı").fill(`E2E Bora ${runId.slice(-6)}`);
  await secondContactDialog.getByLabel("Rol").selectOption({ label: "Alıcı" });
  await secondContactDialog.getByRole("button", { name: "Kişiyi kaydet" }).click();

  const contactActionMenus = page.locator(".contact-action-menu");
  await expect(contactActionMenus).toHaveCount(2);
  await contactActionMenus.first().locator("summary").click();
  await expect(contactActionMenus.first()).toHaveAttribute("open", "");
  expect(await contactActionMenus.first().locator("xpath=..").evaluate((row) => getComputedStyle(row).zIndex)).toBe("30");
  if ((page.viewportSize()?.width ?? 0) > 620) {
    const laterMenuButton = await contactActionMenus.nth(1).locator("summary").boundingBox();
    expect(laterMenuButton).not.toBeNull();
    const openMenuOwnsOverlapPoint = await page.evaluate(({ x, y }) => {
      return document.elementFromPoint(x, y)?.closest(".contact-action-menu[open]") !== null;
    }, {
      x: laterMenuButton!.x + laterMenuButton!.width / 2,
      y: laterMenuButton!.y + laterMenuButton!.height / 2,
    });
    expect(openMenuOwnsOverlapPoint).toBe(true);
  }
  await contactActionMenus.first().locator("summary").click();

  await page.getByRole("button", { name: new RegExp(contactName) }).first().click();
  await expect(page.getByRole("heading", { name: contactName })).toBeVisible();
  const workspaceGaps = await page.locator(".contact-workspace-layout").evaluate((layout) => {
    const children = Array.from(layout.children);
    return children.slice(1).map((child, index) => {
      const previousRect = children[index]!.getBoundingClientRect();
      return child.getBoundingClientRect().top - previousRect.bottom;
    });
  });
  expect(workspaceGaps).toHaveLength(2);
  for (const gap of workspaceGaps) expect(gap).toBeGreaterThanOrEqual(19);
  await page.getByRole("main").getByRole("link", { name: "Temas kaydet" }).click();
  await expect(page).toHaveURL(/\/capture\?contactId=/);
  const voiceSetupHeights = await page.locator(".voice-setup .contact-combobox, .voice-setup .voice-confirm, .voice-setup .voice-start").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(voiceSetupHeights).toHaveLength(3);
  if ((page.viewportSize()?.width ?? 0) > 620) {
    expect(Math.max(...voiceSetupHeights) - Math.min(...voiceSetupHeights)).toBeLessThanOrEqual(1);
  } else {
    expect(voiceSetupHeights[2]).toBeGreaterThanOrEqual(52);
  }
  const selectedContactValues = page.locator(".contact-combobox-value");
  await expect(selectedContactValues).toHaveCount(2);
  await expect(selectedContactValues).toHaveText([contactName, contactName]);
  const contactPickers = await page.getByRole("combobox", { name: "Kişi ara" }).all();
  for (const picker of contactPickers) {
    await expect(picker).toHaveAttribute("placeholder", "");
    expect(await picker.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("0px");
    expect(await picker.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  }
  await contactPickers[0]!.click();
  const pickerList = page.locator(".contact-combobox-list").first();
  await expect(pickerList).toBeVisible();
  expect(await pickerList.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await page.getByRole("heading", { name: "Temas kaydet" }).click();
  await expect(pickerList).toBeHidden();
  await page.getByRole("checkbox", { name: /Görüşme bitti/ }).check();
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Permission denied", "NotAllowedError"); };
  });
  await page.getByRole("button", { name: "Kaydı başlat" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Mikrofon izni verilmedi" })).toContainText(
    "Mikrofon izni verilmedi",
  );
  await page.getByLabel("Kanal").selectOption({ label: "Telefon" });
  await page.getByLabel("Kısa sonuç").fill("Satış hedefini netleştirdik; ekspertiz için görüşeceğiz.");
  await page.getByLabel("Aksiyon").selectOption({ label: "Ara" });
  await page.getByRole("button", { name: "Yarın sabah" }).click();
  await page.getByRole("button", { name: "Teması kaydet" }).click();
  await expect(page.getByRole("heading", { name: "Temas ve sonraki aksiyon hazır" })).toBeVisible();

  await page.goto("/opportunities");
  await page.getByRole("button", { name: "Fırsat oluştur" }).click();
  const opportunityDialog = page.getByRole("dialog");
  await opportunityDialog.getByRole("combobox", { name: "Kişi ara" }).fill(contactName);
  await opportunityDialog.getByRole("option", { name: contactName }).click();
  await opportunityDialog.getByLabel("Fırsat türü").selectOption({ label: "Satılık portföy" });
  await opportunityDialog.getByRole("button", { name: "Fırsatı oluştur" }).click();
  await expect(page.getByRole("button", { name: new RegExp(contactName) }).first()).toBeVisible();

  await page.locator(".kanban-card").filter({ hasText: contactName }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Aşamayı düzelt" }).click();
  const correctionDialog = page.getByRole("dialog");
  await correctionDialog.getByLabel("Düzeltme nedeni").fill("İlk görüşme zaten yapılmıştı.");
  await correctionDialog.getByRole("button", { name: "Aşamayı düzelt" }).click();
  await expect(page.getByText("Görüşüldü").first()).toBeVisible();

  const listingAddress = `E2E Urla ${runId.slice(-6)}`;
  await page.goto("/listings");
  await page.getByRole("button", { name: "Mevcut yetkiyi ekle" }).first().click();
  const listingDialog = page.getByRole("dialog");
  await listingDialog.getByRole("combobox", { name: "Mülk sahibi ara" }).fill(contactName);
  await listingDialog.getByRole("option", { name: contactName }).click();
  await listingDialog.getByLabel("Adres").fill(listingAddress);
  await listingDialog.getByLabel("Bölge").fill("Urla Merkez");
  await listingDialog.getByLabel("Fiyat").fill("12500000");
  await listingDialog.getByRole("button", { name: "Yetkiyi ve portföyü oluştur" }).click();
  await expect(page.getByText(listingAddress)).toBeVisible();

  await page.getByRole("button", { name: "Kişi, fırsat veya portföy ara" }).click();
  await page.getByRole("dialog", { name: "Hızlı arama" }).getByRole("searchbox").fill(contactName);
  await page.getByRole("dialog", { name: "Hızlı arama" }).getByRole("button", { name: new RegExp(contactName) }).first().click();
  await expect(page).toHaveURL(/\/contacts\//);
  await expect(page.getByRole("heading", { name: contactName })).toBeVisible();
  await expect(page.getByText("Bu kişiyi arşivlemek istediğinden emin misin?")).toHaveCount(0);

  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("Çevrimdışısın");
  await context.setOffline(false);

  await expectNoSeriousAccessibilityViolations(page);
});
