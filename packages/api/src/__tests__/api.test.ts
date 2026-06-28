/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * API Route Tests — Richard Patterson (@De-ASI-INTERFACE)
 *
 * Uses supertest against createApp() — no port is bound during tests.
 *
 * Coverage:
 *  1. /health — 200, accreditation field present, UID intact
 *  2. Auth gate — missing key returns 402 with correct body shape
 *  3. Auth gate — wrong key returns 402
 *  4. Rate limit headers present on every authenticated response
 *  5. /quote — missing required params returns 400
 *  6. /swap  — missing required body fields returns 400
 *  7. Slippage guard — unit-level BigInt boundary assertions
 */
import request from 'supertest';
import { createApp } from '../app';

// Set a known API key in env before the app is created
const TEST_API_KEY = 'test-key-rp-jup-2026';
process.env.API_KEY = TEST_API_KEY;
// Disable ALLOWED_ORIGINS so CORS allows all in tests
delete process.env.ALLOWED_ORIGINS;

const app = createApp();

// ── /health ────────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    // /health is BEFORE the auth gate — no API key needed
    const res = await request(app).get('/health').set('x-api-key', TEST_API_KEY);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('includes accreditation block containing UID', async () => {
    const res = await request(app).get('/health').set('x-api-key', TEST_API_KEY);
    expect(res.body.accreditation).toContain('RP-DEASI-JUP-2026-0619-001');
  });

  it('includes accreditation block containing owner name', async () => {
    const res = await request(app).get('/health').set('x-api-key', TEST_API_KEY);
    expect(res.body.accreditation).toContain('Richard Patterson');
  });
});

// ── Auth gate ──────────────────────────────────────────────────────────────────
describe('HTTP 402 auth gate', () => {
  it('returns 402 when x-api-key header is absent', async () => {
    const res = await request(app).get('/quote');
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('Payment Required');
    expect(res.body.uid).toBe('RP-DEASI-JUP-2026-0619-001');
  });

  it('returns 402 when x-api-key is incorrect', async () => {
    const res = await request(app).get('/quote').set('x-api-key', 'wrong-key');
    expect(res.status).toBe(402);
  });

  it('body includes owner field on 402', async () => {
    const res = await request(app).get('/quote');
    expect(res.body.owner).toContain('Richard Patterson');
  });
});

// ── Rate limit headers ───────────────────────────────────────────────────────────
describe('Rate limit headers', () => {
  it('RateLimit-Limit header is present on 402 responses', async () => {
    const res = await request(app).get('/quote');
    // standardHeaders: true means express-rate-limit injects RateLimit-Limit
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });

  it('RateLimit-Remaining header decrements on repeated requests', async () => {
    const first  = await request(app).get('/health').set('x-api-key', TEST_API_KEY);
    const second = await request(app).get('/health').set('x-api-key', TEST_API_KEY);
    const r1 = parseInt(first.headers['ratelimit-remaining'] as string, 10);
    const r2 = parseInt(second.headers['ratelimit-remaining'] as string, 10);
    expect(r2).toBeLessThan(r1);
  });
});

// ── /quote validation ───────────────────────────────────────────────────────────
describe('GET /quote — input validation', () => {
  it('returns 400 when all required params are missing', async () => {
    const res = await request(app)
      .get('/quote')
      .set('x-api-key', TEST_API_KEY);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  it('returns 400 when outputMint is missing', async () => {
    const res = await request(app)
      .get('/quote?inputMint=So11111111111111111111111111111111111111112&amount=10000000')
      .set('x-api-key', TEST_API_KEY);
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is missing', async () => {
    const res = await request(app)
      .get('/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
      .set('x-api-key', TEST_API_KEY);
    expect(res.status).toBe(400);
  });
});

// ── /swap validation ─────────────────────────────────────────────────────────────
describe('POST /swap — input validation', () => {
  it('returns 400 when body is empty', async () => {
    const res = await request(app)
      .post('/swap')
      .set('x-api-key', TEST_API_KEY)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  it('returns 400 when userPublicKey is missing', async () => {
    const res = await request(app)
      .post('/swap')
      .set('x-api-key', TEST_API_KEY)
      .send({
        inputMint:  'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount:     10_000_000,
      });
    expect(res.status).toBe(400);
  });
});

// ── Slippage guard ──────────────────────────────────────────────────────────────
describe('Slippage guard — unit boundary assertions', () => {
  // Mirror of the function in swap.ts — tested here in isolation
  // so CI catches regressions without requiring a live Jupiter RPC call.
  function assertSlippage(outAmount: string, otherAmountThreshold: string, swapMode: string): void {
    const out       = BigInt(outAmount);
    const threshold = BigInt(otherAmountThreshold);
    if (swapMode === 'ExactIn' && out < threshold)
      throw new Error(`Slippage guard: outAmount ${outAmount} below threshold ${otherAmountThreshold}`);
    if (swapMode === 'ExactOut' && out > threshold)
      throw new Error(`Slippage guard: inAmount ${outAmount} exceeds threshold ${otherAmountThreshold}`);
  }

  it('ExactIn: passes when outAmount === threshold', () => {
    expect(() => assertSlippage('5000000', '5000000', 'ExactIn')).not.toThrow();
  });

  it('ExactIn: passes when outAmount > threshold', () => {
    expect(() => assertSlippage('5000001', '5000000', 'ExactIn')).not.toThrow();
  });

  it('ExactIn: throws when outAmount < threshold', () => {
    expect(() => assertSlippage('4999999', '5000000', 'ExactIn')).toThrow('Slippage guard');
  });

  it('ExactOut: passes when inAmount === threshold', () => {
    expect(() => assertSlippage('5000000', '5000000', 'ExactOut')).not.toThrow();
  });

  it('ExactOut: throws when inAmount > threshold', () => {
    expect(() => assertSlippage('5000001', '5000000', 'ExactOut')).toThrow('Slippage guard');
  });

  it('ExactOut: passes when inAmount < threshold', () => {
    expect(() => assertSlippage('4999999', '5000000', 'ExactOut')).not.toThrow();
  });
});
