/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * Quote Route — Richard Patterson (@De-ASI-INTERFACE)
 */
import { Router, Request, Response } from 'express';
import { getQuote } from '@rp/sdk';

export const quoteRouter = Router();

quoteRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { inputMint, outputMint, amount, slippageBps, maxAccounts } = req.query;
    if (!inputMint || !outputMint || !amount) {
      res.status(400).json({ error: 'inputMint, outputMint, and amount are required' });
      return;
    }
    const quote = await getQuote({
      inputMint: String(inputMint),
      outputMint: String(outputMint),
      amount: Number(amount),
      slippageBps: slippageBps ? Number(slippageBps) : 50,
      maxAccounts: maxAccounts ? Number(maxAccounts) : undefined,
    });
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
