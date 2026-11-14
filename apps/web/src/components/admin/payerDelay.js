// Logic thuần của màn "Chuyến bay delay" (đơn vị chi trả).
export const CATEGORY = { INFANT: 'Em bé', CHILD: 'Trẻ em', ADULT: 'Người lớn' };

// Mặc định chọn hết mọi khách trong mọi nhóm PNR.
export const defaultSelected = (groups) => new Set((groups || []).flatMap((g) => g.passengers.map((p) => p.id)));

export const toggleId = (set, id) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

// Chọn/bỏ cả nhóm: nếu đã chọn đủ thì bỏ hết, ngược lại chọn hết.
export const toggleGroup = (set, group) => {
  const ids = group.passengers.map((p) => p.id);
  const n = new Set(set);
  const all = ids.every((i) => n.has(i));
  ids.forEach((i) => (all ? n.delete(i) : n.add(i)));
  return n;
};

// ---- Đặt phòng theo lô (GĐ2) ----
const ERR = {
  FLIGHT_TIME_UNKNOWN: 'Chuyến bay chưa có giờ bay mới nên chưa tính được giờ ở. Hãy chờ cập nhật giờ bay mới.',
  FLIGHT_NOT_DELAYED: 'Chuyến bay này hiện không ở trạng thái delay.',
  FLIGHT_TOO_SOON: 'Giờ bay mới còn quá gần, không đủ thời gian để đặt phòng nghỉ.',
  PAX_ALREADY_PLACED: 'Có hành khách đã được xếp phòng ở một lô khác. Hãy bỏ chọn họ rồi thử lại.',
  OFFER_NOT_CONFIRMED: 'Phòng của khách này chưa được khách sạn xác nhận nên chưa gửi email được.',
  PASSENGER_EMAIL_REQUIRED: 'Khách chưa có email. Hãy nhập email trước khi gửi lại.',
  RESEND_LIMIT: 'Đã gửi lại quá 3 lần trong 1 giờ. Vui lòng thử lại sau.',
  PAX_PHONE_REQUIRED: 'Người đại diện chưa có số điện thoại. Hãy nhập số điện thoại trước khi đặt.',
  UPGRADE_NOT_ALLOWED: 'Đơn vị của bạn chưa được phép nâng hạng phòng.',
  UPGRADE_NOT_AVAILABLE: 'Hạng phòng đã chọn không nâng được cho phòng này. Hãy xem lại phương án rồi chọn lại.',
  UPGRADE_UNIT_UNKNOWN: 'Phòng cần nâng hạng không còn trong phương án. Hãy mở lại phương án đặt phòng.',
  UPGRADE_DUPLICATE: 'Một phòng chỉ được nâng hạng một lần.',
  UPGRADE_NO_ROOM: 'Hạng phòng cao hơn đã hết phòng nên chưa đặt gì cả. Hãy chọn hạng khác hoặc đặt hạng chuẩn.',
  NO_EXTENSION_PROPOSED: 'Hiện không có đề xuất gia hạn nào đang chờ gửi (có thể đã gửi rồi hoặc giờ bay đã đổi lại).',
};
// Mã lỗi nghiệp vụ -> tiếng Việt; không có thì null để nơi gọi dùng errText chung (gồm 422 theo trường).
export const delayErrText = (e) => ERR[e?.code] || null;

export const UNPLACED_REASON = {
  CHILD_WITHOUT_ADULT: 'Trẻ em không có người lớn đi cùng',
  NO_ROOM_FOR_CLUSTER: 'Không đủ phòng cho cả cụm (cần ở cùng khách sạn, sát nhau)',
  NO_ROOM: 'Không còn phòng phù hợp',
  UPGRADE_NO_ROOM: 'Hạng phòng nâng vừa hết phòng nên chưa đặt (không tự hạ về hạng chuẩn). Hãy đặt lại',
};
export const unplacedReason = (r) => UNPLACED_REASON[r] || r || 'Cần xử lý tay';

