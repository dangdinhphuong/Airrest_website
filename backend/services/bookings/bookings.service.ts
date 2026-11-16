import { randomUUID } from 'node:crypto';
import { canBook, hourlyOf, hourlyPrice, hourlyViolation, hourlyWindow, isActive, nonRefundableNightVnd, serviceFee, type Interval } from '@airrest/business-logic';
import type { BookingQuoteBody, CreateBookingBody, StaffListQuery } from '@airrest/validation';
import { PERM } from '../../config/permissions';
import { env } from '../../config/env';
import { db, json, withTransaction } from '../../database/pg';
import { bookingFromRow, type Actor, type BookingDecisionDoc, type BookingDoc, type BookingStatus, type HotelDoc, type RoomTypeDoc } from '../../database/types';
import { generateBookingCode } from '../../lib/codes';
import { AppError, isDuplicateKey } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { escapeLike } from '../../lib/zod';
import { intervalsForCheck, loadActiveIntervals } from '../rooms/availability';
import { newGatewayOrder } from '../../lib/momo';
import { vnpDate, vnpKeys } from '../../lib/vnpay';
import { actorOf, writeAudit } from '../audit';
import { hotelScope } from '../scope';
import { getDecision, lazyExpire } from './decisions';
import { emitBookingChange } from '../events';
import { publishBookingStatus } from '../shuttle/events';
import { getConfig } from '../systemConfig';
import { hotelFeatures } from '../hotels/catalog';
import { dispatchDueForBooking } from '../shuttle/dispatch';
import { priceLeg } from '../shuttle/pricing';
import { logBookingEvent } from './bookingEvents';

const DAY_MS = 24 * 3600 * 1000;
export const approvalHoldMs = async (): Promise<number> => (await getConfig('booking.hold')).value.approvalExpireMin * 60_000;
export const HOLD_MS = 20 * 60_000; // đơn chờ khách sạn duyệt: giữ phòng 20 phút (BA §3.3, P-04)

// Khách vãng lai chỉ thấy các trường này (không lộ hotelId nội bộ, lịch sử người thao tác...).
export const toGuestView = (b: BookingDoc, decision?: BookingDecisionDoc) => ({
  code: b.code,
  status: b.status,
  hotel: b.hotelSnapshot,
  children: b.guest.children ?? 0, // trẻ em nằm trong `guests` (hiển thị "N người, trong đó M trẻ em")
  ratePlan: b.flags.cancellationTemplate === 'NON_REFUNDABLE' ? 'NON_REFUNDABLE' : 'STANDARD', // mức giá đã đặt (Không hoàn hủy = hủy không được hoàn tiền)
  guests: b.guest.count ?? 1, // số người ở (đơn cũ = 1); số khách đi xe của từng chiều ở shuttles[].passengers
  shuttle: b.shuttle,
  stay: b.stay,
  lines: b.lines.map(({ lineNo, roomTypeId, roomTypeName, qty, unitPriceVnd, subtotalVnd, kind, startsAt, endsAt, hours }) => ({ lineNo, roomTypeId, roomTypeName, qty, unitPriceVnd, subtotalVnd, kind, ...(startsAt && { startsAt, endsAt, hours }) })),
  ...roomSummary(b.lines),
  pricing: {
    roomVnd: b.pricing.roomVnd,
    shuttleVnd: b.pricing.shuttleVnd,
    serviceFeeVnd: b.pricing.serviceFeeVnd,
    discountVnd: b.pricing.discountVnd,
    totalVnd: b.pricing.totalVnd,
  },
  payment: { method: b.payment.method, status: b.payment.status },
  expiresAt: b.expiresAt,
  timeline: b.statusHistory.map(({ to, at }) => ({ to, at })),
  ...(decision && { decision: { status: decision.decision, reason: decision.reason, decidedAt: decision.decidedAt, alternatives: decision.alternatives } }), // không lộ decidedBy
});

export { hotelScope };

type RoomsInput = CreateBookingBody['rooms'];

/** Tóm tắt cho client cũ chỉ đọc 1 dòng: tên loại đầu + '+N loại khác', qty = tổng số phòng. */
export const roomSummary = (lines: Array<{ roomTypeName: string; qty: number }>) => ({
  roomTypeName: lines.length > 1 ? `${lines[0]!.roomTypeName} +${lines.length - 1} loại khác` : (lines[0]?.roomTypeName ?? ''),
  qty: lines.reduce((s, l) => s + l.qty, 0),
});

type PricedRow = {
  roomType: RoomTypeDoc; qty: number; kind: 'NIGHT' | 'HOURLY'; ratePlan: 'STANDARD' | 'NON_REFUNDABLE'; unit: number; subtotal: number;
  startsAt?: Date; endsAt?: Date; hours?: number; // HOURLY: giờ vào/ra
  from: Date; holdTo: Date; // khoảng chặn tồn: [giờ nhận, giờ trả + dọn phòng)
};

