import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('app opens and displays AIRREST logo', async ({ app, screen, browser }) => {
  await app.open('/');
  await expect(browser.locator('body')).toBeVisible();
  await expect(screen.getByRole('button', 'AIRREST, về trang chủ')).toBeVisible();
});

test('navigates to login page when clicking login button', async ({ app, screen, browser }) => {
  await app.open('/');
  const loginButton = screen.getByRole('button', 'Đăng nhập').first();
  await expect(loginButton).toBeVisible();
  await loginButton.click();
  await expect(browser.locator('body')).toContainText('Đăng nhập');
});


