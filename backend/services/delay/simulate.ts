import { randomInt } from 'node:crypto';
import { airportByIata } from '../../data/airports';
import { db } from '../../database/pg';
import { AppError } from '../../lib/errors';
import { env } from '../../config/env';
import type { AuthContext } from '../../lib/jwt';
import { actorOf } from '../audit';
import { ingestFlight, type IngestResult } from './ingest';
import { payerScope } from './queries';

const pick = <T>(a: readonly T[]): T => a[randomInt(a.length)]!;
const AIRLINES = [['VN', 'Vietnam Airlines'], ['VJ', 'Vietjet Air'], ['QH', 'Bamboo Airways'], ['BL', 'Pacific Airlines']] as const;
const SURNAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Lý'];
const MALE = ['Văn Anh', 'Minh Quân', 'Quốc Bảo', 'Đức Huy', 'Hữu Nghĩa', 'Thành Long', 'Gia Hưng', 'Tuấn Kiệt', 'Văn Hải', 'Công Danh'];
const FEMALE = ['Thị Lan', 'Ngọc Mai', 'Thu Hà', 'Phương Thảo', 'Thị Hoa', 'Khánh Linh', 'Bích Ngọc', 'Thùy Dung', 'Hồng Nhung', 'Mỹ Linh'];
const PNR_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z]+/g, '.');
const phone = () => `${pick(['090', '091', '093', '097', '098'])}${randomInt(1_000_000, 9_999_999)}`;

type Pax = { pnr: string; fullName: string; age: number; isRepresentative: boolean; email?: string; phone?: string; specialNeeds?: string[] };

// Dựng danh sách hành khách có chủ đích: gia đình có trẻ em + em bé, nhóm chung PNR, khách đi lẻ, vài khách thiếu liên lạc.
function buildPassengers(newPnr: () => string): Pax[] {
  const names = new Set<string>();
  const name = (surname: string, female: boolean) => {
    for (;;) {
      const n = `${surname} ${pick(female ? FEMALE : MALE)}`;
      if (!names.has(n.toLowerCase())) return names.add(n.toLowerCase()) && n;
    }
  };
  const out: Pax[] = [];
  // rep: người đại diện (có liên lạc, trừ khi `contact` = false); các thành viên khác không cần liên lạc riêng.
  const party = (ages: number[], o: { contact?: 'both' | 'email' | 'phone' | 'none'; needs?: string[] } = {}) => {
    const pnr = newPnr();
    const surname = pick(SURNAMES);
    const contact = o.contact ?? 'both';
    ages.forEach((age, i) => {
      const fullName = name(pick(i < 2 || age >= 12 ? [surname, surname, pick(SURNAMES)] : [surname]), randomInt(2) === 1);
      const rep = i === 0;
      const p: Pax = { pnr, fullName, age, isRepresentative: rep };
      if (rep && (contact === 'both' || contact === 'email')) p.email = `${ascii(fullName)}${randomInt(10, 99)}@example.com`;
      if (rep && (contact === 'both' || contact === 'phone')) p.phone = phone();
      if (rep && o.needs) p.specialNeeds = o.needs;
      out.push(p);
    });
  };
  party([38, 36, 9, 5, 1]); // gia đình: 2 người lớn + 2 trẻ em + 1 em bé
  party([41, 7, 1]); // 1 người lớn + trẻ em + em bé
  party([45, 43, 10, 3]); // gia đình: 2 người lớn + 2 trẻ em
  party([29, 31, 27, 33, 30]); // nhóm đồng nghiệp 5 người chung PNR
  party([52, 50, 24]); // 3 người lớn
  party([67, 64], { needs: ['WHEELCHAIR'] }); // cặp cao tuổi cần hỗ trợ
  const solos = randomInt(6, 9);
  for (let i = 0; i < solos; i++) party([randomInt(18, 70)], { contact: i === 0 ? 'none' : i === 1 ? 'email' : i === 2 ? 'phone' : 'both' }); // khách lẻ, vài người thiếu email/SĐT
  return out;
}

/** Nút "Tạo chuyến bay delay": sinh chuyến + hành khách mô phỏng cho trạm của tài khoản rồi đẩy qua ingestFlight (không ghi thẳng DB). */
export async function simulateDelayFlight(auth: AuthContext, body: { delayUntil: string }): Promise<IngestResult> {
  if (!env.DELAY_SIM_ENABLED || env.NODE_ENV === 'production') throw new AppError(403, 'DELAY_SIM_DISABLED', 'Tính năng tạo chuyến mô phỏng đang tắt');
  const { payerId, stationId } = payerScope(auth);
  const delayUntil = new Date(body.delayUntil);
  if (delayUntil.getTime() <= Date.now()) throw new AppError(422, 'FLIGHT_TIME_INVALID', 'Giờ bay mới phải ở tương lai');
  const st = (await db.query<{ id: string; airportIata: string }>('SELECT id, airport_iata FROM payer_stations WHERE payer_id = $1 AND active AND ($2::uuid IS NULL OR id = $2) ORDER BY created_at, id LIMIT 1', [payerId, stationId])).rows[0];
  if (!st) throw new AppError(409, 'NO_STATION', 'Tài khoản chưa có trạm sân bay hoạt động');
  const sched = new Date(delayUntil.getTime() - 3 * 3600_000);
  const dest = pick(['SGN', 'HAN', 'DAD', 'CXR', 'PQC', 'HUI'].filter((i) => i !== st.airportIata && airportByIata(i)));

  for (let attempt = 0; attempt < 5; attempt++) {
    const [prefix, airline] = pick(AIRLINES);
    const code = `${prefix}${randomInt(100, 9999)}`;
    const clash = await db.query("SELECT 1 FROM flights WHERE code = $1 AND flight_date = (($2::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)", [code, sched]);
    if (clash.rows[0]) continue;
    const used = new Set<string>();
    const newPnr = () => {
      for (;;) {
        const p = Array.from({ length: 6 }, () => PNR_CHARS[randomInt(PNR_CHARS.length)]).join('');
        if (!used.has(p)) return used.add(p) && p;
      }
    };
    let passengers = buildPassengers(newPnr);
    // PNR trùng với chuyến khác (đã có trong DB) -> đổi sang PNR mới, giữ nguyên cấu trúc nhóm.
    const taken = new Set((await db.query<{ pnr: string }>('SELECT DISTINCT pnr FROM delay_flight_pax WHERE pnr = ANY($1::text[])', [[...used]])).rows.map((r) => r.pnr));
    if (taken.size) {
      const remap = new Map([...taken].map((p) => [p, newPnr()]));
      passengers = passengers.map((p) => ({ ...p, pnr: remap.get(p.pnr) ?? p.pnr }));
    }
    try {
      return await ingestFlight(
        { payerId, stationId: st.id, actor: actorOf(auth), source: 'SIMULATION', accountId: auth.sub },
        { flight: { code, airline, origin: st.airportIata, dest, scheduledDepartureAt: sched.toISOString(), newDepartureAt: delayUntil.toISOString(), status: 'DELAYED', cause: 'AIRLINE' }, passengers },
        { simulated: true, createOnly: true },
      );
    } catch (e) {
      if (e instanceof AppError && e.code === 'FLIGHT_EXISTS') continue;
      throw e;
    }
  }
  throw new AppError(409, 'FLIGHT_EXISTS', 'Không sinh được số hiệu chuyến chưa dùng, thử lại');
}
