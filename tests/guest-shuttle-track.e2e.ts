import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Đơn có đặt xe: sau khi đặt, trang theo dõi phải cho khách thấy quy trình, xe, tài xế, bản đồ.
const HOTEL = '/khach-san/1e846e11-7346-4750-9e2e-9fe0364b2a18'; // Trăng Non Stay (xe đón miễn phí)
const iso = (plus: number) => new Date(Date.now() + plus * 86400000).toISOString().slice(0, 10);

describe('đơn có xe -> tra cứu', () => {
  test('đặt phòng kèm xe đón sân bay rồi mở trang theo dõi', async ({ app, screen, browser }) => {
    await app.open(HOTEL);
    await expect(browser.locator('h1')).toBeVisible();
    await browser.locator('input[aria-label="Ngày nhận phòng"]').fill(iso(12));
    await browser.locator('input[aria-label="Ngày trả phòng"]').fill(iso(13));
    const night = '[data-testid="rate-row"]:has-text("Theo đêm") [data-testid="room-qty"]:not([disabled])';
    await expect(browser.locator(night).first()).toBeVisible();
    await browser.locator(night).first().selectOption('1');
    await browser.locator('[data-testid="room-summary"] button').click();
    await expect(browser.locator('[role="dialog"]')).toBeVisible();
    await browser.locator('input[name="passengerName"]').fill('Khách Test Xe');
    await browser.locator('input[name="phone"]').fill('0912345678');
    await browser.locator('[data-testid="leg-TO_HOTEL"]').check();
    await app.screenshot('form-shuttle');
    await browser.locator('[role="dialog"] form button:not([type="button"])').click();
    await expect(browser.locator('[role="dialog"]')).toContainText('Mã booking');
    await app.screenshot('booking-done');
    await browser.locator('button:has-text("Xem chi tiết đơn và theo dõi xe")').click();
    await browser.evaluate(() => new Promise((r) => setTimeout(r, 2500)));
    await app.screenshot('track-page');
    await browser.evaluate(() => window.scrollTo(0, 700));
    await app.screenshot('track-page-2');
  });
});
