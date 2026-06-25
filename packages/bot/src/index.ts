/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * RP-JUP-EXECUTIONER-V1 Swap Bot — Richard Patterson (@De-ASI-INTERFACE)
 * Deployer: CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my
 */
import 'dotenv/config';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getQuote, buildSwapTransaction, executeSwap, WSOL, USDC, accreditationBlock } from '@rp/sdk';

async function main() {
  console.log(accreditationBlock());
  const connection = new Connection(process.env.SOLANA_RPC_MAINNET || 'https://api.mainnet-beta.solana.com');
  const keypair = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY || ''));

  const amount = 10_000_000;
  console.log(`Quoting ${amount} lamports SOL -> USDC...`);
  const quote = await getQuote({ inputMint: WSOL, outputMint: USDC, amount, slippageBps: 50 });
  console.log(`Out amount: ${quote.outAmount} USDC (raw)`);

  const tx = await buildSwapTransaction(quote, keypair.publicKey.toBase58());
  const txid = await executeSwap(connection, tx, [keypair]);
  console.log(`Swap confirmed: https://solscan.io/tx/${txid}`);
}

main().catch(console.error);
