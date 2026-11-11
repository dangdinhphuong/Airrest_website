-- Đổi cổng thanh toán MoMo -> VNPay (cột chung tên gateway, không gắn tên cổng).
ALTER TABLE bookings DROP CONSTRAINT bookings_payment_method_check;
UPDATE bookings SET payment_method = 'VNPAY' WHERE payment_method = 'MOMO';
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check CHECK (payment_method IN ('VNPAY','AT_HOTEL'));

ALTER TABLE payments RENAME COLUMN momo_order_id TO txn_ref;  -- vnp_TxnRef, chống IPN lặp
ALTER TABLE payments RENAME COLUMN momo TO gateway;           -- {tmnCode, orderId(=txnRef), requestId, createDate, transId?, payUrl?, resultCode?, message?}
ALTER TABLE payments ALTER COLUMN method SET DEFAULT 'VNPAY';
UPDATE payments SET method = 'VNPAY' WHERE method = 'MOMO';

ALTER TABLE refunds RENAME COLUMN momo TO gateway;            -- {orderId, requestId, refundTransId?, resultCode?}
ALTER TABLE refunds ALTER COLUMN method SET DEFAULT 'VNPAY';
UPDATE refunds SET method = 'VNPAY' WHERE method = 'MOMO';

-- Cấu hình hoàn tiền: momoRetries -> gatewayRetries (mọi phiên bản cũ).
UPDATE system_configs SET value = (value - 'momoRetries') || jsonb_build_object('gatewayRetries', value->'momoRetries')
WHERE key = 'refund' AND value ? 'momoRetries';
