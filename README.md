# rp-jup-executioner

> **UNIQUE CODE IDENTIFIER:** RP-DEASI-JUP-2026-0619-001  
> **Author:** Richard Patterson (@De-ASI-INTERFACE | @QuantumTradingInfinity | @richy.ai)  
> **Deployer Wallet:** `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my`  
> **Network:** Solana Mainnet-Beta

A Jupiter Aggregator V6-compatible monorepo for HTTP 402 payment-gated swap routing on Solana.

## Packages

| Package | Description |
|---|---|
| `packages/sdk` | Core Jupiter V6 quote, swap, and instruction helpers |
| `packages/api` | Express HTTP 402-gated REST API (port 4002) |
| `packages/bot` | Autonomous swap execution bot |
| `apps/frontend` | Next.js swap UI |

## Quick Start

```bash
cp .env.example .env
npm install
npm run build
npm run dev
```

## Addresses

- Deployer: `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my`
- AMM: `AMM1111111111111111111111111111111111111111`
- wSOL: `So11111111111111111111111111111111111111112`
- USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
