import { describe, expect, it } from 'vitest';
import { parsePath, pathOf } from './routes';

describe('routes', () => {
  it('mỗi màn có đường dẫn riêng và đọc ngược lại được', () => {
    for (const screen of ['home', 'stays', 'flights', 'track', 'support', 'login', 'payment']) expect(parsePath(pathOf({ screen }))).toEqual({ screen });
    expect(pathOf({ screen: 'stays' })).toBe('/noi-nghi');
    expect(pathOf({ screen: 'flights' })).toBe('/flights');
    expect(parsePath('/flights/')).toEqual({ screen: 'flights' });
  });
  it('chi tiết khách sạn mang id; thiếu id thì về trang chủ; id lạ bị từ chối', () => {
    expect(pathOf({ screen: 'detail', propertyId: 'abc-123' })).toBe('/khach-san/abc-123');
    expect(parsePath('/khach-san/abc-123')).toEqual({ screen: 'detail', propertyId: 'abc-123' });
    expect(pathOf({ screen: 'detail', propertyId: null })).toBe('/');
    expect(parsePath('/khach-san/a%2Fb')).toBeNull();
  });
  it('khu nhân sự có thêm tab', () => {
    expect(pathOf({ screen: 'admin', partnerTab: 'hotels' })).toBe('/quan-tri/hotels');
    expect(parsePath('/quan-tri/hotels')).toEqual({ screen: 'admin', partnerTab: 'hotels' });
    expect(parsePath('/doi-tac/khach-san')).toEqual({ screen: 'hotel', partnerTab: null });
    for (const screen of ['admin', 'hotel']) expect(parsePath(pathOf({ screen, partnerTab: 'settings' }))).toEqual({ screen, partnerTab: 'settings' }); // Cài đặt cá nhân
    expect(pathOf({ screen: 'hotel', partnerTab: 'settings' })).toBe('/doi-tac/khach-san/settings');
  });
  it('trang tài khoản có mục con /tai-khoan/<mục>', () => {
    expect(pathOf({ screen: 'account' })).toBe('/tai-khoan');
    expect(pathOf({ screen: 'account', partnerTab: 'don-dat-phong' })).toBe('/tai-khoan/don-dat-phong');
    expect(parsePath('/tai-khoan/don-dat-phong')).toEqual({ screen: 'account', partnerTab: 'don-dat-phong' });
    expect(parsePath('/tai-khoan')).toEqual({ screen: 'account', partnerTab: null });
  });
  it('bỏ dấu / cuối, giữ /payment/result, nhận link hash cũ, đường lạ -> null', () => {
    expect(parsePath('/noi-nghi/')).toEqual({ screen: 'stays' });
    expect(parsePath('/payment/result')).toEqual({ screen: 'payment' });
    expect(parsePath('/', '#/stays')).toEqual({ screen: 'stays' });
    expect(parsePath('/', '#/admin')).toEqual({ screen: 'admin', partnerTab: null });
    expect(parsePath('/', '')).toEqual({ screen: 'home' });
    expect(parsePath('/khong-co')).toBeNull();
  });
});
