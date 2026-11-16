const roundTo = (n: number, step: number) => Math.round(n / step) * step;

// Giá/đêm của mức "Không hoàn hủy" = giá cơ bản giảm pct%, làm tròn 1.000 đ (pct do khách sạn đặt trên loại phòng, 1-50).
export const nonRefundableNightVnd = (baseNightVnd: number, pct: number): number => roundTo((baseNightVnd * (100 - pct)) / 100, 1000);

export interface ServiceFeeParams {
  bps: number;
  minVnd: number;
  roundToVnd: number;
}

// BR-BKG-01: phí dịch vụ = % × (phòng + xe), làm tròn 1.000 đ, tối thiểu 10.000 đ.
// Tham số lấy từ system_configs `pricing.serviceFee` (mặc định P-07: 200 bps, 10.000 đ, 1.000 đ).
export function serviceFee(subtotalVnd: number, p: ServiceFeeParams): number {
  const raw = roundTo((subtotalVnd * p.bps) / 10_000, p.roundToVnd);
  return Math.max(raw, p.minVnd);
}
