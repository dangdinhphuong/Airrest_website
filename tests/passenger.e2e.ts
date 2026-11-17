import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('passenger flow', () => {
  test('guest visits public pages', async ({ app, screen, browser }) => {
    await app.open('/');
    await expect(screen.getByRole('button', 'AIRREST, về trang chủ')).toBeVisible();

    const mainNav = screen.getByRole('navigation', 'Điều hướng chính');

    // Check header links in main nav
    await expect(mainNav.getByRole('button', 'Cách hoạt động')).toBeVisible();
    await expect(mainNav.getByRole('button', 'Nơi nghỉ')).toBeVisible();
    await expect(mainNav.getByRole('button', 'Theo dõi booking')).toBeVisible();
    await expect(mainNav.getByRole('button', 'Trợ giúp')).toBeVisible();

    // Navigate to Track page
    await mainNav.getByRole('button', 'Theo dõi booking').click();
    await expect(browser.locator('body')).toContainText('Theo dõi booking');

    // Navigate to Support page
    await mainNav.getByRole('button', 'Trợ giúp').click();
    await expect(browser.locator('body')).toContainText('Trung tâm hỗ trợ');
  });

  test('passenger logs in successfully with khach01', async ({ app, screen, browser }) => {
    await app.open('/dang-nhap');

    // Passenger tab is active by default
    await expect(screen.getByRole('button', 'Hành khách')).toBeVisible();
    await screen.getByTestId('login-username').fill('khach01');
    await browser.locator('#a-pw').fill('ChangeMe123!');

    await screen.getByTestId('login-submit').click();

    // After login, passenger is redirected to home and user name is shown in header
    await expect(browser.locator('body')).toContainText('Khách thử 1');

    // Click on passenger account button to open account page
    const accountBtn = screen.getByRole('button', 'Khách thử 1');
    await expect(accountBtn).toBeVisible();
    await accountBtn.click();

    await expect(browser.locator('body')).toContainText('TÀI KHOẢN NGƯỜI DÙNG');
    await expect(browser.locator('body')).toContainText('khach01');

    // Logout
    const logoutBtn = screen.getByRole('button', 'Đăng xuất');
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Verify redirected to home with login button visible
    await expect(screen.getByRole('button', 'Đăng nhập').first()).toBeVisible();
  });

  test('shows error when logging in with incorrect credentials', async ({ app, screen, browser }) => {
    await app.open('/dang-nhap');

    await screen.getByTestId('login-username').fill('khach01');
    await browser.locator('#a-pw').fill('WrongPassword999!');
    await screen.getByTestId('login-submit').click();

    // Verify error message is shown
    await expect(browser.locator('[data-testid="login-error"]')).toBeVisible();
    await expect(browser.locator('[data-testid="login-error"]')).toContainText('Sai tên đăng nhập hoặc mật khẩu');
  });
});
