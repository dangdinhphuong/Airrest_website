import { shuttlePrice } from '@airrest/business-logic';
import type { HotelDoc } from '../../database/types';
import { AppError } from '../../lib/errors';
import { getConfig } from '../systemConfig';

const DAY_MS = 24 * 3600_000;

/**
 * Giá MỘT chiều xe — hàm duy nhất cho báo giá sau đặt, báo giá trước đặt (/hotels/:id/shuttle-quote), tạo yêu cầu xe và tạo đơn,
 * để số tiền báo giá luôn khớp số tiền thu. `stay` có mặt thì kiểm cửa sổ giờ đón (lưu trú ±24 giờ, chưa qua).
 */
export async function priceLeg(airports: HotelDoc['airports'], i: { airport: string; pickupAt: Date }, now: Date, stay?: { from: Date | string; to: Date | string }) {
  const ap = airports.find((a) => a.iata.toUpperCase() === i.airport);
  if (!ap) throw new AppError(422, 'AIRPORT_NOT_SERVED', 'Khách sạn không phục vụ sân bay này');
  const cfg = await getConfig('pricing.shuttle', now);
  const p = shuttlePrice(cfg.value, ap.km, i.pickupAt);
  if (!p) throw new AppError(422, 'SHUTTLE_OUT_OF_RANGE', 'Quãng đường vượt giới hạn phục vụ');
  if (stay) {
    const t = i.pickupAt.getTime();
    if (t < now.getTime() || t < new Date(stay.from).getTime() - DAY_MS || t > new Date(stay.to).getTime() + DAY_MS) {
      throw new AppError(422, 'PICKUP_OUT_OF_STAY_WINDOW', 'Giờ đón phải nằm trong khoảng lưu trú (±24 giờ) và chưa qua');
    }
  }
  return { ...p, km: ap.km, configVersion: cfg.version };
}

/** Số khách đi xe: bỏ trống = `guests` của đơn; client gửi thì phải <= guests (có người không đi xe). */
export function resolvePassengers(guests: number, requested?: number): number {
  if (requested === undefined) return guests;
  if (requested > guests) throw new AppError(422, 'PASSENGERS_EXCEED_GUESTS', `Số khách đi xe (${requested}) không được vượt số người của đơn (${guests})`, { guests });
  return requested;
}
