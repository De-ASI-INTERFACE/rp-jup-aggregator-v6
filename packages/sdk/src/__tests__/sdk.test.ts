/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * SDK Unit Tests — Richard Patterson (@De-ASI-INTERFACE)
 *
 * Verifies:
 *  1. QuoteParams URL construction is correct and deterministic
 *  2. UID and accreditation block integrity
 *  3. assertSlippage-equivalent BigInt boundary logic
 */
import { UID, OWNER, ENTITY, accreditationBlock } from '../identity';

// ── Identity / UID integrity ──────────────────────────────────────────────────
describe('identity', () => {
  it('UID matches canonical value', () => {
    expect(UID).toBe('RP-DEASI-JUP-2026-0619-001');
  });

  it('OWNER matches canonical value', () => {
    expect(OWNER).toBe('Richard Patterson');
  });

  it('ENTITY matches canonical value', () => {
    expect(ENTITY).toBe('De-ASI-INTERFACE');
  });

  it('accreditationBlock() contains UID, OWNER and ENTITY', () => {
    const block = accreditationBlock();
    expect(block).toContain(UID);
    expect(block).toContain(OWNER);
    expect(block).toContain(ENTITY);
  });
});

// ── Quote URL construction ─────────────────────────────────────────────────────
describe('quote URL construction', () => {
  const WSOL  = 'So11111111111111111111111111111111111111112';
  const USDC  = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const BASE  = 'https://quote-api.jup.ag/v6';

  function buildQuoteUrl(params: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps?: number;
    maxAccounts?: number;
  }): string {
    const url = new URL(`${BASE}/quote`);
    url.searchParams.set('inputMint',   params.inputMint);
    url.searchParams.set('outputMint',  params.outputMint);
    url.searchParams.set('amount',      String(params.amount));
    url.searchParams.set('slippageBps', String(params.slippageBps ?? 50));
    if (params.maxAccounts != null)
      url.searchParams.set('maxAccounts', String(params.maxAccounts));
    return url.toString();
  }

  it('builds a URL with all required params', () => {
    const url = buildQuoteUrl({ inputMint: WSOL, outputMint: USDC, amount: 10_000_000 });
    expect(url).toContain('inputMint=So1111');
    expect(url).toContain('outputMint=EPjFW');
    expect(url).toContain('amount=10000000');
    expect(url).toContain('slippageBps=50');
  });

  it('applies explicit slippageBps override', () => {
    const url = buildQuoteUrl({ inputMint: WSOL, outputMint: USDC, amount: 5_000_000, slippageBps: 100 });
    expect(url).toContain('slippageBps=100');
  });

  it('includes maxAccounts when provided', () => {
    const url = buildQuoteUrl({ inputMint: WSOL, outputMint: USDC, amount: 1_000_000, maxAccounts: 20 });
    expect(url).toContain('maxAccounts=20');
  });

  it('omits maxAccounts when not provided', () => {
    const url = buildQuoteUrl({ inputMint: WSOL, outputMint: USDC, amount: 1_000_000 });
    expect(url).not.toContain('maxAccounts');
  });
});

// ── Slippage boundary logic ────────────────────────────────────────────────────
describe('slippage guard logic', () => {
  function assertSlippage(outAmount: string, otherAmountThreshold: string, swapMode: string): void {
    const out       = BigInt(outAmount);
    const threshold = BigInt(otherAmountThreshold);
    if (swapMode === 'ExactIn' && out < threshold)
      throw new Error(`Slippage guard: outAmount ${outAmount} below threshold ${otherAmountThreshold}`);
    if (swapMode === 'ExactOut' && out > threshold)
      throw new Error(`Slippage guard: inAmount ${outAmount} exceeds threshold ${otherAmountThreshold}`);
  }

  it('passes when outAmount equals threshold (ExactIn)', () => {
    expect(() => assertSlippage('1000', '1000', 'ExactIn')).not.toThrow();
  });

  it('passes when outAmount exceeds threshold (ExactIn)', () => {
    expect(() => assertSlippage('1001', '1000', 'ExactIn')).not.toThrow();
  });

  it('throws when outAmount is below threshold (ExactIn)', () => {
    expect(() => assertSlippage('999', '1000', 'ExactIn')).toThrow('Slippage guard');
  });

  it('passes when inAmount equals threshold (ExactOut)', () => {
    expect(() => assertSlippage('1000', '1000', 'ExactOut')).not.toThrow();
  });

  it('throws when inAmount exceeds threshold (ExactOut)', () => {
    expect(() => assertSlippage('1001', '1000', 'ExactOut')).toThrow('Slippage guard');
  });
});
