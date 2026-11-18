import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Trang chi tiết khách sạn: chọn phòng ở bảng, một nút "Đặt phòng" mở form NGAY TẠI TRANG (URL không đổi).
// Mỗi kịch bản dùng ngày nhận phòng khác nhau trong tương lai để các đơn thật do test tạo ra không tranh tồn phòng của nhau.
const HOTEL = '/khach-san/e729c281-dbd4-4b82-8c7c-6732df3c073f';
const iso = (plus: number) => new Date(Date.now() + plus * 86400000).toISOString().slice(0, 10);
const NIGHT = '[data-testid="rate-row"]:has-text("Theo đêm") [data-testid="room-qty"]:not([disabled])';
const HOURLY = '[data-testid="rate-row"]:has-text("Theo giờ") [data-testid="room-qty"]';
const SUMMARY_BTN = '[data-testid="room-summary"] button';

async function openOn(app: any, browser: any, plus: number) {
  await app.open(HOTEL);
  await expect(browser.locator('h1')).toBeVisible();
  await browser.locator('input[aria-label="Ngày nhận phòng"]').fill(iso(plus));
  await browser.locator('input[aria-label="Ngày trả phòng"]').fill(iso(plus + 1));
  await expect(browser.locator(NIGHT).first()).toBeVisible(); // bảng phòng đã tải lại theo ngày mới
}
const fillGuest = async (browser: any) => {
  await browser.locator('input[name="passengerName"]').fill('Khách Test E2E');
  await browser.locator('input[name="phone"]').fill('0912345678');
};

describe('chi tiết khách sạn -> đặt phòng', () => {
  test('chọn phòng, bấm Đặt phòng thì mở form ngay tại trang', async ({ app, browser }) => {
    await openOn(app, browser, 7);
    await browser.locator(NIGHT).first().selectOption('1');
    await browser.locator(SUMMARY_BTN).click();
    await expect(browser.locator('[role="dialog"]')).toBeVisible();
    const url = await browser.evaluate(() => window.location.pathname);
    expect(url).toBe(HOTEL);
    await app.screenshot('form-open');
  });

  test('gửi đơn thanh toán tại khách sạn: có mã đơn', async ({ app, screen, browser }) => {
    await openOn(app, browser, 8);
    await browser.locator(NIGHT).first().selectOption('1');
    await browser.locator(SUMMARY_BTN).click();
    await expect(browser.locator('[role="dialog"]')).toBeVisible();
    await fillGuest(browser);
    await browser.locator('[role="dialog"] form button:not([type="button"])').click();
    await expect(screen.getByTestId('copy-code')).toBeVisible();
    await expect(screen.getByTestId('result-rooms')).toContainText('× 1');
    await app.screenshot('booking-done');
  });

  test('nhiều loại phòng trong một đơn: khung tổng liệt kê đủ các dòng', async ({ app, browser }) => {
    await openOn(app, browser, 9);
    await expect(browser.locator(NIGHT)).toHaveCount(2); // 2 loại phòng đều còn bán theo đêm vào ngày này
    await browser.locator(NIGHT).nth(0).selectOption('1');
    await browser.locator(NIGHT).nth(1).selectOption('1');
    await expect(browser.locator('[data-testid="room-summary"] li')).toHaveCount(2);
    await app.screenshot('multi-summary');
    await browser.locator(SUMMARY_BTN).click();
    await expect(browser.locator('[data-testid="cart-lines"] li')).toHaveCount(2);
  });

  test('đặt theo giờ: chọn giờ, mở form, gửi đơn, kết quả hiển thị đúng', async ({ app, screen, browser }) => {
    await openOn(app, browser, 10);
    await browser.locator(HOURLY).first().selectOption('1');
    await expect(browser.locator('[data-testid="hourly-summary"]')).toBeVisible();
    await app.screenshot('hourly-picked');
    await browser.locator(SUMMARY_BTN).click();
    await expect(screen.getByTestId('cart-line-hourly')).toBeVisible();
    await fillGuest(browser);
    await browser.locator('[role="dialog"] form button:not([type="button"])').click();
    await expect(screen.getByTestId('copy-code')).toBeVisible();
    await app.screenshot('hourly-done');
  });
});
