import { ObjectId } from 'mongodb';
import { env } from '../config/env';
import { PERM } from '../config/permissions';
import { col } from '../db/collections';
import { ensureIndexes } from '../db/indexes';
import { closeMongo, connectMongo } from '../db/mongo';
import { hashPassword } from '../lib/password';
import { vnd } from '../lib/money';
import { ensureSystemRoles } from '../lib/systemRoles';

// Dữ liệu mẫu để chạy thử API. Chạy lại nhiều lần an toàn (upsert theo khóa tự nhiên).
(async () => {
  await connectMongo();
  await ensureIndexes();
  const now = new Date();
  const pw = await hashPassword(env.SEED_PASSWORD);

  const hotelId = new ObjectId('650000000000000000000001');
  await col.hotels().updateOne(
    { code: 'HAN-DEMO-01' },
    {
      $setOnInsert: {
        _id: hotelId,
        code: 'HAN-DEMO-01',
        status: 'ACTIVE',
        location: { type: 'Point', coordinates: [105.8, 21.2] },
        amenities: ['WIFI', 'SHUTTLE', '24H_RECEPTION'],
        policy: { cancellationTemplate: 'FLEXIBLE', cleaningBufferMin: 0 },
        approval: { manual: false },
        rating: { avg: 4.5, count: 12 },
        createdAt: now,
      },
      $set: { name: 'Khách sạn Demo Nội Bài', airports: [{ iata: 'HAN', km: 6.5, minutes: 14 }], updatedAt: now },
    },
    { upsert: true },
  );
  const hotel = await col.hotels().findOne({ code: 'HAN-DEMO-01' });
  if (!hotel) throw new Error('Không tạo được khách sạn mẫu');

  await col.roomTypes().updateOne(
    { hotelId: hotel._id, name: 'Phòng Deluxe' },
    { $setOnInsert: { totalRooms: 3, pricing: { baseNightVnd: vnd(600_000) }, active: true } },
    { upsert: true },
  );

  // Vai trò = tập quyền. Truy cập chỉ dựa trên quyền.
  const roleDefs = [
    { key: 'reception', name: 'Lễ tân', scope: 'HOTEL' as const, hotelId: hotel._id, permissions: [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN] },
  ];
  const roleIds: Record<string, ObjectId> = {};
  for (const r of roleDefs) {
    await col.roles().updateOne({ key: r.key, hotelId: r.hotelId } as never, { $setOnInsert: { ...r, system: true } }, { upsert: true });
    const doc = await col.roles().findOne({ key: r.key, hotelId: r.hotelId } as never);
    roleIds[r.key] = doc!._id;
  }

  // Vai trò hệ thống (OPS/SUPPORT/FINANCE/SYSADMIN + chủ khách sạn): quyền luôn đồng bộ theo config/roles.ts.
  await ensureSystemRoles();
  const sysadmin = await col.roles().findOne({ key: 'SYSADMIN', hotelId: { $exists: false } });

  const accounts = [
    { email: 'letan@demo.airrest.vn', type: 'HOTEL' as const, fullName: 'Lễ tân Demo', hotelId: hotel._id, roleIds: [roleIds.reception!] },
  ];
  for (const a of accounts) {
    await col.accounts().updateOne({ email: a.email }, { $setOnInsert: { ...a, passwordHash: pw, status: 'ACTIVE', createdAt: now, updatedAt: now } }, { upsert: true });
  }

  // Admin demo luôn được đồng bộ về SYSADMIN (cả khi DB cũ đã có tài khoản này với vai trò cũ).
  await col.accounts().updateOne(
    { email: 'admin@demo.airrest.vn' },
    { $setOnInsert: { type: 'ADMIN', fullName: 'Admin Demo', passwordHash: pw, status: 'ACTIVE', createdAt: now }, $set: { roleIds: [sysadmin!._id], adminRole: 'SYSADMIN', updatedAt: now } },
    { upsert: true },
  );

  console.log(`Seed xong. Hotel ${hotel._id}, tài khoản: letan@demo.airrest.vn / admin@demo.airrest.vn (mật khẩu: SEED_PASSWORD)`);
  await closeMongo();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
