// Chuẩn hóa SĐT Việt Nam về E.164 (+84...). Trả null nếu không hợp lệ.
export function toE164VN(input: string): string | null {
  const s = input.replace(/[\s.-]/g, '');
  const m = /^(?:\+84|84|0)(\d{9})$/.exec(s);
  return m ? `+84${m[1]}` : null;
}
