# <Example name>

<One or two sentences: what this example is and the single thing it demonstrates.
Lead with the use case, not the SDK. If it's self-custody / on-chain, say so here.>

## What it demonstrates

- <Bullet 1 — the headline capability, in plain terms.>
- <Bullet 2 — the Floe feature it exercises: metered LLM, x402 spend, budget cap,
  lending, etc.>
- <Bullet 3 — anything notable: unified billing, server-side enforcement, taper,
  etc.>

## Stack

| | |
|---|---|
| Language | <TypeScript / Python / Config only> |
| Framework | <Vapi / LangChain / CrewAI / AgentKit / MCP / OpenAI Agents SDK / …> |
| Floe surface | <metered LLM proxy / x402 facilitator / lending / MCP tools> |

## Prerequisites

- <Runtime, e.g. Node.js 18+ or Python 3.10+>
- A Floe API key — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)
- <Any other keys or accounts the example needs (Vapi, OpenAI, ngrok, RPC, …)>
- <Self-custody only: a funded wallet on Base + an RPC endpoint>

## Run

```bash
cp .env.example .env      # fill in the keys listed above
# TypeScript
npm install && npx tsx index.ts
# Python
pip install -r requirements.txt && python main.py
```

<Optionally: a short "what you should see" block with expected output.>

## Learn more

- [Floe docs](https://floe-labs.gitbook.io/docs) — <link to the most relevant page>
- <Vendor/framework doc link, e.g. Vapi, LangChain, Venice, Exa>
