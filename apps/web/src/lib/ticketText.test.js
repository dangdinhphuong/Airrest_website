import { describe, expect, it } from 'vitest';
import { parseTicketText } from './ticketText';

const now = new Date(2026, 10, 12);

// Kết quả OCR thật (tesseract.js, ảnh thẻ Vietnam Airlines phóng 3x, chế độ khối văn bản): có lỗi nhận dạng.
const REAL = `wis A A | Vietnam Airlines » BOARDING FASS Economy Vietnam Alrt (eo | MR. HA QUANG DUNG MR. HA QUANG DUNG | From To Date Gate From/To FQTV | Ho Chi Minh(SGN) Da Nang(DAD) 1€ AUG 15 08 SGN/DAD | Departure Time Sest Class Flight Date Time Gate | 8:05 PM 21G E VN 7132 18 AUG 15 8:05PM 08 | Please be at boarding gale PNR SEQ E-Ticket Flight Class Seat | 7:35 PM EWCNTI 11 73824171€0282 VN 7132 6 216 | Boarding gate closes 15 minutes before departure time.`;

describe('parseTicketText', () => {
  it('đọc thẻ thật dù OCR nhầm "16" thành "1€"', () => {
    expect(parseTicketText(REAL, now)).toEqual({ flight: 'VN7132', date: '2015-08-16', from: 'SGN', to: 'DAD', time: '20:05' });
  });
  it('không lẫn "PM 21G" thành số hiệu chuyến bay', () => {
    expect(parseTicketText('Departure 8:05 PM 21G E\n16 AUG 15 VJ 456', now)?.flight).toBe('VJ456');
  });
  it('ngày dạng số và giờ 24h', () => {
    expect(parseTicketText('Flight QH 1234  Date 05/12/2026  Departure 06:40  (HAN) (SGN)', now))
      .toEqual({ flight: 'QH1234', date: '2026-12-05', from: 'HAN', to: 'SGN', time: '06:40' });
  });
  it('thiếu năm thì chọn năm gần hôm nay nhất', () => {
    expect(parseTicketText('VN 218 28 DEC', new Date(2026, 11, 20))?.date).toBe('2026-12-28');
    expect(parseTicketText('VN 218 05 JAN', new Date(2026, 11, 20))?.date).toBe('2027-01-05');
  });
  it('không có giờ khi thiếu nhãn Departure', () => {
    expect(parseTicketText('VN 218 28 DEC 2026 boarding 7:35 PM', now)).not.toHaveProperty('time');
  });
  it('trả null nếu thiếu số hiệu hoặc ngày, hoặc ngày không tồn tại', () => {
    for (const bad of ['', 'hello world', 'VN 218', '31 FEB 2026 VN 218', null]) expect(parseTicketText(bad, now)).toBeNull();
  });
});
