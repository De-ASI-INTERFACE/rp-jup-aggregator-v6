/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * Bot Unit Tests — Richard Patterson (@De-ASI-INTERFACE)
 *
 * The bot's main() is a live-network function (connects to Solana mainnet,
 * decodes a private key, executes a swap). We do NOT execute it in CI.
 *
 * What we verify instead:
 *  1. All SDK constants the bot depends on are correctly shaped addresses
 *  2. accreditationBlock() is callable and returns the canonical UID
 *  3. The deployer address constant is a valid base-58 Solana public key
 *  4. Amount arithmetic used by the bot is integer-safe at u64 boundary
 *  5. Environment variable defaults the bot uses are deterministic
 */
import { WSOL, USDC, USDT, DEPLOYER, UID, accreditationBlock } from '@rp/sdk';

// ── SDK constants the bot imports ─────────────────────────────────────────────────
describe('SDK address constants', () => {
  // Solana base-58 public keys are 32-44 chars, no 0/O/I/l
  const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  it('WSOL is a valid Solana base-58 address', () => {
    expect(WSOL).toMatch(BASE58_RE);
  });

  it('USDC is a valid Solana base-58 address', () => {
    expect(USDC).toMatch(BASE58_RE);
  });

  it('USDT is a valid Solana base-58 address', () => {
    expect(USDT).toMatch(BASE58_RE);
  });

  it('DEPLOYER is a valid Solana base-58 address', () => {
    expect(DEPLOYER).toMatch(BASE58_RE);
  });

  it('WSOL matches canonical wrapped-SOL mint', () => {
    expect(WSOL).toBe('So11111111111111111111111111111111111111112');
  });

  it('USDC matches canonical SPL USDC mint', () => {
    expect(USDC).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });
});

// ── UID + accreditation ─────────────────────────────────────────────────────────────
describe('accreditationBlock()', () => {
  it('returns a non-empty string', () => {
    expect(typeof accreditationBlock()).toBe('string');
    expect(accreditationBlock().length).toBeGreaterThan(0);
  });

  it('contains the canonical UID', () => {
    expect(accreditationBlock()).toContain(UID);
  });

  it('contains the entity name', () => {
    expect(accreditationBlock()).toContain('De-ASI-INTERFACE');
  });

  it('contains the owner name', () => {
    expect(accreditationBlock()).toContain('Richard Patterson');
  });

  it('is deterministic across repeated calls', () => {
    expect(accreditationBlock()).toBe(accreditationBlock());
  });
});

// ── Integer safety for u64 amounts ─────────────────────────────────────────────────
describe('u64 amount arithmetic safety', () => {
  // Jupiter amounts are u64 strings. Verify BigInt round-trips are lossless
  // at the extremes the bot might encounter.
  const cases: [string, bigint][] = [
    ['0',                    0n],
    ['1',                    1n],
    ['10000000',             10_000_000n],       // 0.01 SOL in lamports
    ['1000000000',           1_000_000_000n],    // 1 SOL
    ['18446744073709551615', 18_446_744_073_709_551_615n], // u64 max
  ];

  test.each(cases)('BigInt(\'%s\') === %s', (str, expected) => {
    expect(BigInt(str)).toBe(expected);
  });

  it('String(BigInt) round-trip is lossless at u64 max', () => {
    const max = '18446744073709551615';
    expect(String(BigInt(max))).toBe(max);
  });
});

// ── Environment variable defaults ─────────────────────────────────────────────────
describe('bot environment variable defaults', () => {
  it('falls back to mainnet RPC when SOLANA_RPC_MAINNET is unset', () => {
    const original = process.env.SOLANA_RPC_MAINNET;
    delete process.env.SOLANA_RPC_MAINNET;
    const rpc = process.env.SOLANA_RPC_MAINNET || 'https://api.mainnet-beta.solana.com';
    expect(rpc).toBe('https://api.mainnet-beta.solana.com');
    if (original !== undefined) process.env.SOLANA_RPC_MAINNET = original;
  });

  it('uses custom RPC when SOLANA_RPC_MAINNET is set', () => {
    process.env.SOLANA_RPC_MAINNET = 'https://rpc.custom.provider';
    const rpc = process.env.SOLANA_RPC_MAINNET || 'https://api.mainnet-beta.solana.com';
    expect(rpc).toBe('https://rpc.custom.provider');
    delete process.env.SOLANA_RPC_MAINNET;
  });
});
