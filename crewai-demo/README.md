# CrewAI + Floe — budget-enabled crews

**A single Floe key caps everything a crew spends — LLM tokens *and* paid tool
calls — with a hard, server-side ceiling. The 3 AM infinite loop dies at $1, not
$414.**

CrewAI's #1 community complaint is runaway cost from agentic loops. These two
demos put a single, server-enforced dollar wall around a crew.

## What it demonstrates

- A hard, **server-side** spend ceiling on a crew — enforced by Floe, not by the
  LLM behaving.
- Metering both planes on one key: LLM tokens (via the metered proxy) and paid
  x402 tool calls.
- Per-agent budget isolation and host allowlists within a single crew.

| Demo | What it proves |
|---|---|
| [`loop_kill.py`](./loop_kill.py) | A crew deliberately rigged to loop, with its LLM routed through the Floe metered proxy under a `FloeBudget($1)`. The proxy auto-borrows then **refuses past $1** (`402 budget_exhausted`), so the loop **halts**. Contrast: Ondřej Popelka's real overnight CrewAI run that burned **$414 on Gemini** ([crewAI#4495](https://github.com/crewAIInc/crewAI/issues/4495)). Prints cumulative spend at halt. |
| [`procurement_crew.py`](./procurement_crew.py) | Three `budget_enabled_agent`s — Researcher ($1), Buyer ($5, allowlist `{hostA:$2, hostB:$1}`), Manager ($0). The Buyer pays a real x402 call within budget; an **off-allowlist host** is refused (`host_not_allowlisted`); an **overspend** is refused. Prints a per-agent spend ledger from the `step_callback`. |

## Stack

| | |
|---|---|
| Language | Python |
| Framework | CrewAI · `crewai-floe` (`budget_enabled_agent`, `FloeBudget`, `Floe402Tool`, `FloeLLM`) |
| Floe surface | Metered LLM proxy · x402 facilitator · session spend caps |

## Prerequisites

- Python 3.10+
- A funded Floe credit key (`floe_…`) — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)
- A wallet key (`PRIVATE_KEY`) for delegation provisioning
- The `loop_kill.py` demo additionally needs the metered LLM proxy at
  `<FLOE_API_BASE_URL>/v1/llm`

Both demos talk to a **live Floe API + facilitator** — nothing is mocked.

| Variable | Used by | Purpose |
|---|---|---|
| `PRIVATE_KEY` | both | Wallet key (0x…) — the agent's Floe identity; funds delegation provisioning. |
| `FLOE_FACILITATOR_API_KEY` | both | Floe credit key (`floe_…`); auths the facilitator + proxy and is what gets debited. |
| `FLOE_API_BASE_URL` | both | Floe credit API base (default `https://credit-api.floelabs.xyz`). Proxy = `<base>/v1/llm`. |
| `CHAIN_ID` | both | Base mainnet (`8453`). |
| `OPENAI_API_KEY` | `loop_kill.py` | Upstream provider key, passed through to the proxy (`X-Floe-Provider-Key`). Floe stores none. |
| `FLOE_LLM_MODEL` | `loop_kill.py` | Optional model override (default `openai/gpt-4o`). |
| `FLOE_DEMO_HOST_A_URL` / `_B_URL` / `_OFFLIST_URL` | `procurement_crew.py` | Real x402-gated endpoints (A/B allowlisted; offlist not). |

## Run

```bash
cp .env.example .env      # fill in the keys above
pip install -r requirements.txt

python loop_kill.py
python procurement_crew.py
```

Until `crewai-floe` is published to PyPI, `requirements.txt` installs it directly
from the `feat/crewai-integration` branch (agentkit-actions-py PR #27). Once that
PR merges and releases, swap the git line for `crewai-floe>=0.1.0`.

Without the required env vars set, each script prints exactly what it needs and
exits cleanly — it will **not** fabricate output.

## Per-agent budget isolation (procurement demo)

All three agents share a single `PRIVATE_KEY` wallet — no per-role keys.
`budget_enabled_agent` provisions a **distinct Floe managed agent** (its own
budget) per call, so the $1 / $5 / $0 budgets are isolated even under one wallet.
Floe caps managed agents at **5 per developer**, so a crew can have up to 5
budgeted agents.

## How enforcement works (the honest version)

The **hard cap is server-side**: the facilitator and the metered proxy refuse
calls once the budget / session cap / allowlist says no — regardless of what the
agent decides to do. The `budget_aware` backstory and `floe_budget_status` tool
are *soft* signals that help an agent finish on budget; they are not the
protection. That's why `procurement_crew.py` includes deterministic enforcement
probes (calling the same facilitator path directly) alongside the agentic crew
run — the blocks are a property of the server, not of the LLM behaving.

## Learn more

- [Floe docs](https://floe-labs.gitbook.io/docs)
- [Python SDK (`floe-agentkit-actions`)](https://github.com/Floe-Labs/agentkit-actions-py)
- [CrewAI docs](https://docs.crewai.com)
