-- Cờ chuyến xe ngoài do mô phỏng (SHUTTLE_SIM_AUTO) tự đặt: chỉ chuyến có cờ này được mô phỏng tự chạy ARRIVED -> ONBOARD -> DROPPED_OFF. Chạy lại an toàn.
ALTER TABLE shuttle_trips ADD COLUMN IF NOT EXISTS simulated boolean NOT NULL DEFAULT false;
