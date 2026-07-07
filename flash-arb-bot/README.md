# Flash Arb Bot

Monitors price differences between Aerodrome pools and executes flash-loan
arbitrage when profitable. A crypto-native / MEV strategy on Floe's lending
surface. On-chain / self-custody.

> This example is on-chain and signs from a private key. It is for crypto-native
> use cases — see the [Quickstart](https://floe-labs.gitbook.io/docs/quickstart)
> for the walletless spend-layer path.

## What it demonstrates

- Reading the current flash-loan fee before acting.
- Deploying a one-time `FlashArbReceiver` contract.
- Scanning Aerodrome pools for profitable arbitrage and executing via flash loan.

## Stack

| | |
|---|---|
| Language | TypeScript |
| Framework | Coinbase AgentKit |
| Floe surface | Lending (flash loans) |

## Prerequisites

- Node.js 18+
- A Floe API key — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)
- A funded self-custody wallet on Base and an RPC URL (see `.env.example`)

## Run

```bash
cp .env.example .env      # private key and RPC URL
npm install
npx tsx index.ts
```

The bot checks the flash-loan fee, deploys the receiver contract once, scans for
opportunities, and executes profitable trades.

## Key actions used

- `get_flash_loan_fee` — current protocol fee for flash loans
- `deploy_flash_arb_receiver` — deploy your arb receiver contract
- `estimate_flash_arb_profit` — simulate arb profitability
- `flash_arb` — execute the flash-loan arbitrage

## Learn more

- [Floe docs](https://floe-labs.gitbook.io/docs)
- [TypeScript SDK (`floe-agent`)](https://github.com/Floe-Labs/agentkit-actions)