// Gom trạng thái lô: phòng đang chờ / đang chuyển (chờ nhưng đã bị chuyển ≥1 lần) / đã xác nhận / nhóm cần xử lý tay.
export function batchSummary(batch) {
  const offers = batch?.offers || [];
  const pend = offers.filter((o) => o.status === 'PENDING');
  const transferring = pend.filter((o) => (o.transferCount || 0) > 0).length;
  return {
    waiting: pend.length - transferring,
    transferring,
    confirmed: offers.filter((o) => o.status === 'CONFIRMED').length,
    failedGroups: (batch?.groups || []).filter((g) => g.status === 'FAILED').length,
    unplaced: (batch?.unplaced || []).length,
  };
}

export const OFFER_STATUS = { PENDING: ['Đang chờ khách sạn', 'warn'], CONFIRMED: ['Đã xác nhận', 'ok'], REJECTED: ['Khách sạn từ chối', 'error'], EXPIRED: ['Hết hạn', 'neutral'], CANCELLED: ['Đã hủy', 'neutral'] };

// ---- Điểm đón ở sân bay ----
// Danh sách điểm đón hợp lệ từ API (mảng chuỗi không rỗng) hoặc null nếu không dùng được -> ẩn ô chọn.
export const pickupOptions = (res) => {
  const items = Array.isArray(res?.items) ? res.items.filter((x) => typeof x === 'string' && x) : [];
  return items.length ? items : null;
};
// Điểm đón mặc định: `default` nếu nằm trong danh sách, ngược lại điểm đầu tiên.
export const defaultPickup = (res) => { const o = pickupOptions(res); return o ? (o.includes(res.default) ? res.default : o[0]) : ''; };
// Lỗi PICKUP_POINT_INVALID kèm danh sách điểm đón được phép (details.allowed).
export const pickupErrText = (e) => {
  if (e?.code !== 'PICKUP_POINT_INVALID') return null;
  const a = e.details?.allowed;
  return `Điểm đón không hợp lệ cho sân bay này.${Array.isArray(a) && a.length ? ` Chọn một trong: ${a.join(', ')}.` : ''}`;
};

// Mã nhóm NH-… để hiện cho nhân viên (cảnh báo realtime chỉ có groupId); không tra được thì rút gọn UUID.
export const groupLabel = (batch, groupId) => batch?.groups?.find((g) => g.id === groupId)?.code || (groupId ? String(groupId).slice(0, 8) : '—');

// ---- Nâng hạng phòng (khách tự thanh toán phần chênh với đơn vị chi trả; Airrest không thu khách) ----
// choices: { [unitKey]: roomTypeId } -> body `upgrades` của POST /batches; rỗng thì undefined (không gửi).
export const upgradesPayload = (choices) => {
  const list = Object.entries(choices || {}).filter(([, t]) => t).map(([unitKey, roomTypeId]) => ({ unitKey, roomTypeId }));
  return list.length ? list : undefined;
};
// Phòng có ô nâng hạng khi payer cho phép VÀ có ít nhất một hạng.
export const roomUpgradeOptions = (unit, room) => (unit?.canUpgrade && Array.isArray(room?.upgradeOptions) ? room.upgradeOptions : []);
export const chosenUpgrade = (room, choices) => roomUpgradeOptions({ canUpgrade: true }, room).find((o) => o.roomTypeId === choices?.[room.unitKey]) || null;
// Tổng phần chênh nâng hạng của các lựa chọn hiện tại.
export const upgradeTotal = (units, choices) => (units || []).reduce((s, u) => s + u.rooms.reduce((t, r) => t + (chosenUpgrade(r, choices)?.deltaVnd || 0), 0), 0);
// Chỉ giữ lựa chọn còn hợp lệ với phương án mới (sau khi tải lại preview).
export const pruneChoices = (units, choices) => Object.fromEntries((units || []).flatMap((u) => u.rooms.filter((r) => chosenUpgrade(r, choices)).map((r) => [r.unitKey, choices[r.unitKey]])));
export const vnd = (n) => `${new Intl.NumberFormat('vi-VN').format(n)}đ`;
export const upgradeLabel = (o) => `${o.roomTypeName} (+${vnd(o.deltaVnd)})`;

