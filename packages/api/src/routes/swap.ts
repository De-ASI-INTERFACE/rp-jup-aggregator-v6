/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * Swap Route — Richard Patterson (@De-ASI-INTERFACE)
 */
import { Router, Request, Response } from 'express';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getQuote, buildSwapTransaction, executeSwap } from '@rp/sdk';

export const swapRouter = Router();

swapRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { inputMint, outputMint, amount, slippageBps, userPublicKey, execute } = req.body;
    if (!inputMint || !outputMint || !amount || !userPublicKey) {
      res.status(400).json({ error: 'inputMint, outputMint, amount, and userPublicKey are required' });
      return;
    }
    const quote = await getQuote({ inputMint, outputMint, amount: Number(amount), slippageBps: slippageBps ?? 50 });
    const tx = await buildSwapTransaction(quote, userPublicKey);

    if (execute && process.env.PRIVATE_KEY) {
      const connection = new Connection(process.env.SOLANA_RPC_MAINNET || 'https://api.mainnet-beta.solana.com');
      const keypair = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
      const txid = await executeSwap(connection, tx, [keypair]);
      res.json({ txid, explorer: `https://solscan.io/tx/${txid}` });
    } else {
      const serialized = Buffer.from(tx.serialize()).toString('base64');
      res.json({ transaction: serialized, quote });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
