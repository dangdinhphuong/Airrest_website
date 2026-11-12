// Kiểm tra bộ phân tích câu hỏi và lọc nơi nghỉ của trợ lý chat (phần thuần, không gọi API).
// Chạy: npx vitest run apps/web/src/screens/user/botEngine.test.js (từ thư mục gốc monorepo)
import { describe, expect, it } from 'vitest';
import { detectAirport, filterHotels, parseQuery } from './botEngine';
import { parseTrack } from './data';

const AP = [
  { iata: 'HAN', name: 'Nội Bài', city: 'Hà Nội' }, { iata: 'SGN', name: 'Tân Sơn Nhất', city: 'TP.HCM' },
  { iata: 'CXR', name: 'Cam Ranh', city: 'Khánh Hòa (Nha Trang)' }, { iata: 'PQC', name: 'Phú Quốc', city: 'Kiên Giang (Phú Quốc)' },
];

describe('detectAirport', () => {
  it('nhận theo tên sân bay, tỉnh/thành, bí danh và mã IATA viết hoa', () => {
    expect(detectAirport('phòng gần Cam Ranh', AP, 'HAN')).toBe('CXR');
    expect(detectAirport('khách sạn ở Nha Trang', AP, 'HAN')).toBe('CXR');
    expect(detectAirport('gần sân bay Sài Gòn', AP, 'HAN')).toBe('SGN');
    expect(detectAirport('tìm phòng gần PQC', AP, 'HAN')).toBe('PQC');
  });
  it('mã IATA viết thường không tính ("hạn" không thành HAN) và rơi về mặc định', () => {
    expect(detectAirport('còn hạn không', AP, 'SGN')).toBe('SGN');
    expect(detectAirport('tìm phòng', AP, 'PQC')).toBe('PQC');
  });
});

describe('parseQuery', () => {
  it('đọc sân bay, giá, km và cờ lọc', () => {
    expect(parseQuery('Tìm phòng gần Tân Sơn Nhất dưới 700k trong 5km có xe đưa đón', 'HAN', AP)).toEqual({ airport: 'SGN', maxPrice: 700000, maxKm: 5, flags: ['shuttle'] });
  });
  it('"dưới 5 km" là khoảng cách, không phải giá', () => {
    const q = parseQuery('khách sạn dưới 5 km');
    expect(q.maxKm).toBe(5); expect(q.maxPrice).toBeNull();
  });
  it('các cách viết giá', () => {
    expect(parseQuery('dưới 700.000').maxPrice).toBe(700000);
    expect(parseQuery('dưới 1,5 triệu').maxPrice).toBe(1500000);
    expect(parseQuery('dưới 700').maxPrice).toBe(700000);
    expect(parseQuery('phòng giá rẻ').maxPrice).toBe(700000);
  });
  it('mặc định sân bay khi không nhắc', () => { expect(parseQuery('tìm phòng', 'SGN', AP).airport).toBe('SGN'); });
});

describe('parseTrack', () => {
  it('tách mã và số điện thoại trong một chuỗi', () => {
    expect(parseTrack('ar-7k3m9p2q 0912 345 678')).toEqual({ ref: 'ar-7k3m9p2q', phone: '0912 345 678' });
  });
  it('thiếu phần nào thì phần đó null', () => {
    expect(parseTrack('AR-7K3M9P2Q')).toEqual({ ref: 'AR-7K3M9P2Q', phone: null });
    expect(parseTrack('0912345678')).toEqual({ ref: null, phone: '0912345678' });
  });
  it('số ngắn (giá, ngày) không bị nhầm là số điện thoại', () => {
    expect(parseTrack('dưới 700.000đ ngày 12/11/2026')).toEqual({ ref: null, phone: null });
    expect(parseTrack('abc xyz')).toEqual({ ref: null, phone: null });
  });
});

describe('filterHotels', () => {
  const h = (id, price, km, min, left, extra = {}) => ({ id, travelMinutes: min, distanceKm: km, shuttleAvailable: false, freeCancel: false, hourly: false, familyRoom: false, reception24: false, rating: '7.0', room: { price, availableRooms: left }, ...extra });
  const list = [h('a', 600000, 4, 12, 2, { freeCancel: true }), h('b', 800000, 3, 8, 1, { freeCancel: true }), h('c', 500000, 2, 5, 0, { freeCancel: true }), h('d', 450000, 6, 20, 3)];
  const q = (o) => ({ airport: 'HAN', maxPrice: null, maxKm: null, flags: [], ...o });
  it('bỏ nơi hết phòng và sắp theo gần sân bay', () => { expect(filterHotels(list, q({})).map((x) => x.id)).toEqual(['b', 'a', 'd']); });
  it('giá, km và cờ kết hợp "và"', () => {
    expect(filterHotels(list, q({ maxPrice: 700000, flags: ['freeCancel'] })).map((x) => x.id)).toEqual(['a']);
    expect(filterHotels(list, q({ maxKm: 3 })).map((x) => x.id)).toEqual(['b']);
  });
});
