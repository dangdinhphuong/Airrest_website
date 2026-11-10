import { col } from './collections';

// Chỉ các index cho collection có ví dụ trong base. Danh sách đầy đủ: docs/mongodb (mục 5).
export async function ensureIndexes(): Promise<void> {
  await col.accounts().createIndex({ email: 1 }, { unique: true });
  await col.roles().createIndex({ hotelId: 1, key: 1 }, { unique: true });

  await col.hotels().createIndex({ code: 1 }, { unique: true });
  await col.hotels().createIndex({ location: '2dsphere' });
  await col.hotels().createIndex({ status: 1, 'airports.iata': 1, 'airports.km': 1 });

  await col.roomTypes().createIndex({ hotelId: 1, active: 1 });

  const rr = col.roomReservations();
  await rr.createIndex({ roomTypeId: 1, state: 1, from: 1, to: 1 });
  await rr.createIndex({ bookingId: 1 });
  await rr.createIndex({ state: 1, holdExpiresAt: 1 }, { partialFilterExpression: { state: 'HOLD' } });

  const b = col.bookings();
  await b.createIndex({ code: 1 }, { unique: true });
  await b.createIndex({ 'guest.phone': 1, status: 1, createdAt: -1 });
  await b.createIndex({ hotelId: 1, status: 1, 'stay.from': 1 });
  await b.createIndex(
    { status: 1, expiresAt: 1 },
    { partialFilterExpression: { status: { $in: ['PENDING_PAYMENT', 'PENDING'] } } },
  );

  const a = col.auditLogs();
  await a.createIndex({ 'entity.type': 1, 'entity.id': 1, ts: -1 });
  await a.createIndex({ hotelId: 1, ts: -1 });
  await a.createIndex({ 'actor.id': 1, ts: -1 });
  await a.createIndex({ bookingId: 1, ts: -1 });
  await a.createIndex({ action: 1, ts: -1 });
  await a.createIndex({ ts: -1 });

  const sc = col.systemConfigs();
  await sc.createIndex({ key: 1, version: -1 }, { unique: true });
  await sc.createIndex({ key: 1, effectiveFrom: -1 });

  await col.hotels().createIndex({ ownerAccountId: 1 });
  await col.hotels().createIndex({ status: 1, incidentScore: -1 });
  await col.accounts().createIndex({ hotelId: 1, type: 1, status: 1 });

  const idem = col.idempotencyKeys();
  await idem.createIndex({ scope: 1, key: 1 }, { unique: true });
  await idem.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
}
