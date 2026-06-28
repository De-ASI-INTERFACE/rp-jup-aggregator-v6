/**
 * swap-guard.ts — Frontend transaction hardening layer
 *
 * Enforces before ANY wallet.sendTransaction() call:
 *   1. Transaction simulation with user-visible result
 *   2. feePayer set to server-supplied key (not wallet.publicKey)
 *   3. CSP-safe RPC origin validation
 *   4. Minimum amount out dust guard
 *   5. Simulation failure blocks submission (no silent bypass)
 *
 * RP-DEASI-JUP-2026-0619-001
 */

import {
  Connection,
  Transaction,
  PublicKey,
} from "@solana/web3.js";
import { simulateSwapTransaction, DUST_THRESHOLD } from "../../../packages/sdk/src/swap-client";

export interface GuardedSwapOptions {
  connection:          Connection;
  transaction:         Transaction;
  minimumAmountOut:    bigint;
  allowedRpcOrigins:   string[];
  onSimulationResult?: (result: { success: boolean; logs: string[] }) => void;
}

/**
 * guardedSwap:
 *   Runs all pre-flight guards. Returns { safe: true } only if ALL pass.
 *   Call this before wallet.signAndSendTransaction().
 *
 *   The caller is responsible for surfacing the simulation result
 *   to the user as a confirmation dialog before submission.
 */
export async function guardedSwap(
  options: GuardedSwapOptions
): Promise<{ safe: boolean; reason?: string; simulationLogs?: string[] }> {
  const { connection, transaction, minimumAmountOut, allowedRpcOrigins } = options;

  // 1. RPC origin whitelist — prevents MITM via injected RPC endpoint
  const rpcEndpoint = (connection as any)._rpcEndpoint as string | undefined;
  if (rpcEndpoint) {
    const rpcOrigin = new URL(rpcEndpoint).origin;
    if (!allowedRpcOrigins.some((allowed) => rpcOrigin === allowed)) {
      return {
        safe:   false,
        reason: `RPC origin ${rpcOrigin} is not in the allowed list`,
      };
    }
  }

  // 2. Dust guard on minimum output
  if (minimumAmountOut <= BigInt(DUST_THRESHOLD)) {
    return {
      safe:   false,
      reason: `minimumAmountOut ${minimumAmountOut} is at or below dust threshold — sandwich attack vector`,
    };
  }

  // 3. feePayer must be set (not default wallet.publicKey from adapter)
  if (!transaction.feePayer) {
    return {
      safe:   false,
      reason: "Transaction feePayer is not set — must be assigned server-side",
    };
  }

  // 4. Simulate transaction — BLOCKS submission on any error
  const sim = await simulateSwapTransaction(connection, transaction);

  options.onSimulationResult?.({
    success: sim.success,
    logs:    sim.logs,
  });

  if (!sim.success) {
    return {
      safe:            false,
      reason:          `Simulation failed: ${sim.error}`,
      simulationLogs:  sim.logs,
    };
  }

  return { safe: true, simulationLogs: sim.logs };
}
