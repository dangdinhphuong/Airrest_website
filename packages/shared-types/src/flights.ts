export const FLIGHT_CODE_RE = /^[A-Z]{2}[0-9]{1,4}$/;
export type FlightStatus = 'ONTIME' | 'DELAYED' | 'CANCELLED';
export type FlightCause = 'AIRLINE' | 'FORCE' | 'UNKNOWN';
export type FlightScenario = 'approve' | 'reject' | 'hotelfull' | 'noreply';

// Mọi thời điểm là ISO 8601 UTC. Dữ liệu mô phỏng: `simulated` luôn true.
export interface FlightDto {
  id: string;
  code: string;
  flightDate: string;
  airline: string;
  origin: string;
  dest: string | null;
  scheduledDepartureAt: string;
  newDepartureAt: string | null;
  effectiveDepartureAt: string | null;
  status: FlightStatus;
  cause: FlightCause;
  cancelledAt: string | null;
  distanceKm: number | null;
  delayMinutes: number | null;
  delayedOverThreshold: boolean;
  lastChange: { fromAt: string; toAt: string; at: string } | null;
  simScenario: FlightScenario;
  updatedAt: string;
  asOf: string;
  simulated: true;
}