// Các loại phòng của đơn: phải thuộc hotelId + active; giữ thứ tự dòng client gửi.
async function loadRooms(hotelId: string, rooms: RoomsInput) {
  const ids = [...new Set(rooms.map((r) => r.roomTypeId))];
  const rts = (await db.query<RoomTypeDoc>('SELECT * FROM room_types WHERE id = ANY($1::uuid[]) AND hotel_id = $2 AND active', [ids, hotelId])).rows;
  const byId = new Map(rts.map((r) => [r.id, r]));
  const missing = ids.filter((id) => !byId.has(id));
  const hotel = !missing.length ? (await db.query<HotelDoc>("SELECT * FROM hotels WHERE id = $1 AND status = 'ACTIVE'", [hotelId])).rows[0] : undefined;
  if (missing.length || !hotel) throw new AppError(404, 'ROOM_TYPE_NOT_FOUND', 'Không tìm thấy loại phòng', missing.length ? { roomTypeIds: missing } : undefined);
  return { hotel, rows: rooms.map((r) => ({ roomType: byId.get(r.roomTypeId)!, qty: r.qty, kind: r.kind, startsAt: r.startsAt, hours: r.hours, ratePlan: r.ratePlan ?? 'STANDARD' })) };
}
type LoadedRow = Awaited<ReturnType<typeof loadRooms>>['rows'][number];

// Giá + khoảng giữ phòng từng dòng. Dòng theo đêm dùng ngày nhận/trả của đơn; dòng theo giờ dùng startsAt + hours và cấu hình giờ của loại phòng.
// Lỗi 422 có details.lineNo (1-based) + roomTypeId để client chỉ đúng dòng.
function priceRows(hotel: HotelDoc, rows: LoadedRow[], input: { from: Date; to: Date }, now: Date) {
  const hasNight = rows.some((r) => r.kind === 'NIGHT');
  const nights = hasNight ? Math.max(1, Math.ceil((input.to.getTime() - input.from.getTime()) / DAY_MS)) : 1;
  const priced = rows.map((r, i): PricedRow => {
    const { roomType, qty } = r;
    if (r.kind === 'NIGHT') {
      const pct = roomType.pricing.nonRefundablePct;
      if (r.ratePlan === 'NON_REFUNDABLE' && !pct) throw new AppError(422, 'RATE_PLAN_NOT_OFFERED', `${roomType.name} không có mức giá Không hoàn hủy`, { lineNo: i + 1, roomTypeId: roomType.id, roomTypeName: roomType.name });
      const unit = r.ratePlan === 'NON_REFUNDABLE' ? nonRefundableNightVnd(roomType.pricing.baseNightVnd, pct!) : roomType.pricing.baseNightVnd;
      return { roomType, qty, kind: 'NIGHT', ratePlan: r.ratePlan, unit, subtotal: unit * qty * nights, from: input.from, holdTo: new Date(input.to.getTime() + hotel.policy.cleaningBufferMin * 60_000) };
    }
    const at = { lineNo: i + 1, roomTypeId: roomType.id, roomTypeName: roomType.name };
    const cfg = hourlyOf(roomType.pricing);
    if (!cfg) throw new AppError(422, 'HOURLY_NOT_ENABLED', `${roomType.name} không bán theo giờ`, at);
    const startsAt = r.startsAt!;
    const hours = r.hours!;
    const bad = hourlyViolation(cfg, startsAt, hours);
    if (bad === 'HOURS_OUT_OF_RANGE') throw new AppError(422, bad, `Số giờ của ${roomType.name} phải từ ${cfg.minHours} đến ${cfg.maxHours} giờ`, { ...at, hours, minHours: cfg.minHours, maxHours: cfg.maxHours });
    if (bad) throw new AppError(422, 'OUTSIDE_OPEN_HOURS', `${roomType.name} chỉ nhận khách theo giờ trong khung ${cfg.openFromHour ?? 0}h-${cfg.openToHour ?? 24}h`, { ...at, openFromHour: cfg.openFromHour ?? 0, openToHour: cfg.openToHour ?? 24 });
    if (startsAt.getTime() < now.getTime() - 5 * 60_000) throw new AppError(422, 'STARTS_AT_IN_PAST', 'Giờ vào đã ở quá khứ', at);
    const { endsAt, holdTo } = hourlyWindow(startsAt, hours, cfg.cleaningMin);
    if (hasNight && (startsAt < input.from || endsAt > input.to)) throw new AppError(422, 'HOURLY_OUT_OF_STAY', 'Giờ ở theo giờ phải nằm trong khoảng nhận - trả phòng của đơn', { ...at, from: input.from, to: input.to });
    const unit = hourlyPrice(cfg, hours);
    return { roomType, qty, kind: 'HOURLY', ratePlan: 'STANDARD', unit, subtotal: unit * qty, startsAt, endsAt, hours, from: startsAt, holdTo };
  });
  return { nights, priced, stayType: (!hasNight ? 'HOURLY' : priced.some((r) => r.kind === 'HOURLY') ? 'MIXED' : 'NIGHT') as 'NIGHT' | 'HOURLY' | 'MIXED' };
}

