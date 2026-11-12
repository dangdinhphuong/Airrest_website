// Tài khoản người dùng cuối MÔ PHỎNG: backend chưa có tài khoản hành khách. Chỉ lưu trong bộ nhớ trang, mất khi tải lại.
// Không có tài khoản dựng sẵn: người dùng tự đăng ký. Mật khẩu chỉ để trình diễn, không phải xác thực thật.
export const NAME_MAX = 50;
export const PASSWORD_MIN = 6;
const LOOKS_LIKE_CONTACT = /@|\d{6,}/;

let users = [];
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

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
