// Công tắc tính năng đọc từ biến môi trường của web (VITE_*, nằm ở apps/web/.env). Không đặt biến thì giữ mặc định.
// Chỉ các giá trị false/0/off/no/disabled (không phân biệt hoa thường) mới tắt; mọi giá trị khác (kể cả gõ sai) là bật, để lỡ tay không vô tình làm mất tính năng.
export const parseFlag = (value, fallback = true) => {
  if (value == null || String(value).trim() === '') return fallback;
  return !/^(false|0|off|no|disabled)$/i.test(String(value).trim());
};

// Bật/tắt toàn bộ trợ lý chat (bong bóng robot + khung chat). Muốn tắt AI nhưng giữ chatbot từ khóa thì dùng AI_CHAT_ENABLED ở backend/.env.
export const CHATBOT_ENABLED = parseFlag(import.meta.env.VITE_CHATBOT_ENABLED, true);
