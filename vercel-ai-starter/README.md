# vercel-ai-starter

[![guarded by floe-guard](https://img.shields.io/badge/guarded%20by-floe--guard-5b8cff)](https://github.com/Floe-Labs/floe-guard)
[![CI](https://github.com/Floe-Labs/floe-cookbook/actions/workflows/ci.yml/badge.svg)](https://github.com/Floe-Labs/floe-cookbook/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](../LICENSE)

**Know what every call costs — then cap it.** A Vercel AI SDK chat agent that meters
every call on one Floe ledger, so you see the real cost per session — with a
[floe-guard](https://github.com/Floe-Labs/floe-guard) hard cap that stops the 3 AM
runaway at **$1**, not **$4,000**.

The killer first impression takes under a minute and needs **no API key, no
account, no network**: the homepage runs a runaway loop against a mock model and
shows floe-guard hard-stopping it at a $0.10 ceiling.

## Start building with Floe

One key for your agent's whole vendor bill — LLM, voice, telephony, search, data — metered per call and budget-capped. Let your coding agent set it up, or wire it yourself:

| Path | One line |
|---|---|
| **Agent** — Claude Code / Cursor does the setup | paste: `Read https://dev-dashboard.floelabs.xyz/agents.md and set up Floe for this project.` |
| **Skill** — install the Floe agent skill | `npx skills add floe-labs/agent-skills` |
| **MCP** — hosted MCP server (65 tools) | `npx -y add-mcp https://mcp.floelabs.xyz/mcp` |
| **NPM** — the CLI + SDK | `npm i -g floe-agent` |

New accounts get a **$3 Welcome Credit (300 API credits)** — no card. [Set up with your AI tools →](https://floe-labs.gitbook.io/docs/getting-started/setup-with-ai-tools) · [Get a key →](https://dev-dashboard.floelabs.xyz)

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Floe-Labs/floe-cookbook/tree/main/vercel-ai-starter&env=OPENAI_API_KEY&envDescription=OpenAI%20API%20key%20for%20live%20chat%20%28the%20zero-key%20demo%20needs%20none%29&envLink=https://github.com/Floe-Labs/floe-cookbook/tree/main/vercel-ai-starter%23go-live)

The deploy button prompts for `OPENAI_API_KEY`. You can deploy without it — the
zero-key demo still works; only live chat needs the key.

## The zero-key demo

```bash
npm install
npm run dev
# open http://localhost:3000 and click "Watch the budget stop a runaway loop"
```

Or hit the route directly:

```bash
curl http://localhost:3000/api/demo
```

You get a JSON transcript: the per-iteration spend, the iteration where the loop
was hard-stopped, spent vs. the $0.10 ceiling, and a human-readable message. It
runs the AI SDK's official mock model (`MockLanguageModelV1`) wrapped with
floe-guard's `budgetGuardMiddleware` — fully offline.

## Go live

1. Add your OpenAI key (copy `.env.example` to `.env.local`):

   ```bash
   OPENAI_API_KEY=sk-...
   ```

2. POST to the chat route:

   ```bash
   curl -X POST http://localhost:3000/api/chat \
     -H 'content-type: application/json' \
     -d '{"messages":[{"role":"user","content":"Say hello in one line."}]}'
   ```

The chat route runs `streamText` through a floe-guard-wrapped `gpt-4o`. Spend is
capped at `FLOE_BUDGET_USD` (default **$1.00**). The call that would cross the
ceiling throws `BudgetExceeded` before it runs.

### Optional: one-env-var hosted upgrade

Set `FLOE_API_KEY` and the starter makes one read-only call to Floe's credit API
to tighten the local ceiling to your server-side remaining budget. Get a key at
the [Floe dashboard](https://dev-dashboard.floelabs.xyz?utm_source=floe-vercel-ai-starter&utm_medium=readme&utm_campaign=template).

## Honest scope

This starter ships the **local** floe-guard. Be clear about what that means:

- **What it does:** prices token usage offline (from floe-guard's bundled cost
  map) and hard-stops your agent *in-process* before a call crosses the ceiling.
  No network, on by default.
- **What it is not:** the local guard is **estimate-based and in-process** — it
  caps the model calls that run through this app's wrapped model. It is not a
  server-side, un-bypassable cross-vendor cap. The `FLOE_API_KEY` upgrade only
  *reads* your remaining budget to tighten the local ceiling; it does not enforce
  on Floe's side.
- **Un-bypassable, cross-vendor enforcement** (caps that hold no matter which
  process or vendor spends) is the hosted [Floe](https://floefinance.com?utm_source=floe-vercel-ai-starter&utm_medium=readme&utm_campaign=template)
  product.

## Configuration

| Env var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | for live chat | — | OpenAI key for `/api/chat`. The demo needs none. |
| `FLOE_BUDGET_USD` | no | `1.00` | Local spend ceiling in USD. |
| `FLOE_API_KEY` | no | — | Read-only hosted budget tightening. |

## Floe governed-agent starters

One of three clonable templates that ship Floe spend-governance by default:

- [vercel-ai-starter](../vercel-ai-starter) — Vercel AI SDK agent, deploy to Vercel (you are here)
- [crewai-starter](../crewai-starter) — CrewAI crew, Replit-ready
- [eve-floe](../eve-floe) — Vercel Eve agent with per-subagent budgets

## License

MIT — see [LICENSE](../LICENSE).