const lineView = (r: PricedRow) => ({ roomTypeId: r.roomType.id, roomTypeName: r.roomType.name, qty: r.qty, kind: r.kind, unitPriceVnd: r.unit, subtotalVnd: r.subtotal, ...(r.kind === 'NIGHT' && { ratePlan: r.ratePlan }), ...(r.kind === 'HOURLY' && { startsAt: r.startsAt, endsAt: r.endsAt, hours: r.hours }) });

// Giá đơn tính ở server (phòng + xe + phí dịch vụ): dùng chung cho tạo đơn và báo giá trước khi gửi yêu cầu.
async function priceBooking(hotel: HotelDoc, rows: LoadedRow[], input: { from: Date; to: Date; shuttle?: CreateBookingBody['shuttle'] }) {
  const nowQ = new Date();
  const { nights, priced, stayType } = priceRows(hotel, rows, input, nowQ);
  const roomVnd = priced.reduce((a, r) => a + r.subtotal, 0);
  const feeCfg = await getConfig('pricing.serviceFee'); // khóa giá: lưu version vào đơn

  // Xe đặt cùng đơn: chỉ nhận chiều/giờ/điểm đón; giá tính ở server bằng đúng hàm của luồng yêu cầu xe, số khách đi xe = guests của đơn.
  // Đơn theo giờ: cửa sổ đơn = [giờ vào sớm nhất, giờ ra muộn nhất) nên giờ đến của xe bám giờ vào của đơn (±24 giờ như đơn đêm).
  const shuttleLegs: Array<{ direction: string; airport: string; km: number; pickupAt: Date; location?: string; note?: string; priceVnd: number; configVersion: number }> = [];
  if (input.shuttle) {
    if (hotelFeatures(hotel).shuttle === 'none') throw new AppError(422, 'SHUTTLE_NOT_OFFERED', 'Khách sạn này không cung cấp dịch vụ xe đưa đón');
    const free = hotelFeatures(hotel).shuttle === 'free';
    for (const l of input.shuttle.legs) {
      const airport = l.airport ?? hotel.airports[0]?.iata.toUpperCase();
      if (!airport) throw new AppError(422, 'AIRPORT_NOT_SERVED', 'Khách sạn không phục vụ sân bay nào');
      const p = await priceLeg(hotel.airports, { airport, pickupAt: l.pickupAt }, nowQ, { from: input.from, to: input.to });
      shuttleLegs.push({ direction: l.direction, airport, km: p.km, pickupAt: l.pickupAt, location: l.location, note: l.note, priceVnd: free ? 0 : p.priceVnd, configVersion: p.configVersion });
    }
  }
  const shuttleVnd = shuttleLegs.reduce((a, l) => a + l.priceVnd, 0);
  const shuttleCfgVersion = shuttleLegs[0]?.configVersion;
  const feeVnd = serviceFee(roomVnd + shuttleVnd, feeCfg.value); // BR-BKG-01: phí DV = % × (phòng + xe); không có xe thì đúng như cũ
  const totalVnd = roomVnd + shuttleVnd + feeVnd;
  return { nights, stayType, priced, roomVnd, feeCfg, shuttleLegs, shuttleVnd, shuttleCfgVersion, feeVnd, totalVnd };
}

/** Báo giá công khai: cùng cách tính với createBooking, không ghi dữ liệu và không giữ phòng. */
export async function quoteBooking(input: BookingQuoteBody) {
  const { hotel, rows } = await loadRooms(input.hotelId, input.rooms);
  const p = await priceBooking(hotel, rows, input);
  const lines = p.priced.map(lineView);
  return { nights: p.nights, stayType: p.stayType, from: input.from, to: input.to, unitPriceVnd: p.priced[0]!.unit, qty: lines.reduce((a, l) => a + l.qty, 0), rooms: lines, roomVnd: p.roomVnd, shuttleVnd: p.shuttleVnd, serviceFeeVnd: p.feeVnd, totalVnd: p.totalVnd, legs: p.shuttleLegs.map((l) => ({ direction: l.direction, priceVnd: l.priceVnd })) };
}

