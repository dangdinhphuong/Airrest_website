import { describe, expect, it } from 'vitest';
import { pay } from './Bookings';
import { quoteText } from './Changes';

describe('nhãn cổng hotel portal', () => {
  it('thanh toán MoMo không bị hiện thành "tại khách sạn"', () => {
    expect(pay({ method: 'MOMO', status: 'PAID' })).toBe('MoMo · Đã thanh toán');
    expect(pay({ method: 'VNPAY', status: 'PENDING' })).toBe('VNPay · Chờ thanh toán');
    expect(pay({ method: 'AT_HOTEL', status: 'UNPAID' })).toBe('Thanh toán tại khách sạn · Chưa thanh toán');
  });
  it('báo giá yêu cầu đổi ngày / hủy hiện số đêm, tổng mới, chênh lệch', () => {
    expect(quoteText({ kind: 'CHANGE', newNights: 3, newTotalVnd: 10_832_000, diffVnd: 3_529_000 })).toBe('3 đêm, tổng mới 10.832.000đ (+3.529.000đ)');
    expect(quoteText({ kind: 'CANCEL', keepVnd: 240_000, refundVnd: 8_124_000 })).toBe('Giữ 240.000đ, hoàn 8.124.000đ');
    expect(quoteText(undefined)).toBe('');
  });
});
