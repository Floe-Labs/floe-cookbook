# metered-llm

**Route any agent's LLM through Floe's metered proxy.** One OpenAI-compatible
endpoint fronts **any** OpenAI or Anthropic model — billed per token to your Floe
key and **capped server-side**. No model lock, no provider account juggling, and
your provider key never leaves your request.

This is the framework-agnostic version: just the standard `openai` SDK pointed at
Floe. (For the budget-aware "$1-not-$414 loop kill", see [`../crewai-demo`](../crewai-demo).)

> **Watch the setup** (~90s each):
> [OpenAI](https://www.loom.com/share/5e2ff8743ba7435dba1c5429590ec223) ·
> [Anthropic](https://www.loom.com/share/0e9c894131394fe78524608edd6e59c1)

## What it demonstrates

- Fronting any priced OpenAI/Anthropic model through a single billed endpoint.
- Per-token metering to one Floe key, with cost returned on a response header.
- A server-side session cap: calls past your budget are refused, not billed.

## Stack

| | |
|---|---|
| Language | TypeScript · Python |
| Framework | Standard `openai` SDK (framework-agnostic) |
| Floe surface | Metered LLM proxy |

## How it works

| | |
|---|---|
| Base URL | `https://credit-api.floelabs.xyz/v1/llm` — set as the SDK `baseURL`/`base_url`; the client appends `/chat/completions` (and `/embeddings`) |
| `Authorization: Bearer` | your Floe agent key `floe_<hex>` — auth + billing identity |
| `X-Floe-Provider-Key` | your OpenAI/Anthropic key — passed through to the provider, **never stored** |
| `model` (in body) | **any** priced model: `gpt-5.5`, `claude-opus-4-8`, `claude-sonnet-4-6`, `gpt-5.4-mini`, … |
| Cost | metered to your Floe key; returned on the `X-Floe-Cost-USDC` response header |
| Cap | set a session spend limit — calls past your budget are **refused server-side**, not billed |

## Prerequisites

- Node.js 18+ or Python 3.10+
- A Floe agent key (`floe_<hex>`) — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)
- An OpenAI or Anthropic provider key (`PROVIDER_API_KEY`)

## Run

```bash
cp .env.example .env      # FLOE_API_KEY (floe_<hex>) and PROVIDER_API_KEY

# TypeScript
npm install && npm start

# Python
pip install -r requirements.txt && python main.py
```

Get a Floe agent key at the [dashboard](https://dev-dashboard.floelabs.xyz) →
Create an agent. Fund it with a card — no crypto, no wallet to manage.

## Learn more

- [Floe docs — Compute / metered LLM](https://floe-labs.gitbook.io/docs/x402-directory/compute)
