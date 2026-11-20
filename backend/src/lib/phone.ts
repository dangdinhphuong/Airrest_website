// Chuẩn hóa SĐT Việt Nam về E.164 (+84...). Trả null nếu không hợp lệ.
export function toE164VN(input: string): string | null {
  const s = input.replace(/[\s.-]/g, '');
  const m = /^(?:\+84|84|0)([2-9]\d{8})$/.exec(s); // số đầu 2-9: 0 và 1 không phải đầu số quốc nội (chặn 0000000000, 0123456789)
  return m ? `+84${m[1]}` : null;
}
