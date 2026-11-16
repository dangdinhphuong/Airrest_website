// Nhóm các mục nav (hotelNav/adminNav) thành cây theo trường `group`; tìm không dấu.
export const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
export const matchesVi = (text, q) => plain(text).includes(plain(q).trim());

export function groupNav(items) {
  const out = [];
  for (const i of items) {
    const key = i.group || 'Chức năng';
    let g = out.find((x) => x.key === key);
    if (!g) { g = { key, label: key, items: [] }; out.push(g); }
    g.items.push(i);
  }
  return out;
}

// Lọc cây theo từ khóa (khớp tên mục hoặc tên nhóm); nhóm không còn mục nào bị bỏ.
export function filterGroups(groups, q) {
  if (!q.trim()) return groups;
  return groups.map((g) => ({ ...g, items: matchesVi(g.label, q) ? g.items : g.items.filter((i) => matchesVi(i.label, q)) })).filter((g) => g.items.length);
}