// ---- Cảnh báo đổi giờ bay + gia hạn ----
// Cảnh báo realtime (delay:alert) -> { tone: 'error' đỏ | 'warn' cam, title, text } tiếng Việt. group = mã nhóm NH-…
const ALERTS = {
  DELAY_TRANSFER_FAILED: ['error', 'Chuyển khách sạn thất bại', (g) => `Nhóm ${g} không chuyển được sang khách sạn khác. Cần xử lý tay.`],
  FLIGHT_DELAYED_LATER: ['warn', 'Chuyến bay bị lùi giờ', (g) => `Chuyến bay của nhóm ${g} bay muộn hơn giờ khách phải rời khách sạn. Cần gia hạn phòng: bấm "Gửi yêu cầu gia hạn cho khách sạn".`],
  FLIGHT_EARLIER_URGENT: ['error', 'Chuyến bay được đưa lên sớm', (g) => `Chuyến bay của nhóm ${g} bay sớm hơn dự kiến, khách phải ra sân bay sớm hơn. Hãy liên hệ khách ngay.`],
  FLIGHT_CANCELLED: ['error', 'Chuyến bay đã hủy', (g) => `Chuyến bay của nhóm ${g} đã bị hủy. Hãy xử lý phòng và xe của nhóm này.`],
  FLIGHT_TIME_UNKNOWN: ['warn', 'Chưa có giờ bay mới', (g) => `Chuyến bay của nhóm ${g} chưa có giờ bay mới nên chưa tính được giờ rời khách sạn. Hãy theo dõi cập nhật.`],
  EXTENSION_NO_ROOM: ['error', 'Khách sạn hết phòng để gia hạn', (g) => `Khách sạn không còn phòng trong khung gia hạn của nhóm ${g}. Hãy đổi khách sạn hoặc đưa khách ra sân bay.`],
  EXTENSION_REJECTED: ['error', 'Khách sạn từ chối gia hạn', (g) => `Khách sạn đã từ chối gia hạn cho nhóm ${g}. Hãy xử lý tay: đổi khách sạn hoặc đưa khách ra sân bay.`],
  UPGRADE_CANCELLED: ['warn', 'Nâng hạng đã bị hủy', (g) => `Nâng hạng của nhóm ${g} đã bị hủy do đổi khách sạn. Khách ở hạng chuẩn của khách sạn mới; hãy báo khách.`],
};
export function alertView(a, batch) {
  const def = ALERTS[a?.kind];
  const g = groupLabel(batch, a?.groupId);
  if (!def) return { tone: 'warn', title: 'Cảnh báo', text: `Nhóm ${g}: ${a?.reason || a?.kind || 'cần kiểm tra'}.` };
  return { tone: def[0], title: def[1], text: def[2](g) };
}
// Thêm cảnh báo mới vào danh sách: cùng (kind, offerId|groupId) thì thay bản cũ, tối đa 20.
export const pushAlert = (list, a) => [a, ...list.filter((x) => !(x.kind === a.kind && (x.offerId || x.groupId) === (a.offerId || a.groupId)))].slice(0, 20);

// Trạng thái gia hạn của từng phòng (theo dữ liệu lô, còn nguyên khi tải lại trang).
export const EXTENSION_STATUS = { PROPOSED: ['Cần gia hạn: chưa gửi khách sạn', 'warn'], REQUESTED: ['Chờ khách sạn đồng ý gia hạn', 'warn'], ACCEPTED: ['Khách sạn đã gia hạn', 'ok'], REJECTED: ['Khách sạn từ chối gia hạn', 'error'] };
export const extensionLabel = (o) => EXTENSION_STATUS[o?.extensionStatus] || null;
// Có phòng đã xác nhận đang chờ quầy gửi yêu cầu gia hạn (nút "Gửi yêu cầu gia hạn cho khách sạn").
export const proposedOfferIds = (batch) => (batch?.offers || []).filter((o) => o.status === 'CONFIRMED' && o.extensionStatus === 'PROPOSED').map((o) => o.id);
export const hasExtensionAlert = (alerts) => (alerts || []).some((a) => a.kind === 'FLIGHT_DELAYED_LATER');
