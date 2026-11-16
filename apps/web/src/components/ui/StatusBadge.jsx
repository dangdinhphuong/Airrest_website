import React from 'react';

// Tag/nhãn màu. tone: ok | warn | error | info | neutral.
export const Tag = ({ tone = 'neutral', children, ...r }) => <span className={`pill pill-${tone}`} {...r}>{children}</span>;

// Nhãn tiếng Việt + tông màu cho các trạng thái backend trả về: [nhãn, tone].
export const STATUS = {
  PENDING_PAYMENT: ['Chờ thanh toán', 'warn'], PENDING: ['Chờ xác nhận', 'warn'], CONFIRMED: ['Đã xác nhận', 'ok'], CHECKED_IN: ['Đang ở', 'info'],
  CHECKED_OUT: ['Đã trả phòng', 'neutral'], CANCELLED: ['Đã hủy', 'neutral'], REJECTED: ['Đã từ chối', 'error'], EXPIRED: ['Hết hạn', 'neutral'], NO_SHOW: ['Không đến', 'error'],
  APPROVED: ['Đã duyệt', 'ok'], REQUESTED: ['Chờ phân xe', 'warn'], ASSIGNED: ['Đã phân xe', 'info'], DONE: ['Hoàn tất', 'ok'],
};

// Badge trạng thái: tra `map` (mặc định STATUS); không có thì hiện nguyên mã, tone neutral.
export function StatusBadge({ status, map = STATUS }) {
  const [text, tone] = map[status] || [status, 'neutral'];
  return <Tag tone={tone}>{text}</Tag>;
}
