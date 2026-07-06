# agentkit-ts-chatbot

A minimal conversational agent in TypeScript: **AgentKit + Vercel AI SDK + Floe**.
It exposes every Floe action as a tool to an LLM, so you can borrow, pay an x402
endpoint, and repay through natural language.

> ⚠️ **Self-custody variant.** Signs from `PRIVATE_KEY`. For the no-crypto path
> (managed wallet, no key in env, card funding), see the
> [Quickstart](https://floe-labs.gitbook.io/docs/developers/agent-quickstart).
> This mirrors the Python [`langchain-agent`](../langchain-agent) example.

## What it demonstrates

- Exposing Floe actions as tools an LLM can call from chat.
- Borrow → pay an x402 endpoint → repay, driven by natural language.
- The conversational (LLM-in-the-loop) counterpart to the deterministic
  [`financial-os-loop`](../financial-os-loop).

## Stack

| | |
|---|---|
| Language | TypeScript |
| Framework | Coinbase AgentKit · Vercel AI SDK |
| Floe surface | Agent wallet · lending · x402 facilitator |

## Prerequisites

- Node.js 18+
- A Floe API key — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)
- `PRIVATE_KEY`, `BASE_RPC_URL`, `OPENAI_API_KEY` (see `.env.example`)

## Run

```bash
cp .env.example .env      # PRIVATE_KEY, BASE_RPC_URL, FLOE_API_KEY, OPENAI_API_KEY
npm install
npx tsx index.ts
```

### Example session

```text
You: What credit do I have available?
Agent: (calls get_credit_remaining) You have 4,500 USDC available, 10% utilized.

You: Borrow 5 USDC against 6 USDC of collateral for 7 days.
Agent: (calls instant_borrow) Done — loan #42 opened at 8% APR.

You: Call https://api.example.com/premium for me.
Agent: (calls estimate_x402_cost then x402_fetch) Cost was $0.03. Response: { "...": "..." }

You: Repay loan 42.
Agent: (calls repay_loan) Repaid. Collateral returned in the same tx.
```

## Learn more

- [Floe docs](https://floe-labs.gitbook.io/docs)
- [TypeScript SDK (`floe-agent`)](https://github.com/Floe-Labs/agentkit-actions)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
