-- Thêm cổng MoMo (payments.method / refunds.method không có CHECK, chỉ bookings.payment_method).
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check CHECK (payment_method IN ('VNPAY','MOMO','AT_HOTEL'));
