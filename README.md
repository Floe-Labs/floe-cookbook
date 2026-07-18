<p align="center">
  <h1 align="center">🍳 Floe Cookbook</h1>
  <p align="center">Reference AI agents built on Floe — the spend layer for agents. One Floe key pays every vendor, with programmable spend controls.</p>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="./.github/workflows/ci.yml"><img src="https://github.com/Floe-Labs/floe-cookbook/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://floe-labs.gitbook.io/docs"><img src="https://img.shields.io/badge/docs-gitbook-brightgreen.svg" alt="Docs"></a>
  <a href="https://x.com/FloeLabs"><img src="https://img.shields.io/badge/follow-%40FloeLabs-black.svg" alt="X / Twitter"></a>
  <a href="https://github.com/Floe-Labs"><img src="https://img.shields.io/badge/github-Floe--Labs-181717.svg" alt="GitHub"></a>
</p>

<p align="center">
  <a href="https://floelabs.xyz">Website</a> ·
  <a href="https://dev-dashboard.floelabs.xyz">Dashboard</a> ·
  <a href="https://floe-labs.gitbook.io/docs">Docs</a> ·
  <a href="https://floe-labs.gitbook.io/docs/quickstart">Quickstart</a>
</p>

---

## What is this?

A cookbook of small, self-contained reference agents that show **Floe** in real
frameworks — Vapi, LangChain, CrewAI, Coinbase AgentKit, MCP, the OpenAI Agents
SDK, and plain SDKs. Each folder is an independent example you can read, copy, and
run on its own. This is a **gallery, not a template** — there's nothing to clone
wholesale; pick the recipe closest to what you're building.

**Floe is the spend/billing layer for AI agents.** It's walletless and priced in
USD. **One Floe key** pays every vendor your agent uses — the model, memory,
tools, and 2,000+ x402 API services — through a single endpoint, governed by
programmable, context-aware spend controls. That's **unified billing** for
agents: rail-agnostic, one key, one ledger, no per-vendor accounts, no crypto.

