import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { suggestAlternatives } from '../services/bookings/alternatives';
import { closeDb, db, freshDb, mkHotel, mkRoomType } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;
const from = new Date(Date.now() + 5 * DAY);
const to = new Date(Date.now() + 6 * DAY);
const now = new Date();
const ask = (hotelId: string, qty = 1) => suggestAlternatives(db, { hotelId, from, to, qty, now });

async function hotel(o: { code: string; km?: number; iata?: string; status?: string; name?: string; extraAirports?: Array<{ iata: string; km: number }> }) {
  const id = await mkHotel({ code: o.code, name: o.name ?? o.code, status: o.status });
  await db.query('UPDATE hotels SET airports = $2::jsonb WHERE id = $1', [id, JSON.stringify([{ iata: o.iata ?? 'HAN', km: o.km ?? 5, minutes: 10 }, ...(o.extraAirports ?? [])])]);
  return id;
}
async function fillRoom(roomTypeId: string, hotelId: string, state = 'CONFIRMED', holdExpiresAt: Date | null = null) {
  await db.query(
    `INSERT INTO room_reservations (id, hotel_id, room_type_id, kind, qty, starts_at, ends_at, state, hold_expires_at) VALUES ($1,$2,$3,'BOOKING',1,$4,$5,$6,$7)`,
    [randomUUID(), hotelId, roomTypeId, from, to, state, holdExpiresAt],
  );
}

run('gợi ý khách sạn thay thế', () => {
  beforeEach(async () => freshDb());
  afterAll(async () => closeDb());

  it('trả đúng 3, gần nhất trước, đủ trường', async () => {
    const origin = await hotel({ code: 'O' });
    for (const [i, km] of [9, 3, 7, 1, 5].entries()) await mkRoomType(await hotel({ code: `C${i}`, km }), 2, 500000);
    const r = await ask(origin);
    expect(r.map((a) => a.km)).toEqual([1, 3, 5]);
    expect(r[0]).toMatchObject({ airport: 'HAN', baseNightVnd: 500000 });
    for (const k of ['hotelId', 'hotelName', 'roomTypeId', 'roomTypeName']) expect(r[0]).toHaveProperty(k);
  });

  it('loại trừ: gốc, SUSPENDED, sân bay khác, hết phòng, khóa kín, loại ngừng bán/ngừng dùng, qty quá lớn', async () => {
    const origin = await hotel({ code: 'O' });
    await mkRoomType(origin, 5);
    await mkRoomType(await hotel({ code: 'SUS', status: 'SUSPENDED' }), 2);
    await mkRoomType(await hotel({ code: 'SGN', iata: 'SGN' }), 2);
    const full = await hotel({ code: 'FULL' });
    const fullRt = await mkRoomType(full, 1);
    await fillRoom(fullRt, full);
    const locked = await hotel({ code: 'LOCK' });
    const lockRt = await mkRoomType(locked, 1);
    await db.query(`INSERT INTO room_blocks (hotel_id, room_type_id, kind, qty, starts_at, ends_at, reason, created_by) VALUES ($1,$2,'LOCK',1,$3,$4,'x','{}'::jsonb)`, [locked, lockRt, from, to]);
    await mkRoomType(await hotel({ code: 'PAUSED' }), 2, 500000, { active: false });
    const retired = await hotel({ code: 'RET' });
    const retRt = await mkRoomType(retired, 2);
    await db.query('UPDATE room_types SET active = false, retired_at = now() WHERE id = $1', [retRt]);
    await mkRoomType(await hotel({ code: 'SMALL' }), 2);
    const ok = await hotel({ code: 'OK', km: 9 });
    await mkRoomType(ok, 5);
    expect((await ask(origin, 3)).map((a) => a.hotelId)).toEqual([ok]);
  });

  it('HOLD hết hạn không loại khách sạn; HOLD còn hạn thì loại', async () => {
    const origin = await hotel({ code: 'O' });
    const a = await hotel({ code: 'A' });
    const b = await hotel({ code: 'B' });
    await fillRoom(await mkRoomType(a, 1), a, 'HOLD', new Date(Date.now() - 60_000));
    await fillRoom(await mkRoomType(b, 1), b, 'HOLD', new Date(Date.now() + 600_000));
    expect((await ask(origin)).map((x) => x.hotelId)).toEqual([a]);
  });

  it('khách sạn gốc có hai sân bay: ứng viên trùng một trong hai; airport là sân bay trùng gần nhất', async () => {
    const origin = await hotel({ code: 'O', extraAirports: [{ iata: 'SGN', km: 4 }] });
    const both = await hotel({ code: 'BOTH', km: 8, extraAirports: [{ iata: 'SGN', km: 2 }] });
    await mkRoomType(both, 2);
    const sgnOnly = await hotel({ code: 'S', iata: 'SGN', km: 6 });
    await mkRoomType(sgnOnly, 2);
    const r = await ask(origin);
    expect(r.map((x) => [x.hotelId, x.airport, x.km])).toEqual([[both, 'SGN', 2], [sgnOnly, 'SGN', 6]]);
  });

  it('không ứng viên -> []; chọn loại rẻ nhất còn đủ chỗ; cùng km sắp theo giá rồi tên', async () => {
    const origin = await hotel({ code: 'O' });
    expect(await ask(origin)).toEqual([]);
    const h1 = await hotel({ code: 'H1', km: 4, name: 'Beta' });
    const cheap = await mkRoomType(h1, 1, 300000, { name: 'Rẻ' });
    await fillRoom(cheap, h1); // loại rẻ hết chỗ -> chọn loại đắt hơn
    await mkRoomType(h1, 2, 700000, { name: 'Đắt' });
    const h2 = await hotel({ code: 'H2', km: 4, name: 'Alpha' });
    await mkRoomType(h2, 2, 700000);
    const h3 = await hotel({ code: 'H3', km: 4, name: 'Gamma' });
    await mkRoomType(h3, 2, 400000);
    const r = await ask(origin);
    expect(r.map((x) => x.hotelName)).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(r[2]).toMatchObject({ roomTypeName: 'Đắt', baseNightVnd: 700000 });
  });
});
