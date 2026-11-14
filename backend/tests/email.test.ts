import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '../services/email/outbox';
import { maskEmail } from '../services/email/transport';
import { groupSummaryEmail, roomChangedEmail, roomConfirmedEmail, type RoomEmailData } from '../services/email/templates/delayBooking';

const data = (o: Partial<RoomEmailData> = {}): RoomEmailData => ({
  guestName: '<b>Nguyễn</b> & Co', offerStatus: 'CONFIRMED', bookingCode: 'AR-123',
  hotel: { name: 'KS "Sao" <x>', address: '1 Phố A', phone: '0243000111' }, roomNumber: '305',
  checkInAt: new Date('2026-11-14T10:30:00Z'), checkoutAt: new Date('2026-11-14T21:00:00Z'),
  pickup: { at: new Date('2026-11-14T10:00:00Z'), location: 'Cổng T1' }, returnTrip: { at: new Date('2026-11-14T21:15:00Z') }, ...o,
});

describe('email: validate + che email', () => {
  it('chuẩn hóa và từ chối địa chỉ sai', () => {
    expect(normalizeEmail('  A.B@Gmail.COM ')).toBe('a.b@gmail.com');
    for (const bad of ['', 'abc', 'a@', '@b.com', 'a b@c.com']) expect(() => normalizeEmail(bad)).toThrow(/không hợp lệ/);
  });
  it('maskEmail che phần tên', () => expect(maskEmail('nguyenvan@gmail.com')).toBe('n***@gmail.com'));
});

describe('email: mẫu thư', () => {
  it('roomConfirmedEmail đủ trường, giờ VN, escape HTML', () => {
    const m = roomConfirmedEmail(data());
    for (const s of ['AR-123', '1 Phố A', '0243000111', '305', 'Cổng T1', '17:30 14/11/2026', '04:00 15/11/2026', 'không phải trả phí', 'số điện thoại']) expect(m.text).toContain(s);
    expect(m.html).toContain('&lt;b&gt;Nguyễn&lt;/b&gt; &amp; Co');
    expect(m.html).toContain('KS &quot;Sao&quot; &lt;x&gt;');
    expect(m.html).not.toContain('<b>Nguyễn');
  });
  it('roomChangedEmail cũng đủ trường', () => expect(roomChangedEmail(data(), { hotelName: 'KS Cũ' }).text).toContain('KS Cũ'));
  it('từ chối offer chưa CONFIRMED', () => {
    for (const st of ['PENDING', 'REJECTED', 'EXPIRED', 'CANCELLED']) {
      expect(() => roomConfirmedEmail(data({ offerStatus: st }))).toThrow(/chưa xác nhận/);
      expect(() => roomChangedEmail(data({ offerStatus: st }))).toThrow(/chưa xác nhận/);
    }
  });
  it('groupSummaryEmail: phòng chờ không lộ chi tiết, cần >=1 phòng xác nhận, escape', () => {
    const m = groupSummaryEmail({ representativeName: 'Đại diện', groupCode: 'NH-ABCD1234', rows: [
      { guestName: 'A <i>', status: 'CONFIRMED', hotelName: 'KS Sao', roomNumber: '101', bookingCode: 'AR-1' },
      { guestName: 'B', status: 'PENDING', hotelName: 'KS Bí mật' },
    ] });
    expect(m.subject).toContain('1/2');
    expect(m.text).toContain('Đang chờ khách sạn xác nhận');
    expect(m.text + m.html).not.toContain('Bí mật');
    expect(m.html).toContain('A &lt;i&gt;');
    expect(() => groupSummaryEmail({ representativeName: 'X', groupCode: 'NH-ABCD1234', rows: [{ guestName: 'B', status: 'PENDING' }] })).toThrow(/chưa có phòng nào/);
  });
});
