import { db } from './mongo';
import type {
  AccountDoc,
  AuditLogDoc,
  BookingDoc,
  HotelDoc,
  IdempotencyDoc,
  InventoryLockDoc,
  RoleDoc,
  RoomReservationDoc,
  RoomTypeDoc,
  SystemConfigDoc,
} from './types';

// Một nơi duy nhất khai báo tên collection + kiểu. Thêm collection mới: thêm 1 dòng ở đây.
export const col = {
  accounts: () => db().collection<AccountDoc>('accounts'),
  roles: () => db().collection<RoleDoc>('roles'),
  hotels: () => db().collection<HotelDoc>('hotels'),
  roomTypes: () => db().collection<RoomTypeDoc>('room_types'),
  roomReservations: () => db().collection<RoomReservationDoc>('room_reservations'),
  inventoryLocks: () => db().collection<InventoryLockDoc>('inventory_locks'),
  bookings: () => db().collection<BookingDoc>('bookings'),
  auditLogs: () => db().collection<AuditLogDoc>('audit_logs'),
  systemConfigs: () => db().collection<SystemConfigDoc>('system_configs'),
  idempotencyKeys: () => db().collection<IdempotencyDoc>('idempotency_keys'),
};
