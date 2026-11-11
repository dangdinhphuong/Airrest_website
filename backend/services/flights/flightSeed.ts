import type { Db } from '../../database/pg';
import { FLIGHT_SEED } from './flightSeedData';

/** 00:00 giờ Việt Nam (UTC+7, không DST) của ngày VN chứa `now`. */
export const vnDayStart = (now: Date): Date => {
  const vn = new Date(now.getTime() + 7 * 3600_000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600_000);
};

// shortcut: seed bám ngày chạy, chạy lại ở ngày khác tạo thêm bộ chuyến cho ngày đó (không dọn bộ cũ); xóa tay hoặc làm job khi cần.
// ON CONFLICT DO NOTHING: chạy lại không ghi đè chỉnh sửa của admin.
export async function seedFlights(tx: Db, now = new Date()): Promise<number> {
  const day = vnDayStart(now).getTime();
  const at = (min: number) => new Date(day + min * 60_000);
  let inserted = 0;
  for (const f of FLIGHT_SEED) {
    const r = await tx.query(
      `INSERT INTO flights (code, airline, origin, dest, sched_dep, new_dep, status, cause, cancelled_at, distance_km, sim_scenario, updated_at)
       VALUES ($1,'Hãng mô phỏng',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (code, flight_date) DO NOTHING`,
      [
        f.code, f.origin, f.dest, at(f.schedMin + f.dayOffset * 1440), f.newMin === null ? null : at(f.newMin + f.dayOffset * 1440),
        f.status, f.cause, f.status === 'CANCELLED' ? at((f.cancelledMin ?? f.updatedMin) + f.dayOffset * 1440) : null, f.distanceKm, f.scenario, at(f.updatedMin),
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  return inserted;
}
