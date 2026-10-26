// D1 — dữ liệu chuyến bay MÔ PHỎNG (20 chuyến). Không phải dữ liệu thật; không gọi hệ thống hãng/sân bay.
// Thời gian tính bằng phút tuyệt đối từ 00:00 hôm nay (ngày 0). `now` là giờ mô phỏng khi mở kịch bản.
// scenario (L2, D-17 phương án A: kịch bản chọn trước theo chuyến bay): approve | reject | hotelfull | noreply
const H = (h, m = 0) => h * 60 + m;

const mk = (code, o) => ({
  code, origin: 'HAN', dest: 'SGN', dayOffset: 0, status: 'delayed', cause: 'airline', distanceKm: 1160,
  scenario: 'approve', airline: 'Hãng mô phỏng', ...o,
});

export const FLIGHTS = [
  mk('VN218', { schedDep: H(23, 20), newDep: H(30), now: H(23, 8), updatedAt: H(23, 8), scenario: 'approve' }), // chậm qua đêm
  mk('VJ456', { origin: 'SGN', dest: 'HAN', schedDep: H(23), newDep: H(30), now: H(23, 10), updatedAt: H(23, 5), scenario: 'hotelfull' }),
  mk('QH321', { status: 'cancelled', schedDep: H(21), newDep: null, cancelledAt: H(21, 5), now: H(21, 40), updatedAt: H(21, 30), scenario: 'reject' }),
  mk('VN111', { schedDep: H(22), newDep: H(29), cause: 'force', now: H(22, 40), updatedAt: H(22, 35), scenario: 'reject' }), // bất khả kháng (mô phỏng)
  mk('VN123', { schedDep: H(10), newDep: H(12), now: H(10, 30), updatedAt: H(10, 20), distanceKm: 1160 }),   // chậm 2 giờ ban ngày
  mk('VJ789', { origin: 'SGN', dest: 'HAN', schedDep: H(13), newDep: H(17, 30), now: H(13, 40), updatedAt: H(13, 30) }),
  mk('QH555', { schedDep: H(19), newDep: null, status: 'delayed', cause: 'unknown', now: H(19, 20), updatedAt: H(19, 15), unknownTime: true, scenario: 'noreply' }), // chưa biết giờ mới
  mk('VN300', { schedDep: H(18), newDep: H(18), status: 'ontime', cause: 'unknown', now: H(17, 30), updatedAt: H(17, 25) }),   // đúng giờ
  mk('VJ222', { origin: 'SGN', dest: 'HAN', schedDep: H(22, 30), newDep: H(26), cause: 'unknown', now: H(22, 50), updatedAt: H(22, 45) }), // nguyên nhân chưa rõ
  mk('VN401', { schedDep: H(20), newDep: H(25), now: H(20, 30), updatedAt: H(20, 25), distanceKm: 450 }),
  mk('VJ610', { origin: 'SGN', dest: 'HAN', schedDep: H(21, 15), newDep: H(28, 30), now: H(21, 50), updatedAt: H(21, 40), scenario: 'approve' }),
  mk('QH120', { schedDep: H(6), newDep: H(9, 30), dayOffset: 1, now: H(30), updatedAt: H(29, 50) }),
  mk('VN500', { schedDep: H(15), newDep: H(15, 40), now: H(15, 10), updatedAt: H(15, 5) }),                                   // chậm 40 phút
  mk('VJ815', { origin: 'SGN', dest: 'HAN', status: 'cancelled', schedDep: H(23, 30), newDep: null, cancelledAt: H(22, 30), now: H(23, 10), updatedAt: H(23, 0), cause: 'unknown', scenario: 'hotelfull' }),
  mk('VN702', { schedDep: H(5), newDep: H(11), dayOffset: -1, now: H(-12), updatedAt: H(-12, 10) }),
  mk('QH777', { schedDep: H(23, 45), newDep: H(27, 10), now: H(23, 50), updatedAt: H(23, 40), scenario: 'approve', cause: 'airline' }),
  mk('VJ930', { origin: 'SGN', dest: 'HAN', schedDep: H(12), newDep: H(16, 30), now: H(12, 20), updatedAt: H(12, 10) }),
  mk('VN850', { schedDep: H(22, 10), newDep: H(28), now: H(22, 30), updatedAt: H(22, 20), scenario: 'noreply' }),
  mk('QH909', { origin: 'SGN', dest: 'HAN', schedDep: H(20, 30), newDep: H(24, 30), now: H(20, 50), updatedAt: H(20, 45) }),
  mk('VJ100', { schedDep: H(8), newDep: H(8), status: 'ontime', now: H(7), updatedAt: H(6, 50) }),
];

export const SAMPLE_CODES = ['VN218', 'VJ456', 'QH321', 'VN111', 'VN123', 'QH555', 'VN300'];
export const ERROR_CODE = 'ER500'; // mã mô phỏng lỗi dịch vụ dữ liệu
