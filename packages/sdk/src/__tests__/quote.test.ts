/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * SDK Quote Type Tests — Richard Patterson (@De-ASI-INTERFACE)
 */
import { QuoteParams } from '../quote';

describe('QuoteParams type', () => {
  it('accepts valid SOL->USDC shape', () => {
    const params: QuoteParams = {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: 10_000_000,
      slippageBps: 50,
    };
    expect(params.amount).toBe(10_000_000);
    expect(params.slippageBps).toBe(50);
  });

  it('defaults slippageBps to optional', () => {
    const params: QuoteParams = {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: 1_000_000,
    };
    expect(params.slippageBps).toBeUndefined();
  });
});
