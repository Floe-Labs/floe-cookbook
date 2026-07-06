# Yield Optimizer

A treasury agent that borrows USDC against WETH collateral, deploys it to a yield
strategy, and repays before maturity. On-chain / self-custody.

> This example uses Floe's on-chain lending surface and signs from a private key.
> For the walletless, card-funded path, see the
> [Quickstart](https://floe-labs.gitbook.io/docs/developers/agent-quickstart).

## What it demonstrates

- Borrowing USDC against WETH collateral with auto-selected best rate.
- Deploying borrowed funds to a yield strategy (the strategy is yours to customize).
- Monitoring loan health and repaying with collateral auto-returned.

## Stack

| | |
|---|---|
| Language | TypeScript |
| Framework | Coinbase AgentKit |
| Floe surface | Lending (secured working capital) |

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

The script checks lending rates, borrows, deploys to your yield strategy,
monitors health, then repays.

## Key actions used

- `instant_borrow` — one-call borrow (auto-selects best lender)
- `check_credit_status` — health + accrued interest
- `repay_credit` — repay with auto-slippage; collateral returns automatically

## Learn more

- [Floe docs](https://floe-labs.gitbook.io/docs)
- [TypeScript SDK (`floe-agent`)](https://github.com/Floe-Labs/agentkit-actions)
