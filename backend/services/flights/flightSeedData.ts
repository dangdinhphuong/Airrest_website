import type { FlightCause, FlightScenario, FlightStatus } from '@airrest/shared-types';

// Bảng 20 chuyến chép 1:1 từ apps/web/src/mock/flights.js (D1). Thời gian là phút tuyệt đối từ 00:00 giờ VN của ngày seed.
export interface FlightSeedRow { code: string; origin: string; dest: string; dayOffset: number; status: FlightStatus; cause: FlightCause; schedMin: number; newMin: number | null; cancelledMin?: number; updatedMin: number; distanceKm: number; scenario: FlightScenario }

export const FLIGHT_SEED: ReadonlyArray<FlightSeedRow> = [
  { code: 'VN218', origin: 'HAN', dest: 'SGN', dayOffset: 0, status: 'DELAYED', cause: 'AIRLINE', schedMin: 1400, newMin: 1800, updatedMin: 1388, distanceKm: 1160, scenario: 'approve' },
  { code: 'VJ456', origin: 'SGN', dest: 'HAN', dayOffset: 0, status: 'DELAYED', cause: 'AIRLINE', schedMin: 1380, newMin: 1800, updatedMin: 1385, distanceKm: 1160, scenario: 'hotelfull' },
  { code: 'QH321', origin: 'HAN', dest: 'SGN', dayOffset: 0, status: 'CANCELLED', cause: 'AIRLINE', schedMin: 1260, newMin: null, cancelledMin: 1265, updatedMin: 1290, distanceKm: 1160, scenario: 'reject' },
  { code: 'VN111', origin: 'HAN', dest: 'SGN', dayOffset: 0, status: 'DELAYED', cause: 'FORCE', schedMin: 1320, newMin: 1740, updatedMin: 1355, distanceKm: 1160, scenario: 'reject' },
  { code: 'VN123', origin: 'HAN', dest: 'SGN', dayOffset: 0, status: 'DELAYED', cause: 'AIRLINE', schedMin: 600, newMin: 720, updatedMin: 620, distanceKm: 1160, scenario: 'approve' },
  { code: 'VJ789', origin: 'SGN', dest: 'HAN', dayOffset: 0, status: 'DELAYED', cause: 'AIRLINE', schedMin: 780, newMin: 1050, updatedMin: 810, distanceKm: 1160, scenario: 'approve' },
  { code: 'QH555', origin: 'HAN', dest: 'SGN', dayOffset: 0, status: 'DELAYED', cause: 'UNKNOWN', schedMin: 1140, newMin: null, updatedMin: 1155, distanceKm: 1160, scenario: 'noreply' },
  { code: 'VN300', origin: 'HAN', dest: 'SGN', dayOffset: 0, status: 'ONTIME', cause: 'UNKNOWN', schedMin: 1080, newMin: null, updatedMin: 1045, distanceKm: 1160, scenario: 'approve' },
  { code: 'VJ222', origin: 'SGN', dest: 'HAN', dayOffset: 0, status: 'DELAYED', cause: 'UNKNOWN', schedMin: 1350, newMin: 1560, updatedMin: 1365, distanceKm: 1160, scenario: 'approve' },
  { code: 'VN401', origin: 'HAN', dest: 'SGN', dayOffset: 0, status: 'DELAYED', cause: 'AIRLINE', schedMin: 1200, newMin: 1500, updatedMin: 1225, distanceKm: 450, scenario: 'approve' },
  { code: 'VJ610', origin: 'SGN', dest: 'HAN', dayOffset: 0, status: 'DELAYED', cause: 'AIRLINE', schedMin: 1275, newMin: 1710, updatedMin: 1300, distanceKm: 1160, scenario: 'approve' },
  { code: 'QH120', origin: 'HAN', dest: 'SGN', dayOffset: 1, status: 'DELAYED', cause: 'AIRLINE', schedMin: 360, newMin: 570, updatedMin: 1790, distanceKm: 1160, scenario: 'approve' },
  { code: 'VN500', origin: 'HAN', dest: 'SGN', dayOffset: 0, status: 'DELAYED', cause: 'AIRLINE', schedMin: 900, newMin: 940, updatedMin: 905, distanceKm: 1160, scenario: 'approve' },
  { code: 'VJ815', origin: 'SGN', dest: 'HAN', dayOffset: 0, status: 'CANCELLED', cause: 'UNKNOWN', schedMin: 1410, newMin: null, cancelledMin: 1350, updatedMin: 1380, distanceKm: 1160, scenario: 'hotelfull' },
  { code: 'VN702', origin: 'HAN', dest: 'SGN', dayOffset: -1, status: 'DELAYED', cause: 'AIRLINE', schedMin: 300, newMin: 660, updatedMin: -710, distanceKm: 1160, scenario: 'approve' },
  { code: 'QH777', origin: 'HAN', dest: 'SGN', dayOffset: 0, status: 'DELAYED', cause: 'AIRLINE', schedMin: 1425, newMin: 1630, updatedMin: 1420, distanceKm: 1160, scenario: 'approve' },
  { code: 'VJ930', origin: 'SGN', dest: 'HAN', dayOffset: 0, status: 'DELAYED', cause: 'AIRLINE', schedMin: 720, newMin: 990, updatedMin: 730, distanceKm: 1160, scenario: 'approve' },
  { code: 'VN850', origin: 'HAN', dest: 'SGN', dayOffset: 0, status: 'DELAYED', cause: 'AIRLINE', schedMin: 1330, newMin: 1680, updatedMin: 1340, distanceKm: 1160, scenario: 'noreply' },
  { code: 'QH909', origin: 'SGN', dest: 'HAN', dayOffset: 0, status: 'DELAYED', cause: 'AIRLINE', schedMin: 1230, newMin: 1470, updatedMin: 1245, distanceKm: 1160, scenario: 'approve' },
  { code: 'VJ100', origin: 'HAN', dest: 'SGN', dayOffset: 0, status: 'ONTIME', cause: 'AIRLINE', schedMin: 480, newMin: null, updatedMin: 410, distanceKm: 1160, scenario: 'approve' },
];
