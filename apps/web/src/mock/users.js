// Tài khoản người dùng cuối MÔ PHỎNG (ngoài MVP: MB-16 đã loại; Proposed, chưa được PO duyệt — xem PRODUCT_DECISION_REGISTER D-30).
// Chỉ lưu trong bộ nhớ trang, mất khi tải lại (D-18 phương án A). Không thu email/SĐT (BR-002). Mật khẩu chỉ để trình diễn, không phải xác thực thật.
export const DEMO_PASSWORD = 'Demo@2026';
export const NAME_MAX = 50;
export const PASSWORD_MIN = 6;
const LOOKS_LIKE_CONTACT = /@|\d{6,}/;

let users = [{ name: 'nguoidung', password: DEMO_PASSWORD, seed: true }];
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const demoUsers = () => users.filter((u) => u.seed).map((u) => u.name);
export const userExists = (name) => users.some((u) => same(u.name, name));

export function validateRegister({ name, password, confirm }, reservedNames = []) {
  const n = (name || '').trim();
  const errors = {};
  if (!n) errors.name = 'Nhập tên gọi.';
  else if (n.length > NAME_MAX) errors.name = `Tên gọi tối đa ${NAME_MAX} ký tự.`;
  else if (LOOKS_LIKE_CONTACT.test(n)) errors.name = 'Không nhập email hoặc số điện thoại. Airrest không thu thông tin liên hệ (BR-002).';
  else if (userExists(n) || reservedNames.some((r) => same(r, n))) errors.name = 'Tên gọi này đã được dùng. Chọn tên khác.';
  if (!password) errors.password = 'Nhập mật khẩu.';
  else if (password.length < PASSWORD_MIN) errors.password = `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự.`;
  if (!errors.password && password !== confirm) errors.confirm = 'Mật khẩu nhập lại không khớp.';
  return errors;
}

export function registerUser({ name, password }) {
  const u = { name: name.trim(), password, seed: false };
  users = [...users, u];
  return { name: u.name };
}

export function loginUser(name, password) {
  const u = users.find((x) => same(x.name, name));
  if (!u || u.password !== password) return { ok: false, error: 'Sai tên đăng nhập hoặc mật khẩu.' };
  return { ok: true, user: { name: u.name } };
}
