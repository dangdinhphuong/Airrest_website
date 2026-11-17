import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Chủ doanh nghiệp tạo nhân viên làm 2 khách sạn; xem phòng theo tab tầng + chi tiết phòng.
describe('nhân viên nhiều khách sạn + tab tầng', () => {
  test('chủ tạo nhân viên ở 2 khách sạn, danh sách hiện cả hai; tab tầng và chi tiết phòng', async ({ app, screen, browser }) => {
    await app.open('/dang-nhap');
    await screen.getByRole('button', 'Nhân sự').click();
    await screen.getByTestId('staff-email').fill('chu.han01@khachsan.mo');
    await browser.locator('#s-pw').fill('ChangeMe123!');
    await screen.getByTestId('staff-submit').click();
    await expect(browser.locator('.sx-portal')).toContainText('Cổng Khách sạn');

    const sidebar = screen.getByTestId('partner-sidebar');
    await sidebar.getByTestId('tab-staff').click();
    await screen.getByTestId('staff-new').click();
    const email = `nv.e2e.${Date.now()}@khachsan.mo`;
    await screen.getByTestId('sf-email').fill(email);
    await screen.getByTestId('sf-name').fill('Nhân viên E2E');
    const boxes = browser.locator('[data-testid^="sf-hotel-"]');
    await expect(boxes.nth(1)).toBeVisible(); // có ô chọn khách sạn (chủ có nhiều khách sạn)
    await browser.locator('[data-testid="sf-hotels"] input:not(:checked)').first().check(); // một khách sạn khác khách sạn đang làm việc
    await expect(browser.locator('[data-testid^="sf-role-"]').first()).toBeVisible(); // vai trò riêng cho khách sạn thứ hai
    await screen.getByTestId('sf-save').click();
    await expect(screen.getByTestId('temp-pw')).toBeVisible();
    await screen.getByTestId('staff-done').click();

    await browser.locator('[data-testid="sf-q"]').fill(email);
    await screen.getByTestId('f-apply').click();
    const row = screen.getByTestId('row');
    await expect(row).toContainText(email);
    await expect(row).toContainText(', '); // cột Khách sạn liệt kê từ 2 khách sạn trở lên
    await app.screenshot('staff-list');

    await sidebar.getByTestId('tab-rooms').click();
    await expect(browser.locator('[role="tablist"] [role="tab"]').first()).toBeVisible();
    await app.screenshot('rooms-tabs');
    await screen.getByTestId('ru-detail').first().click();
    await expect(screen.getByTestId('ru-detail-dlg')).toBeVisible();
    await app.screenshot('room-detail');
  });
});
