/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * Author: Richard Patterson (@De-ASI-INTERFACE)
 * RP-JUP-EXECUTIONER — Express app factory with x402 payment gate
 *
 * Replaces the static API key auth gate with onchain x402 USDC payment verification.
 * /quote requires $0.01 USDC per call; /swap requires $0.05 USDC per call.
 * Both routes support x402 session tokens (x-402-session header) for HFT bypass.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Connection } from '@solana/web3.js';
import { quoteRouter } from './routes/quote';
import { swapRouter } from './routes/swap';
import { createX402Gate } from './middleware/x402Gate';
import {
  createSessionToken,
  getActiveSessionCount,
  revokeSession,
} from './middleware/x402SessionManager';
import { accreditationBlock } from '@rp/sdk';

// ── Shared replay-protection store ──────────────────────────────────────────
// In production: replace with a Redis Set (SETNX with TTL) for multi-process safety
const processedSigs = new Set<string>();

export function createApp() {
  const app = express();

  // ── Validate required x402 environment variables ─────────────────────────
  const vaultUsdcAta = process.env.X402_VAULT_USDC_ACCOUNT;
  const usdcMint = process.env.X402_USDC_MINT;

  if (!vaultUsdcAta || !usdcMint) {
    throw new Error(
      '[x402] Missing required env: X402_VAULT_USDC_ACCOUNT and X402_USDC_MINT must be set. ' +
      'See .env.example for configuration.',
    );
  }

  const connection = new Connection(
    process.env.SOLANA_RPC_MAINNET || 'https://api.mainnet-beta.solana.com',
    'confirmed',
  );

  const acceptSessionTokens =
    process.env.X402_ACCEPT_SESSION_TOKENS === 'true';

  // ── CORS ────────────────────────────────────────────────────────────────────
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      // x-payment carries the Solana tx sig; x-402-session carries HFT session token
      allowedHeaders: ['Content-Type', 'x-payment', 'x-402-session'],
    }),
  );

  app.use(express.json());

  // ── Rate Limiter ─────────────────────────────────────────────────────────────
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '120', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded.',
      uid: 'RP-DEASI-JUP-2026-0619-001',
    },
  });

  app.use(limiter);

  // ── x402 Payment Gates ──────────────────────────────────────────────────────
  // Quote: 10,000 atomic USDC = $0.01 per quote request
  const quoteGate = createX402Gate({
    minAmountUsdc: parseInt(process.env.X402_QUOTE_FEE_USDC || '10000', 10),
    recipientUsdcAta: vaultUsdcAta,
    usdcMint,
    connection,
    processedSigs,
    routeLabel: 'GET /quote',
    acceptSessionTokens,
  });

  // Swap: 50,000 atomic USDC = $0.05 per swap execution
  const swapGate = createX402Gate({
    minAmountUsdc: parseInt(process.env.X402_SWAP_FEE_USDC || '50000', 10),
    recipientUsdcAta: vaultUsdcAta,
    usdcMint,
    connection,
    processedSigs,
    routeLabel: 'POST /swap',
    acceptSessionTokens,
  });

  // ── Routes ───────────────────────────────────────────────────────────────────
  app.use('/quote', quoteGate, quoteRouter);
  app.use('/swap', swapGate, swapRouter);

  // ── Session Management Endpoints ─────────────────────────────────────────────
  /**
   * POST /x402/session
   * Creates a time-bounded session token for HFT workloads.
   * Requires a valid one-time payment signature for the full session funding amount.
   * Body: { wallet, fundingSig, maxSpendUsdc, ttlSeconds, strategyId? }
   */
  app.post('/x402/session', async (req, res) => {
    const secret = process.env.X402_SESSION_SECRET;
    if (!secret) {
      res.status(500).json({ error: 'Session management not configured on this instance' });
      return;
    }
    if (!acceptSessionTokens) {
      res.status(403).json({ error: 'Session tokens disabled on this instance' });
      return;
    }

    const { wallet, fundingSig, maxSpendUsdc, ttlSeconds, strategyId } = req.body;
    if (!wallet || !fundingSig || !maxSpendUsdc || !ttlSeconds) {
      res.status(400).json({
        error: 'wallet, fundingSig, maxSpendUsdc, and ttlSeconds are required',
      });
      return;
    }

    // Validate that the funding signature covers the full maxSpendUsdc on-chain
    const { verifyUsdcTransfer } = await import('./middleware/x402Gate');
    const verification = await verifyUsdcTransfer(fundingSig, {
      connection,
      recipientUsdcAta: vaultUsdcAta,
      usdcMint,
      minAmountUsdc: Number(maxSpendUsdc),
    });

    if (!verification.valid) {
      res.status(402).json({
        x402Version: 2,
        error: `Session funding payment invalid: ${verification.reason}`,
      });
      return;
    }

    if (processedSigs.has(fundingSig)) {
      res.status(402).json({ x402Version: 2, error: 'Funding signature already consumed' });
      return;
    }
    processedSigs.add(fundingSig);

    const { sessionToken, expiresAt } = createSessionToken({
      wallet,
      fundingSig,
      maxSpendUsdc: Number(maxSpendUsdc),
      ttlSeconds: Number(ttlSeconds),
      strategyId,
      sessionSecret: secret,
    });

    res.json({
      sessionToken,
      expiresAt,
      maxSpendUsdc,
      uid: 'RP-DEASI-JUP-2026-0619-001',
      owner: 'Richard Patterson (@De-ASI-INTERFACE)',
    });
  });

  /**
   * DELETE /x402/session
   * Immediately revokes an active session (strategy shutdown / risk breach).
   * Body: { sessionToken }
   */
  app.delete('/x402/session', (req, res) => {
    const { sessionToken } = req.body;
    if (!sessionToken) {
      res.status(400).json({ error: 'sessionToken is required' });
      return;
    }
    revokeSession(sessionToken);
    res.json({ revoked: true, uid: 'RP-DEASI-JUP-2026-0619-001' });
  });

  // ── Health ───────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      x402: {
        version: 2,
        network: 'solana-mainnet',
        vaultUsdc: vaultUsdcAta,
        sessionTokensEnabled: acceptSessionTokens,
        activeSessions: acceptSessionTokens ? getActiveSessionCount() : null,
        processedSigsCount: processedSigs.size,
      },
      accreditation: accreditationBlock(),
    });
  });

  return app;
}
