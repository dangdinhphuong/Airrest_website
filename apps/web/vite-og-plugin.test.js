import { describe, it, expect, beforeEach } from 'vitest';
import {
  escapeHtml,
  getOrigin,
  buildMeta,
  injectMeta,
  getCachedHotel,
  setCachedHotel,
  clearHotelCache,
  DETAIL,
  ID_RE
} from './vite-og-plugin.js';

describe('vite-og-plugin unit tests', () => {
  beforeEach(() => {
    clearHotelCache();
    delete process.env.PUBLIC_WEB_URL;
  });

  describe('escapeHtml', () => {
    it('escape các ký tự đặc biệt & < > " \'', () => {
      const input = 'Khách Sạn & "Resort" <5 Sao> \'Vip\'';
      const output = escapeHtml(input);
      expect(output).toBe('Khách Sạn &amp; &quot;Resort&quot; &lt;5 Sao&gt; &#39;Vip&#39;');
      expect(output).not.toContain('<');
      expect(output).not.toContain('>');
      expect(output).not.toContain('"');
    });

    it('loại bỏ nguy cơ XSS khi tên chứa mã script', () => {
      const xss = '<script>alert("hack")</script>';
      const output = escapeHtml(xss);
      expect(output).toBe('&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;');
      expect(output).not.toContain('<script>');
    });

    it('xử lý chuỗi rỗng hoặc null/undefined', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });

  describe('getOrigin', () => {
    it('ưu tiên biến môi trường PUBLIC_WEB_URL hợp lệ', () => {
      process.env.PUBLIC_WEB_URL = 'https://custom.domain.com/';
      expect(getOrigin({})).toBe('https://custom.domain.com');
    });

    it('dựng từ x-forwarded-proto và x-forwarded-host', () => {
      const req = {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'myhotel.vn'
        }
      };
      expect(getOrigin(req)).toBe('https://myhotel.vn');
    });

    it('chấp nhận http cho localhost', () => {
      const req = {
        headers: {
          'x-forwarded-proto': 'http',
          host: 'localhost:5175'
        }
      };
      expect(getOrigin(req)).toBe('http://localhost:5175');
    });

    it('mặc định là https://airrest.dpdns.org nếu không có thông tin', () => {
      expect(getOrigin({})).toBe('https://airrest.dpdns.org');
    });
  });

  describe('buildMeta', () => {
    it('cắt mô tả dài ở 160 ký tự và loại bỏ ký tự xuống dòng', () => {
      const longDesc = 'Dòng 1: Khách sạn tiện nghi cao cấp gần sân bay quốc tế Nội Bài.\nDòng 2: Phục vụ đưa đón 24/7 với đội xe hiện đại.\nDòng 3: Bữa sáng buffet phong phú và phòng ngủ cách âm tuyệt đối giúp giấc ngủ sâu không bị gián đoạn.';
      const hotel = {
        name: 'Nội Bài Transit Hotel',
        description: longDesc,
        images: [{ url: 'https://cdn.example.com/hotel.jpg' }]
      };

      const meta = buildMeta(hotel, 'https://airrest.dpdns.org', 'test-id-123');
      expect(meta.title).toBe('Nội Bài Transit Hotel — AIRREST');
      expect(meta.description.length).toBeLessThanOrEqual(160);
      expect(meta.description).not.toContain('\n');
      expect(meta.description).not.toContain('\r');
      expect(meta.image).toBe('https://cdn.example.com/hotel.jpg');
      expect(meta.url).toBe('https://airrest.dpdns.org/khach-san/test-id-123');
    });

    it('ghép link tương đối thành link tuyệt đối', () => {
      const hotel = {
        name: 'Cam Ranh Inn',
        description: 'Khách sạn gần biển',
        images: [{ url: '/images/hotels/cam-ranh.jpg' }]
      };
      const meta = buildMeta(hotel, 'https://airrest.dpdns.org', 'cr-1');
      expect(meta.image).toBe('https://airrest.dpdns.org/images/hotels/cam-ranh.jpg');
    });

    it('sử dụng ảnh mặc định nếu không có ảnh hoặc images rỗng', () => {
      const hotel = {
        name: 'Khách Sạn Không Ảnh',
        images: []
      };
      const meta = buildMeta(hotel, 'https://airrest.dpdns.org', 'no-img');
      expect(meta.image).toBe('https://airrest.dpdns.org/images/og-default.jpg');
    });

    it('tự tạo mô tả từ thành phố nếu description để trống', () => {
      const hotel = {
        name: 'Tân Sơn Nhất Express',
        description: '',
        address: { city: 'TP. Hồ Chí Minh' }
      };
      const meta = buildMeta(hotel, 'https://airrest.dpdns.org', 'sgn-1');
      expect(meta.description).toBe('Nơi nghỉ tại TP. Hồ Chí Minh — dịch vụ lưu trú thuận tiện gần sân bay.');
    });

    it('trả về null nếu không có hotel data (API lỗi hoặc không tìm thấy)', () => {
      expect(buildMeta(null)).toBeNull();
    });
  });

  describe('injectMeta', () => {
    const sampleHtml = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Mặc định</title>
  <meta name="description" content="Mô tả mặc định" />
  <meta property="og:title" content="Tiêu đề cũ" />
  <meta property="og:description" content="Mô tả cũ" />
  <meta property="og:url" content="https://old.url/" />
  <meta property="og:image" content="https://old.url/old.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
</head>
<body><div id="root"></div></body>
</html>`;

    it('thay đúng og:title, og:description, og:image, og:url và không tạo thẻ trùng lặp', () => {
      const meta = {
        title: 'Sao Biển Suites — AIRREST',
        description: 'Căn hộ view biển gần sân bay',
        image: 'https://r2.example.com/saobien.jpg',
        url: 'https://airrest.dpdns.org/khach-san/sao-bien-1'
      };

      const result = injectMeta(sampleHtml, meta);

      expect(result).toContain('<title>Sao Biển Suites — AIRREST</title>');
      expect(result).toContain('<meta name="description" content="Căn hộ view biển gần sân bay" />');
      expect(result).toContain('<meta property="og:title" content="Sao Biển Suites — AIRREST" />');
      expect(result).toContain('<meta property="og:description" content="Căn hộ view biển gần sân bay" />');
      expect(result).toContain('<meta property="og:url" content="https://airrest.dpdns.org/khach-san/sao-bien-1" />');
      expect(result).toContain('<meta property="og:image" content="https://r2.example.com/saobien.jpg" />');

      // Kiểm tra không có 2 thẻ og:title hoặc <title>
      const ogTitleMatches = result.match(/property="og:title"/g);
      expect(ogTitleMatches).toHaveLength(1);

      const titleMatches = result.match(/<title>/g);
      expect(titleMatches).toHaveLength(1);
    });

    it('escape ký tự độc hại khi inject', () => {
      const meta = {
        title: 'Khách Sạn <script>alert("xss")</script>',
        description: 'Mô tả "nguy hiểm" & độc hại <b style="color:red">test</b>',
        image: 'https://example.com/img.jpg?a=1&b=2',
        url: 'https://example.com/khach-san/1'
      };

      const result = injectMeta(sampleHtml, meta);
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('&quot;nguy hiểm&quot;');
      expect(result).toContain('&amp;b=2');
    });
  });

  describe('Cache & Routes logic', () => {
    it('lưu và lấy từ cache hợp lệ', () => {
      const fakeHotel = { id: 'h1', name: 'Hotel 1' };
      setCachedHotel('h1', fakeHotel);
      expect(getCachedHotel('h1')).toEqual(fakeHotel);
      expect(getCachedHotel('h2')).toBeNull();
    });

    it('ID_RE khớp định dạng UUID và mã số thông thường', () => {
      expect(ID_RE.test('8706c42c-b69a-427f-bd2d-de2350753826')).toBe(true);
      expect(ID_RE.test('hotel-cam-ranh-01')).toBe(true);
      expect(ID_RE.test('12345')).toBe(true);
      expect(ID_RE.test('')).toBe(false);
      expect(ID_RE.test('invalid/path')).toBe(false);
      expect(ID_RE.test('id_with_underscores_is_not_matched')).toBe(false);
    });
  });
});