/**
 * Tạo đơn (T1 trong docs/mongodb mục 6) — ví dụ đầy đủ của một transaction nhiều bảng:
 *  1) khóa tuần tự theo loại phòng (SELECT ... FOR UPDATE) -> hai khách tranh phòng cuối, bên đến sau chờ rồi thấy hết phòng
 *  2) đọc các đoạn đặt giao nhau + tính tồn bằng sweep-line
 *  3) ghi bookings + room_reservations (+ payments nếu VNPay) + audit cùng một transaction
 * Bản đơn giản: 1 loại phòng, theo đêm; trả tại khách sạn hoặc VNPay (đơn PENDING_PAYMENT + bản ghi payments, link tạo sau commit). Xe/chuyến bay ở task riêng.
 */
export const createBooking = (input: CreateBookingBody, requestId?: string, accountId?: string): Promise<BookingDoc> => createBookingImpl(input, requestId, accountId);

/** Đơn của đơn vị chi trả (luồng delay): đơn nội bộ, KHÔNG qua createBookingBody công khai nên khách lẻ không chọn được PAYER. */
export type PayerBookingInput = {
  hotelId: string;
  rooms: Array<{ roomTypeId: string; qty: number }>;
  from: Date; to: Date;
  guest: { fullName: string; phone: string; email?: string };
  guests?: number; children?: number;
  batchId?: string; groupId?: string; simulated?: boolean;
  holdMinutes?: number; // mặc định cấu hình delay.hotelConfirmMin (5')
  contractRoomVnd?: number; // tổng tiền phòng theo giá hợp đồng; bỏ trống = giá hiện hành của loại phòng
};
export async function createPayerBooking(p: PayerBookingInput, requestId?: string, by: Actor = { type: 'SYSTEM' }): Promise<BookingDoc> {
  const holdMinutes = p.holdMinutes ?? (await getConfig('delay.hotelConfirmMin')).value.minutes;
  const input = { hotelId: p.hotelId, rooms: p.rooms.map((r) => ({ ...r, kind: 'NIGHT' as const })), from: p.from, to: p.to, guest: p.guest, guests: p.guests ?? 1, children: p.children ?? 0, paymentMethod: 'AT_HOTEL' } as CreateBookingBody;
  return createBookingImpl(input, requestId, undefined, { ...p, holdMinutes }, by);
}

