// Luồng L2 (MB-11…MB-14): trạng thái của yêu cầu hỗ trợ được SUY RA từ giờ mô phỏng và kịch bản chọn trước theo chuyến bay.
// Tập trạng thái theo SRS mục 4.3 là ĐỀ XUẤT (OQ-08 đang Pending PO). Phản hồi của hãng và cơ sở là mô phỏng (IFR-002).
import { SIM } from '../config/simulation';
import { alternatives, getProperty } from '../mock/service';

export const REQ_STATUS = {
  waiting: { label: 'Đang chờ hãng duyệt', tone: 'info' },
  airline_rejected: { label: 'Hãng từ chối', tone: 'error' },
  approved_waiting_property: { label: 'Hãng đã duyệt — chờ cơ sở xác nhận', tone: 'info' },
  property_rejected: { label: 'Cơ sở từ chối (hết phòng)', tone: 'warn' },
  confirmed: { label: 'Đã xác nhận phòng', tone: 'ok' },
  switched: { label: 'Đã chuyển sang tự chi trả', tone: 'neutral' },
};
export const REQ_ORDER = ['waiting', 'approved_waiting_property', 'confirmed'];

export function proposeProperty(flight, now, excludeIds = []) {
  return alternatives({ airport: flight.origin, now, excludeIds, limit: 1 })[0] || null;
}

export function createRequest({ code, flight, now }) {
  return {
    code, flightCode: flight.code, scenario: flight.scenario || 'approve', airport: flight.origin, sentAt: now,
    proposedId: proposeProperty(flight, now)?.id ?? null, altId: null, altAt: null, switchedAt: null, changeSeen: null,
  };
}

export function deriveRequest(req, flight, now) {
  const tAirline = req.sentAt + SIM.airlineReplyMin;
  const tProp = tAirline + SIM.propertyReplyMin;
  const waited = now - req.sentAt;
  const base = { waited, expired: waited >= SIM.requestExpiryMin, tAirline, tProp };
  let status = 'waiting';
  let property = null; let alts = []; let reason = null; let confirmCode = null;

  if (req.scenario === 'reject' && now >= tAirline) {
    status = 'airline_rejected';
    reason = flight.cause === 'force'
      ? 'Nguyên nhân ghi nhận là điều kiện ngoài kiểm soát của hãng (kịch bản mô phỏng).'
      : 'Hãng chưa xác nhận đủ điều kiện hỗ trợ theo kịch bản mô phỏng.';
  } else if (req.scenario !== 'noreply' && req.scenario !== 'reject' && now >= tAirline) {
    status = 'approved_waiting_property';
    property = getProperty(req.altId || req.proposedId, now);
    if (req.scenario === 'hotelfull' && !req.altId && now >= tProp) {
      status = 'property_rejected';
      alts = alternatives({ airport: req.airport, now, excludeIds: [req.proposedId], limit: 3 });
    } else if (req.altId && now >= req.altAt + SIM.propertyReplyMin) {
      status = 'confirmed';
    } else if (req.scenario === 'approve' && now >= tProp) {
      status = 'confirmed';
    }
    if (status === 'confirmed') confirmCode = `XN-${req.code.slice(3)}`;
  }
  const before = status;
  if (req.switchedAt != null) status = 'switched';
  return { ...base, status, before, property, alts, reason, confirmCode };
}
