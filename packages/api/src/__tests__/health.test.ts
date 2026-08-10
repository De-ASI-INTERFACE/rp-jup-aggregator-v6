/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * API Health & 402 Gate Tests — Richard Patterson (@De-ASI-INTERFACE)
 */
import request from 'supertest';
import app from '../index';

describe('GET /health', () => {
  it('returns 200 with accreditation block', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.accreditation).toContain('RP-DEASI-JUP-2026-0619-001');
  });
});

describe('GET /quote without api key', () => {
  it('returns 402 Payment Required', async () => {
    const res = await request(app).get('/quote');
    expect(res.status).toBe(402);
    expect(res.body.uid).toBe('RP-DEASI-JUP-2026-0619-001');
    expect(res.body.error).toBe('Payment Required');
  });
});

describe('POST /swap without api key', () => {
  it('returns 402 Payment Required', async () => {
    const res = await request(app).post('/swap').send({ inputMint: 'x', outputMint: 'y', amount: 1, userPublicKey: 'z' });
    expect(res.status).toBe(402);
  });
});
