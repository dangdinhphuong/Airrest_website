import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('payer and driver flows', () => {
  test('payer manager (VNA) logs in and views delay & statement tabs', async ({ app, screen, browser }) => {
    await app.open('/dang-nhap');

    await screen.getByRole('button', 'Nhân sự').click();
    await screen.getByTestId('staff-email').fill('dv.vna@chitra.mo');
    await browser.locator('#s-pw').fill('ChangeMe123!');
    await screen.getByTestId('staff-submit').click();

    // Verify Payer name in portal
    await expect(browser.locator('.sx-portal')).toContainText('Cổng Quản trị');
    await expect(browser.locator('body')).toContainText('Quản lý VNA');

    // Payer has Chuyến bay delay and Bảng kê tháng tabs
    const sidebar = screen.getByTestId('partner-sidebar');
    await expect(sidebar.getByRole('button', 'Chuyến bay delay')).toBeVisible();
    await expect(sidebar.getByRole('button', 'Bảng kê tháng')).toBeVisible();

    // Logout
    const userMenuBtn = screen.getByTestId('partner-entry');
    await userMenuBtn.click();
    await screen.getByTestId('logout').click();
    await expect(screen.getByRole('button', 'Nhân sự')).toBeVisible();
  });

  test('station payer staff (HAN) logs in and accesses delay management', async ({ app, screen, browser }) => {
    await app.open('/dang-nhap');

    await screen.getByRole('button', 'Nhân sự').click();
    await screen.getByTestId('staff-email').fill('nv1.vna.han@chitra.mo');
    await browser.locator('#s-pw').fill('ChangeMe123!');
    await screen.getByTestId('staff-submit').click();

    // Verify Station Payer staff name
    await expect(browser.locator('.sx-portal')).toContainText('Cổng Quản trị');
    await expect(browser.locator('body')).toContainText('NV VNA HAN 1');

    const sidebar = screen.getByTestId('partner-sidebar');
    await expect(sidebar.getByRole('button', 'Chuyến bay delay')).toBeVisible();

    // Logout
    const userMenuBtn = screen.getByTestId('partner-entry');
    await userMenuBtn.click();
    await screen.getByTestId('logout').click();
    await expect(screen.getByRole('button', 'Nhân sự')).toBeVisible();
  });

  test('hotel driver logs in and accesses my trips tab', async ({ app, screen, browser }) => {
    await app.open('/dang-nhap');

    await screen.getByRole('button', 'Nhân sự').click();
    await screen.getByTestId('staff-email').fill('taixe.han01.1@airrest.vn');
    await browser.locator('#s-pw').fill('ChangeMe123!');
    await screen.getByTestId('staff-submit').click();

    // Verify driver user name in portal
    await expect(browser.locator('.sx-portal')).toContainText('Cổng Khách sạn');
    await expect(browser.locator('body')).toContainText('Tài xế HAN-01 1');

    // Driver sees Chuyến của tôi
    const sidebar = screen.getByTestId('partner-sidebar');
    await expect(sidebar.getByTestId('tab-trips')).toBeVisible();

    // Driver CANNOT see bookings or staff
    await expect(sidebar.getByRole('button', 'Đặt phòng')).toBeHidden();
    await expect(sidebar.getByRole('button', 'Nhân viên')).toBeHidden();

    // Logout
    const userMenuBtn = screen.getByTestId('partner-entry');
    await userMenuBtn.click();
    await screen.getByTestId('logout').click();
    await expect(screen.getByRole('button', 'Nhân sự')).toBeVisible();
  });
});
