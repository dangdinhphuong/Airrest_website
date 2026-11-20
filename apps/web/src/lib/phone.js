// SĐT Việt Nam hợp lệ: bỏ dấu cách/chấm/gạch, đầu +84/84/0 rồi 9 số, số đầu từ 2 đến 9 (0 và 1 không phải đầu số). Khớp toE164VN của backend (packages/utils).
export const cleanPhone = (s) => String(s ?? '').replace(/[\s.-]/g, '');
export const VN_PHONE = /^(?:\+84|84|0)[2-9]\d{8}$/;
export const isVnPhone = (s) => VN_PHONE.test(cleanPhone(s));