async function createBookingImpl(input: CreateBookingBody, requestId?: string, accountId?: string, payer?: PayerBookingInput & { holdMinutes: number }, actor?: Actor): Promise<BookingDoc> {
  const by = actor ?? (accountId ? ({ type: 'PASSENGER', id: accountId } as const) : ({ type: 'GUEST' } as const));
  if (input.paymentMethod === 'VNPAY' && !env.VNPAY_ENABLED) throw new AppError(409, 'VNPAY_DISABLED', 'Thanh toán VNPay hiện chưa được bật');
  if (input.paymentMethod === 'MOMO' && !env.MOMO_ENABLED) throw new AppError(409, 'MOMO_DISABLED', 'Thanh toán MoMo hiện chưa được bật');
  const online = !payer && input.paymentMethod !== 'AT_HOTEL';
  const { hotel, rows } = await loadRooms(input.hotelId, input.rooms);

  // Giá được tính LẠI ở server từ dữ liệu trong DB, không tin số client gửi.
  const guests = input.guests;
  const maxGuests = rows.reduce((a, r) => a + r.roomType.capacity * r.qty, 0);
  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  if (guests > maxGuests) {
    throw new AppError(422, 'GUESTS_EXCEED_CAPACITY', `Số người (${guests}) vượt sức chứa tối đa ${maxGuests} của loại phòng đã chọn`, { maxGuests, ...(rows.length === 1 && { capacityPerRoom: rows[0]!.roomType.capacity }), qty: totalQty });
  }

  const pb = await priceBooking(hotel, rows, input);
  const { nights, stayType, priced, feeCfg, shuttleLegs, shuttleVnd, shuttleCfgVersion } = pb;
  const roomVnd = payer?.contractRoomVnd ?? pb.roomVnd;
  const feeVnd = payer ? 0 : pb.feeVnd; // PAYER: không thu phí dịch vụ của khách
  const totalVnd = payer ? roomVnd + shuttleVnd : pb.totalVnd;

  // Khoảng giữ từng dòng đã gồm dọn phòng (đêm: hotel.policy.cleaningBufferMin; giờ: cleaningMin của loại phòng), xem priceRows.
  const needsApproval = !!payer || hotel.approval.manual; // PAYER luôn chờ KS xác nhận
  const approvalMs = await approvalHoldMs();
  const holdCfg = online ? await getConfig('booking.hold') : undefined; // P-03: thời gian giữ chỗ chờ thanh toán

  // Mã đơn ngẫu nhiên: trùng (rất hiếm) thì sinh lại và chạy lại transaction.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateBookingCode();
    try {
      const booking = await withTransaction(async (tx) => {
        const now = new Date();
        // Khóa các loại phòng theo thứ tự id cố định (hai đơn trộn loại phòng ngược thứ tự không deadlock); tính tồn SAU khi giữ đủ khóa.
        const locked = new Map((await tx.query<{ id: string; totalRooms: number }>('SELECT id, total_rooms FROM room_types WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [priced.map((r) => r.roomType.id)])).rows.map((r) => [r.id, r.totalRooms]));
        // All-or-nothing: thiếu chỗ ở BẤT KỲ dòng nào thì ném lỗi trước khi ghi gì (và transaction rollback nếu có).
        const short: Array<{ roomTypeId: string; roomTypeName: string; qty: number; kind?: string; startsAt?: Date; hours?: number }> = [];
        const placed = new Map<string, Interval[]>(); // các dòng trước của CHÍNH đơn này cùng loại phòng (đêm + giờ) cũng chiếm tồn
        for (const r of priced) {
          const active = intervalsForCheck(await loadActiveIntervals(tx, r.roomType.id, r.from, r.holdTo, now), now);
          const mine = placed.get(r.roomType.id) ?? [];
          const want = { from: r.from, to: r.holdTo, qty: r.qty };
          if (!canBook(locked.get(r.roomType.id) ?? r.roomType.totalRooms, [...active, ...mine], want)) short.push({ roomTypeId: r.roomType.id, roomTypeName: r.roomType.name, qty: r.qty, ...(r.startsAt && { kind: r.kind, startsAt: r.startsAt, hours: r.hours }) }); // kind/giờ chỉ có với dòng HOURLY (thiếu = NIGHT)
          placed.set(r.roomType.id, [...mine, want]);
        }
        if (short.length) throw new AppError(409, 'SOLD_OUT', priced.length === 1 ? (priced[0]!.kind === 'HOURLY' ? 'Khung giờ này đã kín phòng, bạn chọn giờ khác nhé' : 'Loại phòng này đã hết trong khoảng thời gian bạn chọn') : `Không đủ phòng cho: ${short.map((x) => x.roomTypeName).join(', ')}`, { soldOut: short });

        const bookingId = randomUUID();
        const reservationIds = priced.map(() => randomUUID());
        // VNPay: giữ chỗ chờ thanh toán trước; sau khi trả tiền mới sang CONFIRMED/PENDING (xem payments.service).
        const status: BookingStatus = online ? 'PENDING_PAYMENT' : needsApproval ? 'PENDING' : 'CONFIRMED';
        const holdMs = payer ? payer.holdMinutes * 60_000 : holdCfg ? holdCfg.value.holdMinutes * 60_000 : approvalMs; // PAYER: hạn theo từng đơn
        // Đơn toàn giờ: giữ chỗ không kéo dài quá giờ vào + 10 phút (giờ vào đã qua mà chưa ai xác nhận thì nhả phòng).
        const holdCap = stayType === 'HOURLY' && !payer ? input.from.getTime() + 10 * 60_000 : Infinity;
        const holdExpiresAt = online || needsApproval ? new Date(Math.min(now.getTime() + holdMs, holdCap)) : undefined;

        const booking: BookingDoc = {
          id: bookingId,
          seq: 0,
          code,
          status,
          hotelId: input.hotelId,
          guest: { ...input.guest, count: guests, children: input.children },
          hotelSnapshot: { name: hotel.name },
          stay: { type: stayType, from: input.from, to: input.to, nights },
          lines: priced.map((r, i) => ({ lineNo: i + 1, roomTypeId: r.roomType.id, roomTypeName: r.roomType.name, qty: r.qty, unitPriceVnd: r.unit, subtotalVnd: r.subtotal, reservationId: reservationIds[i]!, kind: r.kind, ...(r.kind === 'NIGHT' && { ratePlan: r.ratePlan }), ...(r.kind === 'HOURLY' && { startsAt: r.startsAt, endsAt: r.endsAt, hours: r.hours }) })),
          pricing: {
            roomVnd,
            shuttleVnd,
            serviceFeeVnd: feeVnd,
            discountVnd: 0,
            totalVnd,
            params: { configVersions: { serviceFee: feeCfg.version, ...(shuttleCfgVersion && { shuttle: shuttleCfgVersion }), ...(holdCfg && { bookingHold: holdCfg.version }) } },
          },
          payment: { method: payer ? 'PAYER' : input.paymentMethod, status: 'UNPAID', paidVnd: 0, refundedVnd: 0 },
          shuttle: { tripType: shuttleLegs.length === 2 ? 'ROUND_TRIP' : shuttleLegs.length === 1 ? 'ONE_WAY' : 'NONE', legCount: shuttleLegs.length },
          ...(holdExpiresAt && { expiresAt: holdExpiresAt }),
          statusHistory: [{ to: status, at: now, by }],
          changeCount: 0,
          flags: { disputeOpen: false, payoutHeld: false, needsCall: false, cancellationTemplate: priced.some((r) => r.ratePlan === 'NON_REFUNDABLE') ? 'NON_REFUNDABLE' : hotel.policy.cancellationTemplate },
          v: 1,
          createdAt: now,
          updatedAt: now,
        };
        const ins = await tx.query<{ seq: number }>(
          `INSERT INTO bookings (id, code, status, hotel_id, guest, hotel_snapshot, stay, stay_from, lines, pricing, payment_method, payment_status, paid_vnd, refunded_vnd,
                                 shuttle, expires_at, status_history, change_count, flags, v, created_at, updated_at, account_id, batch_id, group_id, simulated)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10::jsonb,$11,'UNPAID',0,0,$12::jsonb,$13,$14::jsonb,0,$15::jsonb,1,$16,$16,$17,$18,$19,$20) RETURNING seq`,
          [bookingId, code, status, input.hotelId, json(booking.guest), json(booking.hotelSnapshot), json(booking.stay), input.from, json(booking.lines), json(booking.pricing),
            booking.payment.method, json(booking.shuttle), holdExpiresAt ?? null, json(booking.statusHistory), json(booking.flags), now, accountId ?? null, payer?.batchId ?? null, payer?.groupId ?? null, payer?.simulated ?? false],
        );
        booking.seq = ins.rows[0]!.seq;

        for (const [i, r] of priced.entries()) {
          await tx.query(
            `INSERT INTO room_reservations (id, hotel_id, room_type_id, kind, booking_id, qty, starts_at, ends_at, state, hold_expires_at, created_at, updated_at)
             VALUES ($1,$2,$3,'BOOKING',$4,$5,$6,$7,$8,$9,$10,$10)`,
            [reservationIds[i], input.hotelId, r.roomType.id, bookingId, r.qty, r.from, r.holdTo, online || needsApproval ? 'HOLD' : 'CONFIRMED', holdExpiresAt ?? null, now],
          );
        }
        // Yêu cầu xe cùng transaction với đơn: hết phòng/lỗi nào cũng rollback cả hai (không có xe mồ côi). Đơn chưa CONFIRMED thì chưa điều phối.
        for (const l of shuttleLegs) {
          const sid = (
            await tx.query<{ id: string }>(
              `INSERT INTO shuttle_requests (booking_id, hotel_id, direction, airport_iata, distance_km, pickup_at, location, note, price_vnd, config_version, passengers, billed)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true) RETURNING id`,
              [bookingId, input.hotelId, l.direction, l.airport, l.km, l.pickupAt, l.location || null, l.note || null, l.priceVnd, l.configVersion, guests],
            )
          ).rows[0]!.id;
          await logBookingEvent(tx, { bookingId, hotelId: input.hotelId, actor: by, type: 'SHUTTLE_REQUESTED', data: { requestId: sid, direction: l.direction, airport: l.airport, pickupAt: l.pickupAt, passengers: guests, withBooking: true } });
        }
        if (online) {
          const { orderId, requestId: gwRequestId } = newGatewayOrder(input.paymentMethod, code);
          const gw = input.paymentMethod === 'MOMO' ? { orderId, requestId: gwRequestId } : { tmnCode: vnpKeys.tmnCode, orderId, requestId: gwRequestId, createDate: vnpDate(now) };
          await tx.query(
            `INSERT INTO payments (id, booking_id, hotel_id, method, amount_vnd, status, txn_ref, gateway, created_at, updated_at)
             VALUES ($1,$2,$3,$8,$4,'INITIATED',$5,$6::jsonb,$7,$7)`,
            [randomUUID(), bookingId, input.hotelId, totalVnd, orderId, json(gw), now, input.paymentMethod],
          );
        }
        await writeAudit(
          { actor: by, action: 'BOOKING.CREATE', entity: { type: 'booking', id: bookingId }, hotelId: input.hotelId, bookingId, after: { code, status, totalVnd, rooms: booking.lines.map((l) => ({ roomTypeId: l.roomTypeId, qty: l.qty, kind: l.kind, ...(l.hours && { hours: l.hours, startsAt: l.startsAt }) })), guests, children: input.children, shuttleVnd, shuttleLegs: shuttleLegs.length }, requestId },
          tx,
        );
        return booking;
      });
      emitBookingChange({ code: booking.code, status: booking.status, hotelId: booking.hotelId, updatedAt: booking.updatedAt, isNew: true });
      if (booking.status === 'CONFIRMED' && shuttleLegs.length) await dispatchDueForBooking(booking.id); // AT_HOTEL không duyệt tay: xác nhận ngay -> điều xe đã tới hạn (không ném lỗi)
      return booking;
    } catch (e) {
      if (isDuplicateKey(e) && attempt < 2) continue; // trùng mã đơn -> thử mã khác
      throw e;
    }
  }
  throw new AppError(500, 'CODE_GENERATION_FAILED', 'Không tạo được mã đặt phòng');
}

// Tra cứu đơn của khách vãng lai: phải khớp CẢ mã lẫn SĐT; sai thì cùng một lỗi 404 (không lộ mã nào tồn tại).
export { getDecision };
export async function lookupBooking(code: string, phone: string): Promise<BookingDoc> {
  const row = (await db.query("SELECT * FROM bookings WHERE code = $1 AND guest->>'phone' = $2", [code, phone])).rows[0];
  if (!row) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn với thông tin đã nhập');
  const b = bookingFromRow(row);
  if (b.status === 'PENDING' && b.expiresAt && b.expiresAt <= new Date()) {
    await lazyExpire(b.id); // job quét có thể chưa chạy: khách vẫn thấy EXPIRED ngay
    return bookingFromRow((await db.query('SELECT * FROM bookings WHERE id = $1', [b.id])).rows[0]!);
  }
  return b;
}

// Danh sách đơn (keyset pagination theo seq, mới nhất trước). `scope.hotelId` rỗng = mọi khách sạn (admin); `q.hotelId` chỉ lọc thêm khi scope rỗng.
export async function listBookings(scope: { hotelId?: string }, q: StaffListQuery & { hotelId?: string }) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  const hotelId = scope.hotelId ?? q.hotelId;
  if (hotelId) add('hotel_id = ?', hotelId);
  if (q.status) add('status = ?', q.status);
  if (q.code) add("code ILIKE ? || '%'", escapeLike(q.code));
  if (q.from) add('stay_from >= ?', q.from);
  if (q.to) add('stay_from < ?', q.to);
  if (q.cursor !== undefined) add('seq < ?', q.cursor);
  const rows = (
    await db.query(`SELECT * FROM bookings ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq DESC LIMIT ${q.limit + 1}`, params)
  ).rows.map(({ statusHistory: _h, ...r }) => { const b = bookingFromRow(r); return { ...b, ...roomSummary(b.lines) }; }); // danh sách không kèm lịch sử trạng thái; roomTypeName/qty tóm tắt cho client cũ
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.seq : null };
}

