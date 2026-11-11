// Nội dung quyền lợi THAM KHẢO (EXTERNALLY_RESEARCHED), chưa được PO phê duyệt — MVP: MB-03 và MB-20 đang Blocked.
// Nguồn: Nghị định 208/2026/NĐ-CP (Điều 36, 39, 40) và Thông tư 48/2026/TT-BXD (Điều 5), ngày truy cập 2026-10-26.
// Đây là cấu hình, không hard-code trong giao diện (NFR-009). Airrest KHÔNG xác định quyền lợi của người dùng.
export const RIGHTS = {
  effectiveFrom: '01/7/2026',
  accessed: '26/10/2026',
  sources: [
    { id: 'nd208', label: 'Nghị định 208/2026/NĐ-CP', url: 'https://vanban.chinhphu.vn/?docid=218453&pageid=27160' },
    { id: 'tt48', label: 'Thông tư 48/2026/TT-BXD', url: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/7/48-bxd.signed.pdf' },
  ],
  // Chậm chuyến: tính theo số giờ chậm so với lịch bay căn cứ (Điều 36).
  delay: [
    { hours: 2, title: 'Nước uống hoặc phiếu (voucher) tương đương', cite: 'Điều 36 khoản 4a', needsFault: false },
    { hours: 3, title: 'Đồ ăn hoặc phiếu (voucher) tương đương', cite: 'Điều 36 khoản 5', needsFault: false },
    { hours: 4, title: 'Hoàn vé nếu hành khách không đồng ý phương án đổi; bồi thường ứng trước không hoàn lại', cite: 'Điều 36 khoản 6', needsFault: true,
      cond: 'Hoàn vé và bồi thường chỉ áp dụng khi chậm do lỗi của người vận chuyển (khoản 6d).' },
    { hours: 6, title: 'Nơi nghỉ phù hợp (7h–22h) hoặc chỗ ngủ, nghỉ / giải pháp thay thế nếu hành khách đồng ý (22h–7h)', cite: 'Điều 36 khoản 7', needsFault: false,
      cond: 'Không áp dụng nếu hành khách chấp nhận hoàn vé (khoản 7c).' },
  ],
  // Hủy chuyến: tính theo thời gian chờ tại cảng (Điều 39 khoản 3).
  cancel: [
    { hours: 0, title: 'Hãng thông báo, xin lỗi và nêu lý do; nếu lỗi hãng: đổi hành trình hoặc hoàn tiền vé', cite: 'Điều 39 khoản 3a–3b', needsFault: true },
    { hours: 2, title: 'Nước uống hoặc phiếu tương đương (chờ tại cảng ≥2 giờ)', cite: 'Điều 39 khoản 3c', needsFault: false },
    { hours: 3, title: 'Đồ ăn và nước uống hoặc phiếu tương đương (chờ tại cảng ≥3 giờ)', cite: 'Điều 39 khoản 3c', needsFault: false },
    { hours: 6, title: 'Nơi ở phù hợp theo khung giờ như Điều 36 khoản 7 (chờ tại cảng ≥6 giờ)', cite: 'Điều 39 khoản 3c', needsFault: false,
      cond: 'Trừ khi do lỗi của hành khách hoặc hành khách đã yêu cầu hoàn vé.' },
  ],
  // Điều kiện chung của nghĩa vụ ăn, uống, nghỉ.
  passengerConditions: [
    'Có vé, đã được xác nhận chỗ và có mặt tại cảng hàng không (Điều 36 khoản 8).',
    'Không áp dụng nếu hành khách chấp nhận hoàn vé (Điều 36 khoản 7c).',
  ],
  // Bồi thường ứng trước nội địa (TT 48 Điều 5.1) — chỉ hiển thị như thông tin tham khảo.
  compensationDomestic: [
    { label: 'Dưới 500 km', amount: '220.000đ' },
    { label: 'Từ 500 km đến dưới 1.000 km', amount: '330.000đ' },
    { label: 'Từ 1.000 km trở lên', amount: '440.000đ' },
  ],
  exemptionNote: 'Điều 40 liệt kê các trường hợp được miễn trừ bồi thường ứng trước (ví dụ điều kiện thời tiết, nguy cơ an ninh). Airrest không xác định các trường hợp này.',
};
