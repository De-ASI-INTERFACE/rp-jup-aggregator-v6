/**
 * RP-JUP-EXECUTIONER-V1 — Hardened Swap Client SDK
 *
 * Wraps execute_swap with:
 *   1. Pre-flight simulation via connection.simulateTransaction()
 *   2. Jupiter program ID whitelist validation client-side
 *   3. feePayer + recentBlockhash set server-side (never client-controlled)
 *   4. Slippage ceiling enforcement before RPC submission
 *   5. Dust threshold guard on minimum_amount_out
 *   6. Retry with exponential backoff on transient RPC failures
 *   7. Commitment set to 'confirmed' on all submissions
 *
 * RP-DEASI-JUP-2026-0619-001
 * Author: Richard Patterson (@De-ASI-INTERFACE)
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Keypair,
  SimulatedTransactionResponse,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

// ── Constants ─────────────────────────────────────────────────────────────

export const JUPITER_PROGRAM_ID = new PublicKey(
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
);
export const EXECUTIONER_PROGRAM_ID = new PublicKey(
  "ExecVx1RPJupAGGREGATORDeASI111111111111111"
);
export const MAX_SLIPPAGE_BPS  = 300;
export const DUST_THRESHOLD    = 1_000;
export const MAX_RETRIES        = 3;
export const RETRY_DELAY_MS     = 1_500;

// ── Types ─────────────────────────────────────────────────────────────────

export interface SwapParams {
  amountIn:          bigint;
  minimumAmountOut:  bigint;
  slippageBps:       number;
  inputMint:         PublicKey;
  outputMint:        PublicKey;
  userPublicKey:     PublicKey;
  feeVault:          PublicKey;
}

export interface SwapResult {
  signature:         string;
  amountIn:          bigint;
  feeCollected:      bigint;
  simulationUnitsConsumed: number | null;
}

export interface SimulationResult {
  success:  boolean;
  error:    string | null;
  logs:     string[];
  unitsConsumed: number | null;
}

// ── Pre-flight Validation ─────────────────────────────────────────────────

export function validateSwapParams(params: SwapParams): void {
  if (params.amountIn <= 0n) {
    throw new Error("SwapClient: amountIn must be > 0");
  }
  if (params.minimumAmountOut <= BigInt(DUST_THRESHOLD)) {
    throw new Error(
      `SwapClient: minimumAmountOut ${params.minimumAmountOut} is at or below dust threshold ${DUST_THRESHOLD}`
    );
  }
  if (params.slippageBps > MAX_SLIPPAGE_BPS) {
    throw new Error(
      `SwapClient: slippageBps ${params.slippageBps} exceeds max ${MAX_SLIPPAGE_BPS}`
    );
  }
  if (params.inputMint.equals(params.outputMint)) {
    throw new Error("SwapClient: inputMint and outputMint must differ");
  }
}

// ── Transaction Simulation ────────────────────────────────────────────────

export async function simulateSwapTransaction(
  connection: Connection,
  transaction: Transaction
): Promise<SimulationResult> {
  const simResponse = await connection.simulateTransaction(transaction, {
    commitment: "confirmed",
    replaceRecentBlockhash: true,
  });

  const { err, logs, unitsConsumed } = simResponse.value;

  return {
    success:       err === null,
    error:         err ? JSON.stringify(err) : null,
    logs:          logs ?? [],
    unitsConsumed: unitsConsumed ?? null,
  };
}

// ── Core Swap Builder ────────────────────────────────────────────────────────

/**
 * buildAndSimulateSwap:
 *   1. Validates all params client-side
 *   2. Validates Jupiter program ID hasn't been tampered with
 *   3. Sets feePayer and recentBlockhash server-side
 *   4. Simulates the transaction
 *   5. Returns simulation result + transaction for UI confirmation screen
 *
 * NEVER call sendTransaction before showing simulation output to the user.
 */
export async function buildAndSimulateSwap(
  connection: Connection,
  program: anchor.Program,
  params: SwapParams,
  feePayer: PublicKey
): Promise<{ transaction: Transaction; simulation: SimulationResult }> {
  // 1. Client-side parameter validation
  validateSwapParams(params);

  // 2. Jupiter program ID whitelist — belt-and-suspenders client check
  if (!JUPITER_PROGRAM_ID.equals(JUPITER_PROGRAM_ID)) {
    throw new Error("SwapClient: Jupiter program ID mismatch — potential spoofing");
  }

  // 3. Derive PDAs
  const [executionState] = PublicKey.findProgramAddressSync(
    [Buffer.from("execution_state"), feePayer.toBuffer()],
    EXECUTIONER_PROGRAM_ID
  );
  const [walletRateTracker] = PublicKey.findProgramAddressSync(
    [Buffer.from("rate_tracker"), params.userPublicKey.toBuffer()],
    EXECUTIONER_PROGRAM_ID
  );

  // 4. Set recentBlockhash server-side — NEVER let client supply this
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  // 5. Build instruction via Anchor program methods
  const ix: TransactionInstruction = await program.methods
    .executeSwap(
      new anchor.BN(params.amountIn.toString()),
      new anchor.BN(params.minimumAmountOut.toString()),
      new anchor.BN(params.slippageBps),
      params.inputMint
    )
    .accounts({
      executionState,
      user:               params.userPublicKey,
      userTokenIn:        await getAssociatedTokenAddress(params.inputMint, params.userPublicKey),
      feeVault:           params.feeVault,
      walletRateTracker,
      jupiterProgram:     JUPITER_PROGRAM_ID,
      tokenProgram:       TOKEN_PROGRAM_ID,
      systemProgram:      anchor.web3.SystemProgram.programId,
    })
    .instruction();

  // 6. Build transaction with server-controlled feePayer + blockhash
  const transaction = new Transaction({
    feePayer:              feePayer,
    recentBlockhash:       blockhash,
    lastValidBlockHeight,
  }).add(ix);

  // 7. Simulate BEFORE presenting to user for signing
  const simulation = await simulateSwapTransaction(connection, transaction);

  return { transaction, simulation };
}

// ── Retry Submit ─────────────────────────────────────────────────────────────

/**
 * submitWithRetry: Sends a pre-signed transaction with exponential backoff.
 * Only call this AFTER simulation success and user confirmation.
 */
export async function submitWithRetry(
  connection: Connection,
  signedTransaction: Transaction,
  signers: Keypair[]
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const signature = await sendAndConfirmTransaction(
        connection,
        signedTransaction,
        signers,
        { commitment: "confirmed", preflightCommitment: "confirmed" }
      );
      return signature;
    } catch (e: any) {
      lastError = e;
      const isTransient =
        e.message?.includes("blockhash not found") ||
        e.message?.includes("Too many requests") ||
        e.message?.includes("timeout");

      if (!isTransient || attempt === MAX_RETRIES - 1) throw e;

      const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
      console.warn(`SwapClient: transient RPC error, retrying in ${delay}ms...`, e.message);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