// Lễ tân: luôn khóa theo khách sạn trong token (tham số hotelId bị bỏ qua).
export const listHotelBookings = (auth: AuthContext, q: StaffListQuery) => listBookings(hotelScope(auth), q);

// Chi tiết một đơn kèm lịch sử trạng thái + quyết định; ngoài phạm vi thì cùng lỗi 404.
export async function getBookingDetail(scope: { hotelId?: string }, id: string): Promise<{ booking: BookingDoc & ReturnType<typeof roomSummary>; decision?: BookingDecisionDoc }> {
  const row = (await db.query('SELECT * FROM bookings WHERE id = $1 AND ($2::uuid IS NULL OR hotel_id = $2)', [id, scope.hotelId ?? null])).rows[0];
  if (!row) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn');
  const booking = bookingFromRow(row);
  return { booking: { ...booking, ...roomSummary(booking.lines) }, decision: await getDecision(id) };
}

// Đổi trạng thái có điều kiện (máy trạng thái): chỉ CONFIRMED -> CHECKED_IN.
// Điều kiện `status` + `hotel_id` nằm TRONG câu UPDATE nên không ghi đè lẫn nhau, không vượt phạm vi khách sạn.
export async function checkIn(auth: AuthContext, bookingId: string, requestId?: string): Promise<BookingDoc> {
  const scope = hotelScope(auth);
  const now = new Date();
  const updated = await withTransaction(async (tx) => {
    const hist = json([{ from: 'CONFIRMED', to: 'CHECKED_IN', at: now, by: actorOf(auth) }]);
    const row = (
      await tx.query(
        `UPDATE bookings SET status = 'CHECKED_IN', checked_in_at = $2, updated_at = $2, status_history = status_history || $3::jsonb, v = v + 1
         WHERE id = $1 AND status = 'CONFIRMED' AND ($4::uuid IS NULL OR hotel_id = $4) RETURNING *`,
        [bookingId, now, hist, scope.hotelId ?? null],
      )
    ).rows[0];
    if (!row) return null;
    const b = bookingFromRow(row);
    await tx.query("UPDATE room_reservations SET state = 'CHECKED_IN', updated_at = $2 WHERE booking_id = $1 AND state = 'CONFIRMED'", [bookingId, now]);
    await writeAudit(
      { actor: actorOf(auth), action: 'BOOKING.CHECKIN', entity: { type: 'booking', id: bookingId }, hotelId: b.hotelId, bookingId, before: { status: 'CONFIRMED' }, after: { status: 'CHECKED_IN' }, requestId },
      tx,
    );
    publishBookingStatus(b, b.status);
    return b;
  });
  if (!updated) throw new AppError(409, 'INVALID_STATE', 'Đơn không tồn tại hoặc không ở trạng thái CONFIRMED');
  emitBookingChange({ code: updated.code, status: updated.status, hotelId: updated.hotelId, updatedAt: updated.updatedAt, isNew: false });
  return updated;
}

