/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * Jupiter V6 Quote Helper — Richard Patterson (@De-ASI-INTERFACE)
 * Project: RP-JUP-EXECUTIONER
 */
import fetch from 'cross-fetch';

const JUP_QUOTE_API = process.env.JUP_QUOTE_API || 'https://quote-api.jup.ag/v6';

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
  maxAccounts?: number;
  excludeDexes?: string[];
}

export interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  routePlan: unknown[];
  [key: string]: unknown;
}

export async function getQuote(params: QuoteParams): Promise<QuoteResponse> {
  const url = new URL(`${JUP_QUOTE_API}/quote`);
  url.searchParams.set('inputMint', params.inputMint);
  url.searchParams.set('outputMint', params.outputMint);
  url.searchParams.set('amount', String(params.amount));
  url.searchParams.set('slippageBps', String(params.slippageBps ?? 50));
  if (params.maxAccounts) url.searchParams.set('maxAccounts', String(params.maxAccounts));
  if (params.excludeDexes?.length) url.searchParams.set('excludeDexes', params.excludeDexes.join(','));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Quote API error: ${res.status}`);
  return res.json() as Promise<QuoteResponse>;
}
