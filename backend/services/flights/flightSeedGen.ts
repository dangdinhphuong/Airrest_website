import { AIRPORTS, type Airport } from '../../data/airports';
import type { Db } from '../../database/pg';
import { vnDayStart } from './flightSeed';

// Chuyến bay MÔ PHỎNG sinh theo quy tắc cho mạng đường bay nội địa: HAN và SGN là đầu mối nối với mọi sân bay thương mại khác.
// Tất định theo (tuyến, chuyến, ngày) nên chạy lại không đổi dữ liệu; ON CONFLICT DO NOTHING không ghi đè chỉnh sửa của admin.
const AIRLINE_PREFIX = ['VN', 'VJ', 'QH', 'BL', 'VU'];
const CAUSES = ['AIRLINE', 'FORCE', 'UNKNOWN'] as const;
const SCENARIOS = ['approve', 'reject', 'hotelfull', 'noreply'] as const;
const DELAYS = [40, 75, 120, 185, 260, 340, 420, 480];

const km = (a: Airport, b: Airport): number => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(h)));
};

export function generatedRoutes(): Array<[Airport, Airport]> {
  const [han, sgn] = [AIRPORTS.find((a) => a.iata === 'HAN')!, AIRPORTS.find((a) => a.iata === 'SGN')!];
  const pairs: Array<[Airport, Airport]> = [];
  for (const hub of [han, sgn]) for (const o of AIRPORTS) if (o !== hub && !(hub === sgn && o === han)) pairs.push([hub, o]);
  return pairs.flatMap(([a, b]) => [[a, b], [b, a]] as Array<[Airport, Airport]>);
}

export async function seedGeneratedFlights(tx: Db, now = new Date(), days = [-1, 0, 1, 2, 3]): Promise<number> {
  const day0 = vnDayStart(now).getTime();
  const at = (dayOffset: number, min: number) => new Date(day0 + (dayOffset * 1440 + min) * 60_000);
  let inserted = 0;
  const routes = generatedRoutes();
  for (let r = 0; r < routes.length; r++) {
    const [from, to] = routes[r]!;
    for (let k = 0; k < 2; k++) {
      const c = r * 2 + k;
      const code = `${AIRLINE_PREFIX[c % AIRLINE_PREFIX.length]}${200 + c * 3}`;
      const sched = k === 0 ? 330 + ((c * 37) % 360) : 840 + ((c * 53) % 420);
      for (const d of days) {
        const h = (c * 31 + d * 17 + 7 + 100) % 100;
        const status = h < 62 ? 'ONTIME' : h < 88 ? 'DELAYED' : 'CANCELLED';
        const cause = status === 'ONTIME' ? 'UNKNOWN' : CAUSES[h % 3]!;
        const newMin = status === 'DELAYED' && !(cause === 'UNKNOWN' && h % 4 === 0) ? sched + DELAYS[h % DELAYS.length]! : null;
        const res = await tx.query(
          `INSERT INTO flights (code, airline, origin, dest, sched_dep, new_dep, status, cause, cancelled_at, distance_km, sim_scenario, updated_at)
           VALUES ($1,'Hãng mô phỏng',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (code, flight_date) DO NOTHING`,
          [code, from.iata, to.iata, at(d, sched), newMin === null ? null : at(d, newMin), status, cause, status === 'CANCELLED' ? at(d, sched - 90) : null, km(from, to), SCENARIOS[h % 4], at(d, sched - 30)],
        );
        inserted += res.rowCount ?? 0;
      }
    }
  }
  return inserted;
}
