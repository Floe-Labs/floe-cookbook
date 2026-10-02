# floe-crewai-starter

[![guarded by floe-guard](https://img.shields.io/badge/guarded%20by-floe--guard-2f81f7.svg)](https://github.com/Floe-Labs/floe-guard)
[![CI](https://github.com/Floe-Labs/floe-crewai-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/Floe-Labs/floe-crewai-starter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Know what every run costs — then cap it.** A CrewAI crew that meters every LLM and
tool call on one Floe ledger, so you see the real cost per run — with a
[floe-guard](https://github.com/Floe-Labs/floe-guard) hard cap that kills the 3 AM
infinite loop at **$1**, not **$400**.

CrewAI's most expensive failure mode is the runaway loop — an agent re-feeds its
growing scratchpad into the next call, costs climb every turn, and no one is
awake to stop it. This starter ships the stop.

## Start building with Floe

One key for your agent's whole vendor bill — LLM, voice, telephony, search, data — metered per call and budget-capped. Let your coding agent set it up, or wire it yourself:

| Path | One line |
|---|---|
| **Agent** — Claude Code / Cursor does the setup | paste: `Read https://dev-dashboard.floelabs.xyz/agents.md and set up Floe for this project.` |
| **Skill** — install the Floe agent skill | `npx skills add floe-labs/agent-skills` |
| **MCP** — hosted MCP server (65 tools) | `npx -y add-mcp https://mcp.floelabs.xyz/mcp` |
| **NPM** — the CLI + SDK | `npm i -g floe-agent` |

New accounts get a **$3 Welcome Credit (300 API credits)** — no card. [Set up with your AI tools →](https://floe-labs.gitbook.io/docs/getting-started/setup-with-ai-tools) · [Get a key →](https://dev-dashboard.floelabs.xyz)

## See it stop a loop (no API key needed)

The killer first impression takes seconds and needs **no API key, no account, no
network**:

```bash
pip install -r requirements.txt
python demo.py
```

You'll watch a runaway loop's spend climb turn by turn, then floe-guard
hard-stop it the moment the next call would cross the ceiling:

```
A CrewAI agent is stuck in a runaway loop. Budget ceiling: $1.00.
Each turn re-sends the whole growing transcript, so every call costs more.

  turn # 1: +$0.0130  (running total $0.0130 / $1.00)
  ...
  turn #18: +$0.0980  (running total $0.9990 / $1.00)

floe-guard HARD-STOPPED the loop before turn #19.
  spent $0.9990 of the $1.00 ceiling — the next call would have crossed it, so it never ran.
  The 3 AM infinite loop dies here, not at $400.
```

The "LLM" here is a stub with growing token usage — priced offline from
floe-guard's bundled cost map. No crewai, no litellm, no key needed.

## Run on Replit

[![Run on Replit](https://replit.com/badge/github/Floe-Labs/floe-crewai-starter)](https://replit.com/new/github/Floe-Labs/floe-crewai-starter)

The Run button executes `python demo.py` — the zero-key budget demo, no secrets
needed. Add `OPENAI_API_KEY` in the Secrets tab to run the real crew.

## Use this template

Click **"Use this template" → "Create a new repository"** at the top of the
[GitHub repo](https://github.com/Floe-Labs/floe-crewai-starter) to get your own
copy, then clone and run.

## Run the real governed crew

Once you have an LLM key:

```bash
cp .env.example .env       # then add your OPENAI_API_KEY
python crew.py
```

`crew.py` is a minimal two-agent crew (a Researcher and a Writer). Both agents
share one guarded LLM and one budget:

```python
from floe_guard import BudgetGuard
from floe_guard.integrations.crewai import budget_guarded_llm, guard_crew

guard = BudgetGuard(limit_usd=1.00)
llm = budget_guarded_llm(guard, "gpt-4o", callbacks=[guard_crew(guard)])
# Pass llm=llm to every Agent in the crew, as build_crew() does in crew.py.
```

The wrapper meters through LiteLLM and checks the budget in the LLM call path.
Passing the callback explicitly keeps CrewAI initialization from replacing
LiteLLM's metering callback registry with an empty list.
Callback-only `guard_crew` registration cannot guarantee a stop because LiteLLM
can swallow callback exceptions. Once the budget is exhausted, the next guarded
call raises `BudgetExceeded` before dispatch. The ceiling defaults to **$1.00**
(override with `FLOE_BUDGET_USD`). An admitted call can exceed its estimate,
especially the first call, before final usage is known.

### Optional: one-env-var hosted upgrade

Set `FLOE_API_KEY` and `crew.py` makes one read-only GET to Floe's credit API
for your agent's **server-side remaining budget** and tightens the local ceiling
to it (the tighter of your auto-borrow headroom and session-spend remaining). Get
a key at the [Floe dashboard](https://dev-dashboard.floelabs.xyz/?utm_source=floe-crewai-starter&utm_medium=readme&utm_campaign=template).

Honest framing: this **reads** your remaining budget to inform the local cap. It
does not move enforcement server-side by itself, and it fails safe to the local
cap on any error (missing key, network, or parse).

## Honest scope

This starter ships the **local** floe-guard. Be clear about what that means:

- **What it does:** prices token usage offline (from floe-guard's bundled cost
  map) and stops the next guarded LLM call when the budget is exhausted.
  No network, on by default.
- **What it is not:** the local guard is **estimate-based and in-process**. It
  caps the LLM calls that run through this crew's LiteLLM path. It is not a
  server-side, un-bypassable cross-vendor cap. The `FLOE_API_KEY` upgrade only
  *reads* your remaining budget to tighten the local ceiling; it does not enforce
  on Floe's side.
- **Un-bypassable, cross-vendor enforcement** (caps that hold no matter which
  process or vendor spends — LLM tokens *and* paid x402 tool calls) is the hosted
  [Floe](https://floefinance.com/?utm_source=floe-crewai-starter&utm_medium=readme&utm_campaign=template)
  product.

## Configuration

| Env var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | for the real crew | — | OpenAI key for `crew.py`. The demo needs none. |
| `FLOE_BUDGET_USD` | no | `1.00` | Local spend ceiling in USD. |
| `FLOE_API_KEY` | no | — | Read-only hosted budget tightening. |
| `CREW_TOPIC` | no | a default topic | The topic the crew researches and summarizes. |

## Built with floe-guard

[![guarded by floe-guard](https://img.shields.io/badge/guarded%20by-floe--guard-2f81f7.svg)](https://github.com/Floe-Labs/floe-guard)

```markdown
[![guarded by floe-guard](https://img.shields.io/badge/guarded%20by-floe--guard-2f81f7.svg)](https://github.com/Floe-Labs/floe-guard)
```

## Floe governed-agent starters

One of three clonable templates that ship Floe spend-governance by default:

- [floe-vercel-ai-starter](https://github.com/Floe-Labs/floe-vercel-ai-starter) — Vercel AI SDK agent, deploy to Vercel
- [floe-crewai-starter](https://github.com/Floe-Labs/floe-crewai-starter) — CrewAI crew, run on Replit (you are here)
- [eve-floe](https://github.com/Floe-Labs/eve-floe) — Vercel Eve agent with per-subagent budgets

## License

MIT — see [LICENSE](./LICENSE).
