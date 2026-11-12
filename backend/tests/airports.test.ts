import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { AIRPORTS } from '../data/airports';

describe('GET /v1/airports', () => {
  it('trả toàn bộ sân bay thương mại, công khai', async () => {
    const res = await request(createApp()).get('/v1/airports');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(AIRPORTS.length);
    expect(res.body.items.map((a: { iata: string }) => a.iata)).toEqual(expect.arrayContaining(['HAN', 'SGN', 'DAD', 'CXR', 'PQC', 'DIN', 'VCS']));
  });
  it('dữ liệu hợp lệ: IATA 3 chữ hoa và duy nhất, tọa độ nằm trong lãnh thổ Việt Nam', () => {
    const codes = AIRPORTS.map((a) => a.iata);
    expect(new Set(codes).size).toBe(codes.length);
    for (const a of AIRPORTS) {
      expect(a.iata).toMatch(/^[A-Z]{3}$/);
      expect(a.lat).toBeGreaterThan(8); expect(a.lat).toBeLessThan(24);
      expect(a.lng).toBeGreaterThan(102); expect(a.lng).toBeLessThan(110);
    }
  });
});
