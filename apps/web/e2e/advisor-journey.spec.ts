import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(
    result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious"),
  ).toEqual([]);
}

async function swipe(page: Page, selector: string, fromX: number, toX: number) {
  await page.locator(selector).evaluate(async (target, { fromX, toX }) => {
    const y = Math.min(window.innerHeight - 160, 340);
    const start = new Touch({ identifier: 1, target, clientX: fromX, clientY: y });
    target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [start], changedTouches: [start] }));
    await new Promise((resolve) => window.setTimeout(resolve, 32));
    const end = new Touch({ identifier: 1, target, clientX: toX, clientY: y });
    target.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], changedTouches: [end] }));
  }, { fromX, toX });
}

async function expectIconAndTextCentered(action: Locator) {
  const centerDifference = await action.evaluate((element) => {
    const icon = element.querySelector("svg");
    const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    if (!icon || !textNode) return Number.POSITIVE_INFINITY;
    const iconRect = icon.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const textRect = range.getBoundingClientRect();
    return Math.abs((iconRect.top + iconRect.height / 2) - (textRect.top + textRect.height / 2));
  });
  expect(centerDifference).toBeLessThanOrEqual(1.5);
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
  await expect(page.getByRole("heading", { name: "Bugün" })).toBeVisible();
  await page.getByLabel("Hızlı not").fill("Bahçeli satılık bir ev duydum.");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Bahçeli satılık bir ev duydum.")).toBeVisible();
  await expect(page.getByText(/Nerede\?/)).toBeVisible();
  await page.getByRole("link", { name: "Huni" }).click();
  await expect(page.getByRole("heading", { name: "Nerede takılıyor?" })).toBeVisible();
  await page.getByRole("radio", { name: "90 gün" }).click();
  await expect(page.getByRole("radio", { name: "90 gün" })).toBeChecked();
  await page.getByRole("radio", { name: "1 yıl" }).click();
  await expect(page.getByRole("radio", { name: "1 yıl" })).toBeChecked();
  await page.getByRole("radio", { name: "30 gün" }).click();

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

  await page.goto("/");
  const savedNote = page.locator("article.keep-card").filter({ hasText: "Bahçeli satılık bir ev duydum." });
  await savedNote.getByRole("button", { name: "Düzenle ve işle" }).click();
  const noteDialog = page.getByRole("dialog", { name: "Bu not neye dönüşsün?" });
  await noteDialog.getByLabel("Not metni").fill("Ayşe Urla'da bahçeli satılık ev arıyor.");
  await noteDialog.getByLabel("Not türü").selectOption("requirement");
  await noteDialog.getByRole("combobox", { name: "İlgili kişi ara" }).fill(contactName);
  await noteDialog.getByRole("option", { name: contactName }).click();
  const analyzeRequirementButton = noteDialog.getByRole("button", { name: "Talep bilgilerini ve tarihi çıkar" });
  await expectIconAndTextCentered(analyzeRequirementButton);
  await analyzeRequirementButton.click();
  await expect(noteDialog.getByText("Talep bilgileri çıkarıldı")).toBeVisible();
  await noteDialog.getByRole("button", { name: "Talep oluştur" }).click();
  const processedNote = page.locator("article.keep-card").filter({ hasText: "Ayşe Urla'da bahçeli satılık ev arıyor." });
  await expect(processedNote).toContainText("Alıcı talebi oluşturuldu");
  await processedNote.getByRole("button", { name: "Arşivle" }).click();
  await expect(processedNote).toBeHidden();
  await page.getByRole("button", { name: "Arşiv" }).click();
  await expect(processedNote).toBeVisible();
  await processedNote.getByRole("button", { name: "Geri getir" }).click();
  await expect(processedNote).toBeHidden();
  await page.getByRole("button", { name: "Aktif" }).click();
  await expect(processedNote).toBeVisible();
  const dailyTasks = page.locator(".daily-five li");
  await expect(dailyTasks).toHaveCount(2);
  const stableTaskTitles = await dailyTasks.locator("strong").allTextContents();
  await page.reload();
  await expect(dailyTasks.locator("strong")).toHaveText(stableTaskTitles);
  const contactTask = dailyTasks.filter({ hasText: contactName });
  await contactTask.getByRole("button", { name: /görevini sonuçlandır/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sonucu kaydet" }).click();
  await expect(contactTask).toHaveClass(/resolved/);

  const optedOutTask = dailyTasks.filter({ hasNotText: contactName }).first();
  await optedOutTask.getByRole("button", { name: /görevini sonuçlandır/ }).click();
  const resolutionDialog = page.getByRole("dialog");
  await resolutionDialog.getByRole("button", { name: /İletişim istemiyor/ }).click();
  await resolutionDialog.getByLabel("İletişim neden kapatılıyor?").fill("Telefon ve WhatsApp üzerinden iletişim istemiyor.");
  await resolutionDialog.getByRole("button", { name: "İletişimi kapat" }).click();
  await expect(optedOutTask).toHaveClass(/resolution-contact_opt_out/);
  await expect(optedOutTask).toContainText("Telefon ve WhatsApp üzerinden iletişim istemiyor.");
  await page.reload();
  await expect(dailyTasks).toHaveCount(2);
  await expect(dailyTasks.filter({ hasText: "İletişim istemiyor" })).toHaveClass(/resolved/);
  await expect(dailyTasks.locator("strong")).toHaveText(stableTaskTitles);
  await dailyTasks.filter({ hasText: "İletişim istemiyor" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/contacts\/__contact__\/?\?contactId=/);
  await expect(page.getByRole("region", { name: "Zaman çizelgesi" })).toContainText("Telefon ve WhatsApp üzerinden iletişim istemiyor.");
  await page.goto("/contacts");

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
  await expect(page).toHaveURL(/\/capture\/?\?contactId=/);
  const voiceSetupHeights = await page.locator(".voice-setup .contact-combobox, .voice-setup .voice-confirm, .voice-setup .voice-start").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(voiceSetupHeights).toHaveLength(3);
  if ((page.viewportSize()?.width ?? 0) > 620) {
    expect(Math.max(...voiceSetupHeights) - Math.min(...voiceSetupHeights)).toBeLessThanOrEqual(1);
  } else {
    expect(voiceSetupHeights[2]).toBeGreaterThanOrEqual(52);
  }
  const selectedContactValues = page.locator(".contact-combobox-value");
  await expect(selectedContactValues).toHaveCount(1);
  await expect(selectedContactValues).toHaveText(contactName);
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
  await page.getByRole("tab", { name: "Manuel yaz" }).click();
  await expect(selectedContactValues).toHaveCount(1);
  await expect(selectedContactValues).toHaveText(contactName);
  await page.getByLabel("Kanal").selectOption({ label: "Telefon" });
  await page.getByLabel("Kısa sonuç").fill("Satış hedefini netleştirdik; ekspertiz için görüşeceğiz.");
  await page.getByLabel("Aksiyon").selectOption({ label: "Ara" });
  await page.getByRole("button", { name: "Yarın sabah" }).click();
  await page.getByRole("button", { name: "Teması kaydet" }).click();
  await expect(page.getByRole("heading", { name: "Temas ve sonraki aksiyon hazır" })).toBeVisible();

  await page.goto("/opportunities");
  await page.getByRole("button", { name: /Yeni fırsat|Fırsat oluştur/ }).first().click();
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

  await page.goto("/");
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("Çevrimdışısın");
  const offlineNote = `Çevrimdışı Urla portföy notu ${runId.slice(-6)}`;
  await page.getByLabel("Hızlı not").fill(offlineNote);
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText(offlineNote)).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/\d+ kayıt güvenli kuyrukta/);
  await context.setOffline(false);
  await expect(page.getByRole("status")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(offlineNote)).toBeVisible();

  await page.goto("/contacts");
  await page.getByRole("button", { name: new RegExp(contactName) }).first().click();
  await page.getByRole("main").getByRole("link", { name: "Temas kaydet" }).click();
  await page.evaluate(() => {
    class OfflineMediaRecorder {
      static isTypeSupported() { return true; }
      mimeType: string;
      state = "inactive";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(_stream: unknown, options?: { mimeType?: string }) { this.mimeType = options?.mimeType ?? "audio/webm"; }
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["offline-audio"], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: OfflineMediaRecorder });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => ({ getTracks: () => [{ stop() {} }] }) });
  });
  await page.getByRole("checkbox", { name: /Görüşme bitti/ }).check();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Kaydı başlat" }).click();
  await expect(page.getByRole("button", { name: "Durdur" })).toBeVisible();
  await page.waitForTimeout(5_100);
  await page.getByRole("button", { name: "Durdur" }).click();
  await expect(page.getByText("Sesli not cihazda güvende")).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/\d+ kayıt güvenli kuyrukta/);
  await context.setOffline(false);
  await expect(page.getByRole("status")).toBeHidden({ timeout: 15_000 });

  await page.goto("/");
  const allWorkToggle = page.getByRole("button", { name: /Tüm işleri gör/ });
  if (await allWorkToggle.isVisible()) {
    await allWorkToggle.click();
    const allWorkTask = page.locator(".all-work-list .daily-task-link").first();
    await expect(allWorkTask).toBeVisible();
    const taskCopyIsSeparated = await allWorkTask.evaluate((link) => {
      const title = link.querySelector("strong")?.getBoundingClientRect();
      const detail = link.querySelector("small")?.getBoundingClientRect();
      if (!title || !detail) return false;
      return detail.left - title.right >= 4 || detail.top - title.bottom >= 2;
    });
    expect(taskCopyIsSeparated).toBe(true);
  }

  await page.goto("/funnel");
  await expect(page.getByRole("heading", { name: "Nerede takılıyor?" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const funnelOverlap = await page.locator(".coaching-card").evaluate((coaching) => {
    const mirror = document.querySelector<HTMLElement>(".mirror-card");
    if (!mirror) return Number.POSITIVE_INFINITY;
    const coachingRect = coaching.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    return Math.max(0, Math.min(coachingRect.bottom, mirrorRect.bottom) - Math.max(coachingRect.top, mirrorRect.top));
  });
  expect(funnelOverlap).toBeLessThanOrEqual(1);

  const routes = ["/", "/funnel", "/capture", "/contacts", "/opportunities", "/listings", "/closing", "/settings"];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    const width = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
    expect(width.documentWidth).toBeLessThanOrEqual(width.viewportWidth + 1);
    expect(await page.locator("a, button, input, select, textarea").evaluateAll((elements) => elements.filter((element) => {
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.right > window.innerWidth + 1;
    }).length)).toBe(0);
  }

  if ((page.viewportSize()?.width ?? 1_000) <= 900) {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Ana navigasyon" }).getByRole("link")).toHaveCount(5);
    await expect(page.locator(".sidebar .nav-group-office")).toBeHidden();
    const quickNote = page.getByLabel("Hızlı not");
    await quickNote.fill("Kaydırırken bu yazı korunmalı");
    await swipe(page, "textarea[aria-label='Hızlı not']", 340, 80);
    await expect(page).toHaveURL(/\/$/);
    await expect(quickNote).toHaveValue("Kaydırırken bu yazı korunmalı");
    await swipe(page, ".app-frame", 340, 80);
    await expect(page).toHaveURL(/\/funnel\/?$/);
    await expect(page.getByRole("heading", { name: "Nerede takılıyor?" })).toBeVisible();
  }

  await expectNoSeriousAccessibilityViolations(page);
});
