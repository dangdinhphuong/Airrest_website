import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('user public search flows', () => {
  test('flight search finds status on homepage', async ({ app, screen, browser }) => {
    await app.open('/');

    // Check flight search box is visible on home
    const flightInput = screen.getByRole('textbox', 'Số hiệu chuyến bay');
    await expect(flightInput).toBeVisible();

    // Fill flight number and search
    await flightInput.fill('VN218');
    await screen.getByRole('button', 'Kiểm tra trạng thái').click();

    // Verify search result or flight card is updated
    await expect(browser.locator('#flight-status')).toBeVisible();
    await expect(browser.locator('#flight-status')).toContainText('VN218');
  });

  test('browse airport switches popular airport tabs', async ({ app, screen, browser }) => {
    await app.open('/');

    // Verify airport tab buttons (HAN, SGN, DAD)
    await expect(screen.getByRole('tab', 'Nội Bài (HAN)')).toBeVisible();
    await expect(screen.getByRole('tab', 'Tân Sơn Nhất (SGN)')).toBeVisible();
    await expect(screen.getByRole('tab', 'Đà Nẵng (DAD)')).toBeVisible();

    // Switch to Tan Son Nhat (SGN)
    await screen.getByRole('tab', 'Tân Sơn Nhất (SGN)').click();
    await expect(browser.locator('body')).toContainText('SGN');

    // Switch to Da Nang (DAD)
    await screen.getByRole('tab', 'Đà Nẵng (DAD)').click();
    await expect(browser.locator('body')).toContainText('DAD');
  });

  test('track booking form validation', async ({ app, screen, browser }) => {
    await app.open('/tra-cuu');

    await expect(browser.locator('body')).toContainText('Theo dõi booking');

    // Attempt to submit empty lookup
    const submitBtn = screen.getByRole('button', 'Tra cứu booking');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Verify validation requirement remains on screen
    await expect(browser.locator('body')).toContainText('Mã booking và số điện thoại xác minh');
  });
});
