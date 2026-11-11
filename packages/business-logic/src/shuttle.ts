export interface PricingShuttleCfg {
  baseVnd: number;
  baseKm: number;
  perKmVnd: number;
  nightSurchargeBps: number;
  maxKm: number;
}

/** Giá xe (P-08). `null` khi vượt `maxKm`. Phụ thu đêm: giờ Việt Nam (UTC+7) trong [22:00, 06:00). */
export function shuttlePrice(cfg: PricingShuttleCfg, km: number, pickupAt: Date): { priceVnd: number; night: boolean } | null {
  if (km > cfg.maxKm) return null;
  const billable = Math.max(0, Math.ceil(km) - cfg.baseKm);
  let price = cfg.baseVnd + billable * cfg.perKmVnd;
  const hour = new Date(pickupAt.getTime() + 7 * 3600_000).getUTCHours();
  const night = hour >= 22 || hour < 6;
  if (night) price += Math.round((price * cfg.nightSurchargeBps) / 10_000);
  return { priceVnd: price, night };
}
