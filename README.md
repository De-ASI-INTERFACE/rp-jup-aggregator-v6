# rp-jup-aggregator-v6

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Solana](https://img.shields.io/badge/Chain-Solana_Mainnet-9945FF?style=flat-square&logo=solana&logoColor=white)](https://solana.com)
[![Jupiter](https://img.shields.io/badge/Jupiter-V6_API-FF6B35?style=flat-square)](https://jup.ag)
[![HTTP 402](https://img.shields.io/badge/HTTP-402_Payment_Gating-00c853?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=flat-square)](./LICENSE)
[![GitHub Org](https://img.shields.io/badge/Org-De--ASI--INTERFACE-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/De-ASI-INTERFACE)

> **Identifier:** RP-DEASI-JUP-2026-0619-001
> **Author:** Richard Patterson ([@De-ASI-INTERFACE](https://github.com/De-ASI-INTERFACE) | [@QuantumTradingInfinity](https://github.com/QuantumTradingInfinity))
> **Deployer Wallet:** `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my`
> **Network:** Solana Mainnet-Beta

A Jupiter Aggregator V6-compatible monorepo implementing HTTP 402 payment-gated swap routing on Solana. Enables pay-per-use swap execution with autonomous bot support and a Next.js frontend UI.

---

## Monorepo Structure

| Package | Description |
|---|---|
| `packages/sdk` | Core Jupiter V6 quote, swap, and instruction helpers |
| `packages/api` | Express HTTP 402-gated REST API (port 4002) |
| `packages/bot` | Autonomous swap execution bot |
| `apps/frontend` | Next.js swap UI |

---

## Architecture

```
Client / Bot
  └─ packages/sdk (Jupiter V6 quote + swap helpers)
       ↓
  packages/api (Express, HTTP 402 payment gate)
       ├─ Validates payment proof
       └─ Routes swap via Jupiter V6 → Solana Mainnet-Beta
       ↓
  apps/frontend (Next.js UI)
       └─ Wallet connect + swap interface
```

---

## Quick Start

```bash
git clone https://github.com/De-ASI-INTERFACE/rp-jup-aggregator-v6
cd rp-jup-aggregator-v6
cp .env.example .env   # Configure RPC URL, Jupiter endpoint, payment keys
npm install
npm run build
npm run dev
```

---

## Key Addresses

| Label | Address |
|---|---|
| Deployer | `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my` |
| wSOL | `So11111111111111111111111111111111111111112` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

---

## Related Repositories

| Repo | Purpose |
|---|---|
| [qti-launch-site](https://github.com/De-ASI-INTERFACE/qti-launch-site) | QTI public launch UI consuming this SDK |
| [QTI-token](https://github.com/De-ASI-INTERFACE/QTI-token) | QTI SPL token metadata and assets |
| [solana-defi-protocol-core](https://github.com/De-ASI-INTERFACE/solana-defi-protocol-core) | CPAMM and DeFi protocol core |
| [qti-emissions-controller](https://github.com/De-ASI-INTERFACE/qti-emissions-controller) | On-chain emissions for staking |

---

*© 2026 Richard Patterson — Apache-2.0 License*
