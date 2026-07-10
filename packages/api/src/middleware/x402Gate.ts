/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * x402Gate Middleware — Richard Patterson (@De-ASI-INTERFACE)
 * Project: RP-JUP-EXECUTIONER
 *
 * HTTP 402 Payment Required gate for DEASI execution endpoints.
 * Verifies Solana USDC SPL token transfers on-chain per the x402 V2 spec.
 * Supports session token bypass for HFT workloads (see x402SessionManager).
 *
 * Security invariants:
 *  (1) Replay protection: every sig is stored before handler invocation
 *  (2) Sufficiency: amount validated from parsed on-chain instruction, NOT header claim
 *  (3) Finality: only 'confirmed' or 'finalized' commitment accepted
 *  (4) Atomicity: sig stored and handler called in single synchronous critical section
 */

import { Request, Response, NextFunction } from 'express';
import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
} from '@solana/web3.js';
import { validateSessionToken } from './x402SessionManager';

// ── Constants ────────────────────────────────────────────────────────────────

export const X402_VERSION = 2;
export const USDC_DECIMALS = 6;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface X402GateConfig {
  /** Minimum USDC required in atomic units (1 USDC = 1_000_000) */
  minAmountUsdc: number;
  /** DEASI execution vault USDC ATA — settlement destination */
  recipientUsdcAta: string;
  /** USDC SPL token mint address */
  usdcMint: string;
  /** Solana RPC connection */
  connection: Connection;
  /** In-process replay protection store — back with Redis in production */
  processedSigs: Set<string>;
  /** Route label for structured error context */
  routeLabel: string;
  /** Whether to accept x402 session tokens (for HFT bypass) */
  acceptSessionTokens?: boolean;
}

export interface X402PaymentRequired {
  x402Version: number;
  error: string;
  accepts: X402PaymentScheme[];
}

interface X402PaymentScheme {
  scheme: 'exact' | 'upto';
  network: string;
  maxAmountRequired: string;
  payTo: string;
  asset: { address: string; decimals: number; symbol: string };
  description: string;
  extra: { uid: string; owner: string };
}

// ── Core Verifier ─────────────────────────────────────────────────────────────

/**
 * Parses and validates a confirmed Solana transaction as a USDC SPL transfer
 * to the DEASI vault. Returns true if the transfer meets the minimum amount
 * and destination constraints.
 */
export async function verifyUsdcTransfer(
  sig: string,
  config: Pick<X402GateConfig, 'connection' | 'recipientUsdcAta' | 'usdcMint' | 'minAmountUsdc'>,
): Promise<{ valid: boolean; reason?: string }> {
  let tx: ParsedTransactionWithMeta | null;

  try {
    tx = await config.connection.getParsedTransaction(sig, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
  } catch (e) {
    return { valid: false, reason: `RPC error fetching tx: ${String(e)}` };
  }

  if (!tx) {
    return { valid: false, reason: 'Transaction not found or not yet confirmed' };
  }

  if (tx.meta?.err !== null && tx.meta?.err !== undefined) {
    return { valid: false, reason: `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}` };
  }

  // Validate SPL token transfer instructions
  const instructions = tx.transaction.message.instructions;
  let paymentFound = false;

  for (const ix of instructions) {
    if (!('parsed' in ix) || !ix.parsed) continue;

    const { type, info } = ix.parsed as {
      type: string;
      info: Record<string, string>;
    };

    // Accept both 'transfer' (ATA-to-ATA) and 'transferChecked' (safer, includes mint check)
    if (type === 'transfer' || type === 'transferChecked') {
      const destination: string = info['destination'] ?? '';
      const amount: string = info['amount'] ?? info['tokenAmount']?.amount ?? '0';
      const mint: string = info['mint'] ?? '';

      const destinationMatches = destination === config.recipientUsdcAta;
      const amountSufficient = BigInt(amount) >= BigInt(config.minAmountUsdc);
      // For transferChecked, validate mint; for plain transfer we trust ATA derivation
      const mintMatches = type === 'transfer' ? true : mint === config.usdcMint;

      if (destinationMatches && amountSufficient && mintMatches) {
        paymentFound = true;
        break;
      }
    }
  }

  if (!paymentFound) {
    return {
      valid: false,
      reason: `No valid USDC transfer ≥ ${config.minAmountUsdc} atomic units to vault ${config.recipientUsdcAta} found in tx`,
    };
  }

  return { valid: true };
}

// ── Middleware Factory ────────────────────────────────────────────────────────

/**
 * Creates an Express middleware that gates the route behind x402 USDC payment.
 * Returns a structured HTTP 402 body per x402 V2 spec when no payment is found.
 * Performs on-chain verification and replay protection before calling next().
 */
export function createX402Gate(config: X402GateConfig) {
  const {
    minAmountUsdc,
    recipientUsdcAta,
    usdcMint,
    connection,
    processedSigs,
    routeLabel,
    acceptSessionTokens = false,
  } = config;

  const paymentRequired: X402PaymentRequired = {
    x402Version: X402_VERSION,
    error: 'Payment Required',
    accepts: [
      {
        scheme: 'exact',
        network: 'solana-mainnet',
        maxAmountRequired: String(minAmountUsdc),
        payTo: recipientUsdcAta,
        asset: {
          address: usdcMint,
          decimals: USDC_DECIMALS,
          symbol: 'USDC',
        },
        description: `DEASI execution fee for ${routeLabel} — Richard Patterson (@De-ASI-INTERFACE)`,
        extra: {
          uid: 'RP-DEASI-JUP-2026-0619-001',
          owner: 'Richard Patterson (@De-ASI-INTERFACE)',
        },
      },
    ],
  };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // ── Session token bypass (HFT workloads) ──────────────────────────────────
    if (acceptSessionTokens) {
      const sessionToken = req.headers['x-402-session'] as string | undefined;
      if (sessionToken) {
        const sessionResult = validateSessionToken(sessionToken, minAmountUsdc);
        if (sessionResult.valid) {
          next();
          return;
        }
        // Invalid session falls through to signature check — don't error immediately
      }
    }

    // ── Signature-based payment verification ──────────────────────────────────
    const sig = req.headers['x-payment'] as string | undefined;

    if (!sig || sig.trim() === '') {
      res.setHeader('Content-Type', 'application/json');
      res.status(402).json(paymentRequired);
      return;
    }

    // Replay protection check — must happen BEFORE on-chain verification
    if (processedSigs.has(sig)) {
      res.status(402).json({
        x402Version: X402_VERSION,
        error: 'Payment signature already used (replay detected)',
        uid: 'RP-DEASI-JUP-2026-0619-001',
      });
      return;
    }

    // On-chain verification
    const result = await verifyUsdcTransfer(sig, {
      connection,
      recipientUsdcAta,
      usdcMint,
      minAmountUsdc,
    });

    if (!result.valid) {
      res.status(402).json({
        x402Version: X402_VERSION,
        error: result.reason ?? 'Payment verification failed',
        accepts: paymentRequired.accepts,
        uid: 'RP-DEASI-JUP-2026-0619-001',
      });
      return;
    }

    // Mark sig as consumed BEFORE calling next() — atomicity invariant
    processedSigs.add(sig);

    // Attach payment context to request for downstream logging
    (req as Request & { x402?: Record<string, unknown> }).x402 = {
      sig,
      amountUsdc: minAmountUsdc,
      route: routeLabel,
      settledAt: Date.now(),
    };

    next();
  };
}
