import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('hotel flows', () => {
  test('hotel owner logs in and accesses hotel management tabs', async ({ app, screen, browser }) => {
    await app.open('/dang-nhap');

    // Switch to Staff tab
    await screen.getByRole('button', 'Nhân sự').click();
    await screen.getByTestId('staff-email').fill('chu.han01@khachsan.mo');
    await browser.locator('#s-pw').fill('ChangeMe123!');
    await screen.getByTestId('staff-submit').click();

    // Verify redirected to Hotel portal
    await expect(browser.locator('.sx-portal')).toContainText('Cổng Khách sạn');
    await expect(browser.locator('body')).toContainText('Chủ HAN-01');

    // Check hotel owner sidebar tabs
    const sidebar = screen.getByTestId('partner-sidebar');
    await expect(sidebar.getByTestId('tab-bookings')).toBeVisible();
    await expect(sidebar.getByTestId('tab-rooms')).toBeVisible();
    await expect(sidebar.getByTestId('tab-profile')).toBeVisible();
    await expect(sidebar.getByTestId('tab-inventory')).toBeVisible();
    await expect(sidebar.getByTestId('tab-revenue')).toBeVisible();
    await expect(sidebar.getByTestId('tab-staff')).toBeVisible();
    await expect(sidebar.getByTestId('tab-roles')).toBeVisible();
    await expect(sidebar.getByTestId('tab-fleet')).toBeVisible();

    // Navigate to Loại phòng và giá
    await sidebar.getByTestId('tab-rooms').click();
    await expect(browser.locator('body')).toContainText('Loại phòng');

    // Navigate to Tồn phòng
    await sidebar.getByTestId('tab-inventory').click();
    await expect(browser.locator('body')).toContainText('Tồn phòng');

    // Navigate to Nhân viên
    await sidebar.getByTestId('tab-staff').click();
    await expect(browser.locator('body')).toContainText('Nhân viên');

    // Logout
    const userMenuBtn = screen.getByTestId('partner-entry');
    await userMenuBtn.click();
    await screen.getByTestId('logout').click();
    await expect(screen.getByRole('button', 'Nhân sự')).toBeVisible();
  });

  test('receptionist logs in with booking and checkin permissions only', async ({ app, screen, browser }) => {
    await app.open('/dang-nhap');

    await screen.getByRole('button', 'Nhân sự').click();
    await screen.getByTestId('staff-email').fill('letan.han01@khachsan.mo');
    await browser.locator('#s-pw').fill('ChangeMe123!');
    await screen.getByTestId('staff-submit').click();

    // Verify Receptionist user name in portal
    await expect(browser.locator('.sx-portal')).toContainText('Cổng Khách sạn');
    await expect(browser.locator('body')).toContainText('Lễ tân HAN-01');

    // Receptionist sees Đặt phòng and Khách delay
    const sidebar = screen.getByTestId('partner-sidebar');
    await expect(sidebar.getByTestId('tab-bookings')).toBeVisible();
    await expect(sidebar.getByTestId('tab-delayOffers')).toBeVisible();

    // Receptionist CANNOT see staff management or role permissions
    await expect(sidebar.getByRole('button', 'Nhân viên')).toBeHidden();
    await expect(sidebar.getByRole('button', 'Vai trò và phân quyền')).toBeHidden();

    // Logout
    const userMenuBtn = screen.getByTestId('partner-entry');
    await userMenuBtn.click();
    await screen.getByTestId('logout').click();
    await expect(screen.getByRole('button', 'Nhân sự')).toBeVisible();
  });

  test('room manager logs in with inventory and room catalog permissions', async ({ app, screen, browser }) => {
    await app.open('/dang-nhap');

    await screen.getByRole('button', 'Nhân sự').click();
    await screen.getByTestId('staff-email').fill('phong.han01@khachsan.mo');
    await browser.locator('#s-pw').fill('ChangeMe123!');
    await screen.getByTestId('staff-submit').click();

    // Verify Room manager user name in portal
    await expect(browser.locator('.sx-portal')).toContainText('Cổng Khách sạn');
    await expect(browser.locator('body')).toContainText('Quản lý phòng HAN-01');

    // Room manager sees Room/Inventory
    const sidebar = screen.getByTestId('partner-sidebar');
    await expect(sidebar.getByTestId('tab-rooms')).toBeVisible();
    await expect(sidebar.getByTestId('tab-profile')).toBeVisible();
    await expect(sidebar.getByTestId('tab-inventory')).toBeVisible();

    // Room manager CANNOT see staff or roles
    await expect(sidebar.getByRole('button', 'Nhân viên')).toBeHidden();
    await expect(sidebar.getByRole('button', 'Vai trò và phân quyền')).toBeHidden();

    // Logout
    const userMenuBtn = screen.getByTestId('partner-entry');
    await userMenuBtn.click();
    await screen.getByTestId('logout').click();
    await expect(screen.getByRole('button', 'Nhân sự')).toBeVisible();
  });
});
