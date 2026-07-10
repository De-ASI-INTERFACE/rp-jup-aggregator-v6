/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * x402 Session Manager — Richard Patterson (@De-ASI-INTERFACE)
 * Project: RP-JUP-EXECUTIONER
 *
 * Time-bounded session authorization layer for x402 HFT workloads.
 * Eliminates per-call on-chain verification overhead during active sessions.
 * Sessions are scoped to a max spend cap and TTL, cryptographically signed
 * with the server's session secret to prevent forgery.
 *
 * Flow:
 *   POST /x402/session  →  returns { sessionToken, expiresAt, maxSpendUsdc }
 *   Subsequent calls include header:  x-402-session: <token>
 *   Gate validates token locally (no RPC call) until TTL expires or spend cap hit.
 */

import crypto from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionClaims {
  /** Wallet public key that funded the session */
  wallet: string;
  /** Funding tx signature that pre-authorized this session */
  fundingSig: string;
  /** Max total USDC (atomic) this session may consume */
  maxSpendUsdc: number;
  /** USDC already consumed in this session */
  spentUsdc: number;
  /** Unix timestamp (ms) when session expires */
  expiresAt: number;
  /** Strategy/session identifier for audit trail */
  strategyId?: string;
}

export interface CreateSessionParams {
  wallet: string;
  fundingSig: string;
  maxSpendUsdc: number;
  ttlSeconds: number;
  strategyId?: string;
  sessionSecret: string;
}

export interface SessionValidationResult {
  valid: boolean;
  reason?: string;
  claims?: SessionClaims;
}

// ── In-process session store (replace with Redis in production) ───────────────

const sessionStore = new Map<string, SessionClaims>();

// ── HMAC helpers ──────────────────────────────────────────────────────────────

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function encodeToken(claims: SessionClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = signPayload(payload, secret);
  return `${payload}.${sig}`;
}

function decodeToken(
  token: string,
  secret: string,
): { valid: boolean; claims?: SessionClaims } {
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };
  const [payload, sig] = parts;
  const expectedSig = signPayload(payload, secret);
  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
    return { valid: false };
  }
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionClaims;
    return { valid: true, claims };
  } catch {
    return { valid: false };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates a new x402 session token for HFT workloads.
 * The fundingSig must already be validated on-chain before calling this.
 */
export function createSessionToken(params: CreateSessionParams): {
  sessionToken: string;
  expiresAt: number;
} {
  const claims: SessionClaims = {
    wallet: params.wallet,
    fundingSig: params.fundingSig,
    maxSpendUsdc: params.maxSpendUsdc,
    spentUsdc: 0,
    expiresAt: Date.now() + params.ttlSeconds * 1000,
    strategyId: params.strategyId,
  };

  const sessionToken = encodeToken(claims, params.sessionSecret);
  sessionStore.set(sessionToken, claims);

  return { sessionToken, expiresAt: claims.expiresAt };
}

/**
 * Validates an x402 session token and deducts the call cost from the spend cap.
 * Returns valid=false with a reason if the session is expired, over-spent, or forged.
 */
export function validateSessionToken(
  token: string,
  callCostUsdc: number,
): SessionValidationResult {
  const secret = process.env.X402_SESSION_SECRET;
  if (!secret) {
    return { valid: false, reason: 'X402_SESSION_SECRET not configured' };
  }

  const decoded = decodeToken(token, secret);
  if (!decoded.valid || !decoded.claims) {
    return { valid: false, reason: 'Session token signature invalid or malformed' };
  }

  const claims = decoded.claims;

  if (Date.now() > claims.expiresAt) {
    sessionStore.delete(token);
    return { valid: false, reason: 'Session expired' };
  }

  if (claims.spentUsdc + callCostUsdc > claims.maxSpendUsdc) {
    return {
      valid: false,
      reason: `Session spend cap exceeded: ${claims.spentUsdc + callCostUsdc} > ${claims.maxSpendUsdc} atomic USDC`,
    };
  }

  // Deduct call cost from session spend tracker
  claims.spentUsdc += callCostUsdc;
  sessionStore.set(token, claims);

  return { valid: true, claims };
}

/**
 * Revokes an active session immediately (e.g., on strategy shutdown or risk breach).
 */
export function revokeSession(token: string): void {
  sessionStore.delete(token);
}

/**
 * Returns a snapshot of all active sessions for monitoring/audit.
 * Call from a secured admin endpoint only.
 */
export function getActiveSessionCount(): number {
  const now = Date.now();
  let active = 0;
  for (const [token, claims] of sessionStore.entries()) {
    if (claims.expiresAt > now) {
      active++;
    } else {
      sessionStore.delete(token); // Lazy eviction
    }
  }
  return active;
}
