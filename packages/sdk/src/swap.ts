/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * Jupiter V6 Swap Helper — Richard Patterson (@De-ASI-INTERFACE)
 */
import fetch from 'cross-fetch';
import {
  Connection,
  VersionedTransaction,
} from '@solana/web3.js';
import { QuoteResponse } from './quote';

const JUP_QUOTE_API = process.env.JUP_QUOTE_API || 'https://quote-api.jup.ag/v6';

export async function buildSwapTransaction(
  quoteResponse: QuoteResponse,
  userPublicKey: string,
  wrapAndUnwrapSol = true,
  dynamicSlippageMaxBps = 300,
): Promise<VersionedTransaction> {
  const body: Record<string, unknown> = {
    quoteResponse,
    userPublicKey,
    wrapAndUnwrapSol,
    dynamicComputeUnitLimit: true,
    dynamicSlippage: { maxBps: dynamicSlippageMaxBps },
    prioritizationFeeLamports: {
      priorityLevelWithMaxLamports: { maxLamports: 10_000_000, priorityLevel: 'veryHigh' },
    },
  };

  const res = await fetch(`${JUP_QUOTE_API}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Swap API error: ${res.status}`);
  const { swapTransaction } = (await res.json()) as { swapTransaction: string };
  return VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
}

export async function executeSwap(
  connection: Connection,
  transaction: VersionedTransaction,
  signers: import('@solana/web3.js').Signer[],
): Promise<string> {
  transaction.sign(signers);
  const raw = transaction.serialize();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const txid = await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 3 });
  await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: txid }, 'confirmed');
  return txid;
}

export async function getSwapInstructions(
  quoteResponse: QuoteResponse,
  userPublicKey: string,
): Promise<{ swapInstruction: unknown; addressLookupTableAddresses: string[]; computeBudgetInstructions: unknown[] }> {
  const res = await fetch(`${JUP_QUOTE_API}/swap-instructions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteResponse, userPublicKey }),
  });
  if (!res.ok) throw new Error(`Swap instructions error: ${res.status}`);
  return res.json() as Promise<{ swapInstruction: unknown; addressLookupTableAddresses: string[]; computeBudgetInstructions: unknown[] }>;
}