> **Start free.** Create an agent key at the
> [dashboard](https://dev-dashboard.floelabs.xyz), fund it with a card, and your
> agent makes its first paid API call in minutes.

## What you can build

- **Voice agents** that pay per-lookup for live web search and stop cleanly at a budget — [`vapi-voice-agent`](./vapi-voice-agent), [`vapi-venice-voice-agent`](./vapi-venice-voice-agent) — or that **remember callers across calls** via HydraDB — [`hydra-memory-agent`](./hydra-memory-agent)
- **Budget-capped multi-agent crews** where a runaway loop dies at $1, not $414 — [`crewai-demo`](./crewai-demo)
- **Metered LLM access** — any OpenAI/Anthropic model behind one billed endpoint with a server-side cap — [`metered-llm`](./metered-llm)
- **Conversational agents** that pay x402 APIs from natural language — [`langchain-agent`](./langchain-agent)
- **Zero-install access from Claude Desktop / Cursor** via hosted MCP — [`mcp-demo`](./mcp-demo)
- **On-chain / self-custody agents** — treasury, yield, and flash-loan strategies — [`yield-optimizer`](./yield-optimizer), [`flash-arb-bot`](./flash-arb-bot)

## Examples

| Example | Language | Framework / Stack | Difficulty | What it shows | Link |
|---|---|---|---|---|---|
| **metered-llm** | TypeScript · Python | OpenAI SDK (framework-agnostic) | Beginner | Route any OpenAI/Anthropic model through Floe's metered proxy — per-token billing on one key, capped server-side, your provider key never stored. | [→](./metered-llm) |
| **x402-client** | TypeScript | Coinbase AgentKit | Beginner _(Preview)_ | The minimal payment example: delegate credit to the Floe facilitator, then call any x402 API with automatic, gas-free payment. | [→](./x402-client) |
| **mcp-demo** | Config only | Claude Desktop / Cursor (MCP) | Beginner | Connect Claude Desktop or Cursor to Floe's hosted MCP server in one line — read markets, intents, and loans with zero install. | [→](./mcp-demo) |
| **langchain-agent** | Python | LangChain | Beginner _(Preview)_ | A LangChain agent that exposes Floe actions as tools — check markets, borrow, monitor, and repay in natural language. | [→](./langchain-agent) |
| **openai-agents** | Config only | OpenAI Agents SDK | Beginner _(Preview)_ | Use Floe from the OpenAI Agents SDK today via MCP fallback, ahead of the native adapter. | [→](./openai-agents) |
| **crewai-demo** | Python | CrewAI · `crewai-floe` | Intermediate | Per-agent budgets with a hard, server-side ceiling: a rigged loop halts at $1, and a procurement crew enforces allowlists and per-role caps. _(Installs `crewai-floe` from a git branch until it lands on PyPI — see its README.)_ | [→](./crewai-demo) |
| **vapi-voice-agent** | TypeScript | Vapi · GPT-4o · ElevenLabs · Exa | Intermediate | An outbound voice concierge that pays for live web search through Floe, tapers as it nears its budget, and audibly hard-stops at the cap. | [→](./vapi-voice-agent) |
| **yield-optimizer** | TypeScript | Coinbase AgentKit | Intermediate _(Preview)_ | A treasury agent that borrows USDC against WETH, deploys to a yield strategy, monitors loan health, and repays. On-chain / self-custody. | [→](./yield-optimizer) |
| **vapi-venice-voice-agent** | TypeScript | Vapi · Venice · ElevenLabs · Exa | Advanced | Same voice concierge, but the **LLM inference itself** runs on Venice through Floe — model *and* tools metered on one key, with an audible hard-stop. | [→](./vapi-venice-voice-agent) |
| **hydra-memory-agent** | TypeScript | Vapi · Venice · HydraDB | Advanced | A voice concierge with **persistent memory** — it stores caller facts in HydraDB and recalls them, so a later call greets you by name. Brain (Venice) + memory (HydraDB) on **one Floe key**, no vendor keys. | [→](./hydra-memory-agent) |
| **flash-arb-bot** | TypeScript | Coinbase AgentKit | Advanced _(Preview)_ | On-chain flash-loan arbitrage across Aerodrome pools — a crypto-native / MEV strategy on Floe's lending surface. | [→](./flash-arb-bot) |

> **Difficulty** is a rough guide: _Beginner_ = a key and a few minutes;
> _Intermediate_ = a webhook, a framework, or a running server;
> _Advanced_ = self-custody / on-chain setup (a funded wallet, an RPC endpoint).
> **_(Preview)_** marks examples whose script is a printed walkthrough of the
> flow — full docs and env setup, but not yet runnable against the live API.
> Runnable versions are on the way; each README says exactly what runs today.

## Demos

Two of the most-requested flows, end to end. Click a card to watch (~90s each).

### Venice voice agent — model *and* tools on one Floe key

<a href="https://github.com/Floe-Labs/floe-cookbook/releases/download/demo-media-v1/venice-audiogram.mp4"><img src="./docs/media/poster-venice.png" alt="Watch the Venice voice-agent demo" width="640"></a>

A phone call where the LLM inference **and** the paid web-search tools both meter
on a single Floe key — tapering as the budget runs down to an audible hard-stop.
See [`vapi-venice-voice-agent`](./vapi-venice-voice-agent).

### Persistent-memory voice concierge — recall across calls

<a href="https://github.com/Floe-Labs/floe-cookbook/releases/download/demo-media-v2/memory-demo-labeled.mp4"><img src="./docs/media/poster-memory.png" alt="Watch the persistent-memory demo" width="640"></a>

The agent stores caller facts in HydraDB and recalls them on a later call — brain
(Venice) + memory (HydraDB) on **one Floe key**, no vendor keys.
See [`hydra-memory-agent`](./hydra-memory-agent).

## Quickstart

Watch the setup end to end (~90s each) — key, funding, and a first metered call:

<p>
  <a href="https://www.loom.com/share/5e2ff8743ba7435dba1c5429590ec223"><img src="https://cdn.loom.com/sessions/thumbnails/5e2ff8743ba7435dba1c5429590ec223-0fbcb4503a9852fe.gif" alt="Get started on Floe — OpenAI (~90s)" width="360"></a>
  <a href="https://www.loom.com/share/0e9c894131394fe78524608edd6e59c1"><img src="https://cdn.loom.com/sessions/thumbnails/0e9c894131394fe78524608edd6e59c1-678c7793ced6dc29.gif" alt="Get started on Floe — Anthropic (~90s)" width="360"></a>
</p>

Every example is standalone. Pick one, `cd` into it, and follow its README.

```bash
git clone https://github.com/Floe-Labs/floe-cookbook.git
cd floe-cookbook

# Pick an example — e.g. metered LLM calls through Floe's billed proxy
cd metered-llm
cp .env.example .env          # fill in FLOE_API_KEY (and any keys the README lists)

# TypeScript examples
npm install && npm start

# Python examples
pip install -r requirements.txt && python main.py
```

You'll need a Floe API key — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)
and fund it with a card. No wallet or crypto required for the spend-layer
examples; the on-chain examples list their extra prerequisites.

## Contributing

New recipes are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) and the
per-example README template at [docs/EXAMPLE_TEMPLATE.md](./docs/EXAMPLE_TEMPLATE.md).

## License

[MIT](./LICENSE) © Floe Labs
