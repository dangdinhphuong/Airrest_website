-- Cổng thanh toán SePay: thêm 'SEPAY' vào các giá trị payment_method hợp lệ của đơn. payments.method / refunds.method không có CHECK.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check CHECK (payment_method IN ('VNPAY','MOMO','SEPAY','AT_HOTEL','PAYER'));
