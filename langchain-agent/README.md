# LangChain Agent

A LangChain agent with Floe's actions exposed as tools. Ask it to check markets,
borrow, or manage loans in natural language, and it calls Floe to execute.

## What it demonstrates

- Exposing Floe actions as LangChain tools an LLM can call.
- Natural-language borrow, health check, and repay against the lending surface.
- The Python integration path, mirroring the TypeScript `agentkit-ts-chatbot`.

## Stack

| | |
|---|---|
| Language | Python |
| Framework | LangChain |
| Floe surface | Lending (secured working capital) |

## Prerequisites

- Python 3.10+
- A Floe API key — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)
- The keys listed in `.env.example`

## Run

```bash
cp .env.example .env      # fill in your keys
pip install -r requirements.txt
python agent.py
```

You chat with the agent in natural language; it calls Floe actions to execute
your requests.

## Key actions used

- `get_markets` — see available lending markets
- `instant_borrow` — borrow USDC in one call
- `check_credit_status` — monitor loan health
- `repay_credit` — repay and get collateral back

## Learn more

- [Floe docs](https://floe-labs.gitbook.io/docs)
- [Python SDK (`floe-agentkit-actions`)](https://github.com/Floe-Labs/agentkit-actions-py)
- [LangChain docs](https://python.langchain.com/docs/introduction/)
