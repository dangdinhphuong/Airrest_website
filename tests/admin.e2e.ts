import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('admin flows', () => {
  test('sysadmin logs in and navigates management tabs', async ({ app, screen, browser }) => {
    await app.open('/dang-nhap');

    // Switch to Staff tab
    await screen.getByRole('button', 'Nhân sự').click();
    await screen.getByTestId('staff-email').fill('sysadmin1@airrest.mo');
    await browser.locator('#s-pw').fill('ChangeMe123!');
    await screen.getByTestId('staff-submit').click();

    // Verify redirected to Admin portal
    await expect(browser.locator('.sx-portal')).toContainText('Cổng Quản trị');
    await expect(browser.locator('body')).toContainText('Quản trị hệ thống 1');

    // Verify navigation sidebar contains system admin tabs
    const sidebar = screen.getByTestId('partner-sidebar');
    await expect(sidebar.getByRole('button', 'Khách sạn')).toBeVisible();
    await expect(sidebar.getByRole('button', 'Doanh nghiệp')).toBeVisible();
    await expect(sidebar.getByRole('button', 'Đơn đặt phòng')).toBeVisible();
    await expect(sidebar.getByRole('button', 'Tài khoản và vai trò')).toBeVisible();
    await expect(sidebar.getByRole('button', 'Cấu hình')).toBeVisible();

    // Navigate to Khách sạn tab
    await sidebar.getByRole('button', 'Khách sạn').click();
    await expect(browser.locator('body')).toContainText('Khách sạn');

    // Navigate to Doanh nghiệp tab
    await sidebar.getByRole('button', 'Doanh nghiệp').click();
    await expect(browser.locator('body')).toContainText('Doanh nghiệp');

    // Navigate to Cấu hình tab
    await sidebar.getByRole('button', 'Cấu hình').click();
    await expect(browser.locator('body')).toContainText('Cấu hình');

    // Open User menu and Logout
    const userMenuBtn = screen.getByTestId('partner-entry');
    await userMenuBtn.click();
    await screen.getByTestId('logout').click();
    await expect(screen.getByRole('button', 'Nhân sự')).toBeVisible();
  });

  test('ops admin logs in with restricted operational permissions', async ({ app, screen, browser }) => {
    await app.open('/dang-nhap');

    await screen.getByRole('button', 'Nhân sự').click();
    await screen.getByTestId('staff-email').fill('ops1@airrest.mo');
    await browser.locator('#s-pw').fill('ChangeMe123!');
    await screen.getByTestId('staff-submit').click();

    // Verify OPS user name in portal
    await expect(browser.locator('.sx-portal')).toContainText('Cổng Quản trị');
    await expect(browser.locator('body')).toContainText('Điều phối xe 1');

    // OPS has Chuyến bay and Đơn đặt phòng but NOT accounts/role management
    const sidebar = screen.getByTestId('partner-sidebar');
    await expect(sidebar.getByRole('button', 'Chuyến bay')).toBeVisible();
    await expect(sidebar.getByRole('button', 'Tài khoản và vai trò')).toBeHidden();

    // Logout
    const userMenuBtn2 = screen.getByTestId('partner-entry');
    await userMenuBtn2.click();
    await screen.getByTestId('logout').click();
    await expect(screen.getByRole('button', 'Nhân sự')).toBeVisible();
  });

  test('finance admin logs in with financial permissions', async ({ app, screen, browser }) => {
    await app.open('/dang-nhap');

    await screen.getByRole('button', 'Nhân sự').click();
    await screen.getByTestId('staff-email').fill('finance1@airrest.mo');
    await browser.locator('#s-pw').fill('ChangeMe123!');
    await screen.getByTestId('staff-submit').click();

    // Verify Finance user name in portal
    await expect(browser.locator('.sx-portal')).toContainText('Cổng Quản trị');
    await expect(browser.locator('body')).toContainText('Kế toán 1');

    // Finance has Thanh toán tab
    const sidebar = screen.getByTestId('partner-sidebar');
    await expect(sidebar.getByRole('button', 'Thanh toán')).toBeVisible();
    await expect(sidebar.getByRole('button', 'Tài khoản và vai trò')).toBeHidden();

    // Logout
    const userMenuBtn = screen.getByTestId('partner-entry');
    await userMenuBtn.click();
    await screen.getByTestId('logout').click();
    await expect(screen.getByRole('button', 'Nhân sự')).toBeVisible();
  });
});
