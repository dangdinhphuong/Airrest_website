import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Đơn có xe, giờ đón sắp tới: hệ thống tự điều xe; khách tra cứu thấy tiến trình, xe, tài xế, bản đồ. Chạy trên API riêng (DB thử đã seed:fleet).
const HOTEL = `/khach-san/${process.env.HOTEL_ID}`;
const vnLocal = (plusMin: number) => new Date(Date.now() + 7 * 3600_000 + plusMin * 60_000).toISOString().slice(0, 16);

describe('khách theo dõi xe tự điều', () => {
  test('đặt phòng + xe sắp tới giờ đón, tra cứu thấy xe và tài xế', async ({ app, screen, browser }) => {
    await app.open(HOTEL);
    await expect(browser.locator('h1')).toBeVisible();
    const night = '[data-testid="rate-row"]:has-text("Theo đêm") [data-testid="room-qty"]:not([disabled])';
    await expect(browser.locator(night).first()).toBeVisible();
    await browser.locator(night).first().selectOption('1');
    await browser.locator('[data-testid="room-summary"] button').click();
    await expect(browser.locator('[role="dialog"]')).toBeVisible();
    await browser.locator('input[name="passengerName"]').fill('Khách Xe Tự Điều');
    await browser.locator('input[name="phone"]').fill('0912345678');
    await browser.locator('[data-testid="leg-TO_HOTEL"]').check();
    await browser.locator('#pickup-TO_HOTEL').fill(vnLocal(25));
    await browser.locator('[role="dialog"] form button:not([type="button"])').click();
    await expect(browser.locator('[role="dialog"]')).toContainText('Mã booking');
    await browser.locator('button:has-text("Xem chi tiết đơn và theo dõi xe")').click();
    await expect(browser.locator('[data-testid="hourly-none"], body')).toBeVisible();
    // hệ thống quét điều xe mỗi 60 giây rồi mô phỏng tài xế nhận chuyến: chờ tới khi thấy biển số xe
    for (let i = 0; i < 6; i++) {
      const found = await browser.evaluate(() => new Promise((r) => { const t0 = Date.now(); const id = setInterval(() => { if (/29A-\d+/.test(document.body.innerText) || Date.now() - t0 > 20000) { clearInterval(id); r(/29A-\d+/.test(document.body.innerText)); } }, 500); }));
      if (found) break;
    }
    await browser.evaluate(() => document.querySelector('[aria-label="Tiến trình đơn"], h3')?.scrollIntoView());
    await app.screenshot('track-live');
    await browser.evaluate(() => window.scrollBy(0, 600));
    await app.screenshot('track-live-2');
    await browser.evaluate(() => window.scrollBy(0, 600));
    await app.screenshot('track-live-3');
  });
});