// Chuyển trạng thái sau check-in (check-out, no-show) cùng khuôn với checkIn: cập nhật có điều kiện + audit cùng transaction.
// Ngoài phạm vi khách sạn / không tồn tại -> 404 (không lộ tồn tại); sai trạng thái -> 409 INVALID_STATE. Không đụng tiền.
async function transitionStay(
  auth: AuthContext,
  bookingId: string,
  o: { from: BookingStatus; to: BookingStatus; action: string; reservation: { from: string; to: string }; dueOnly?: boolean },
  requestId?: string,
): Promise<BookingDoc> {
  const scope = hotelScope(auth);
  const now = new Date();
  const updated = await withTransaction(async (tx) => {
    const cur = (await tx.query<{ status: BookingStatus; stayFrom: Date; stayType: string }>("SELECT status, stay_from, stay->>'type' AS stay_type FROM bookings WHERE id = $1 AND ($2::uuid IS NULL OR hotel_id = $2) FOR UPDATE", [bookingId, scope.hotelId ?? null])).rows[0];
    if (!cur) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn');
    if (cur.status !== o.from) throw new AppError(409, 'INVALID_STATE', `Đơn không ở trạng thái ${o.from}`);
    if (o.dueOnly) {
      // Đơn toàn giờ: không đến khi đã qua GIỜ vào. Còn lại: chỉ đánh dấu khi đã tới/qua NGÀY nhận phòng theo giờ Việt Nam.
      if (cur.stayType === 'HOURLY') {
        if (now < cur.stayFrom) throw new AppError(409, 'NO_SHOW_NOT_DUE', 'Chưa tới giờ vào nên chưa thể đánh dấu không đến');
      } else {
      const due = (await tx.query<{ due: boolean }>("SELECT (($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= ($2::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS due", [now, cur.stayFrom])).rows[0]!.due;
      if (!due) throw new AppError(409, 'NO_SHOW_NOT_DUE', 'Chưa tới ngày nhận phòng nên chưa thể đánh dấu không đến');
      }
    }
    const hist = json([{ from: o.from, to: o.to, at: now, by: actorOf(auth) }]);
    const row = (
      await tx.query(
        `UPDATE bookings SET status = $2, updated_at = $3, status_history = status_history || $4::jsonb, v = v + 1 WHERE id = $1 AND status = $5 RETURNING *`,
        [bookingId, o.to, now, hist, o.from],
      )
    ).rows[0];
    if (!row) throw new AppError(409, 'INVALID_STATE', `Đơn không ở trạng thái ${o.from}`);
    const b = bookingFromRow(row);
    await tx.query('UPDATE room_reservations SET state = $3, updated_at = $2 WHERE booking_id = $1 AND state = $4', [bookingId, now, o.reservation.to, o.reservation.from]);
    await writeAudit({ actor: actorOf(auth), action: o.action, entity: { type: 'booking', id: bookingId }, hotelId: b.hotelId, bookingId, before: { status: o.from }, after: { status: o.to }, requestId }, tx);
    publishBookingStatus(b, b.status);
    return b;
  });
  emitBookingChange({ code: updated.code, status: updated.status, hotelId: updated.hotelId, updatedAt: updated.updatedAt, isNew: false });
  return updated;
}

/** CHECKED_IN -> CHECKED_OUT (giải phóng giữ chỗ: reservation COMPLETED). Doanh thu "đã thực hiện" tính theo trạng thái này. */
export const checkOut = (auth: AuthContext, bookingId: string, requestId?: string) =>
  transitionStay(auth, bookingId, { from: 'CHECKED_IN', to: 'CHECKED_OUT', action: 'BOOKING.CHECKOUT', reservation: { from: 'CHECKED_IN', to: 'COMPLETED' } }, requestId);

/** CONFIRMED -> NO_SHOW khi đã tới/qua ngày nhận phòng (giờ VN). Chỉ đổi trạng thái + nhả giữ chỗ, KHÔNG đụng tiền. */
export const markNoShow = (auth: AuthContext, bookingId: string, requestId?: string) =>
  transitionStay(auth, bookingId, { from: 'CONFIRMED', to: 'NO_SHOW', action: 'BOOKING.NOSHOW', reservation: { from: 'CONFIRMED', to: 'RELEASED' }, dueOnly: true }, requestId);
