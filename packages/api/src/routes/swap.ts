/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * Swap Route — Richard Patterson (@De-ASI-INTERFACE)
 * Project: RP-JUP-EXECUTIONER-V1
 */
import { Router, Request, Response } from 'express';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getQuote, buildSwapTransaction, executeSwap } from '@rp/sdk';

export const swapRouter = Router();

/**
 * assertSlippage — pre-execution guard.
 *
 * Jupiter returns `otherAmountThreshold` as the minimum output (ExactIn) or
 * maximum input (ExactOut) that the route guarantees given the requested
 * slippageBps. If the live outAmount already breaches that threshold before
 * we even send the transaction, we reject early and save the priority fee.
 *
 * @param outAmount              Quoted output in base units (string from Jupiter)
 * @param otherAmountThreshold   Jupiter's guaranteed minimum output (string)
 * @param swapMode               'ExactIn' | 'ExactOut'
 */
function assertSlippage(
  outAmount: string,
  otherAmountThreshold: string,
  swapMode: string,
): void {
  const out = BigInt(outAmount);
  const threshold = BigInt(otherAmountThreshold);

  if (swapMode === 'ExactIn' && out < threshold) {
    throw new Error(
      `Slippage guard: outAmount ${outAmount} is below otherAmountThreshold ${
        otherAmountThreshold
      }. Transaction aborted to preserve priority fees.`,
    );
  }

  if (swapMode === 'ExactOut' && out > threshold) {
    throw new Error(
      `Slippage guard: inAmount ${outAmount} exceeds otherAmountThreshold ${
        otherAmountThreshold
      } (ExactOut). Transaction aborted to preserve priority fees.`,
    );
  }
}

swapRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { inputMint, outputMint, amount, slippageBps, userPublicKey, execute } = req.body;
    if (!inputMint || !outputMint || !amount || !userPublicKey) {
      res.status(400).json({
        error: 'inputMint, outputMint, amount, and userPublicKey are required',
      });
      return;
    }

    const quote = await getQuote({
      inputMint,
      outputMint,
      amount: Number(amount),
      slippageBps: slippageBps ?? 50,
    });

    // ── SLIPPAGE GUARD ───────────────────────────────────────────────────
    assertSlippage(
      String(quote.outAmount),
      String(quote.otherAmountThreshold),
      quote.swapMode,
    );

    const tx = await buildSwapTransaction(quote, userPublicKey);

    if (execute && process.env.PRIVATE_KEY) {
      const connection = new Connection(
        process.env.SOLANA_RPC_MAINNET || 'https://api.mainnet-beta.solana.com',
      );
      const keypair = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
      const txid = await executeSwap(connection, tx, [keypair]);
      res.json({ txid, explorer: `https://solscan.io/tx/${txid}` });
    } else {
      const serialized = Buffer.from(tx.serialize()).toString('base64');
      res.json({ transaction: serialized, quote });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isSlippageError = message.includes('Slippage guard');
    res.status(isSlippageError ? 422 : 500).json({ error: message });
  }
});
