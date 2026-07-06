# x402 Client

Delegate credit to the Floe facilitator, then call x402 APIs without managing
payments. Gas-free. This is the minimal payment example — your agent never holds
or transfers USDC directly; Floe handles all payment mechanics behind the scenes.

## What it demonstrates

- One-time credit delegation to the Floe facilitator via `grant_credit_delegation`.
- Calling any x402-gated API with automatic, gas-free payment via `x402_fetch`.
- Reading remaining credit balance via `x402_get_balance`.

## Stack

| | |
|---|---|
| Language | TypeScript |
| Framework | Coinbase AgentKit |
| Floe surface | x402 payment facilitator |

## Prerequisites

- Node.js 18+
- A Floe API key — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)
- A private key and Base RPC URL, plus facilitator details (see `.env.example`)

## Run

```bash
cp .env.example .env      # private key, RPC URL, facilitator details
npm install
npx tsx index.ts
```

The script delegates credit once, calls an x402 API with payment handled
automatically, then prints the remaining balance.

## Key actions used

- `grant_credit_delegation` — one-time credit delegation setup
- `x402_fetch` — call any x402 API with automatic payment
- `x402_get_balance` — check remaining credit balance

## Learn more

- [Floe docs — x402 directory](https://floe-labs.gitbook.io/docs/x402-directory)
- [TypeScript SDK (`floe-agent`)](https://github.com/Floe-Labs/agentkit-actions)
