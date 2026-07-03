# Vapi × Floe — Venice-powered voice agent (one credit line for model + tools)

A phone-based voice concierge whose **LLM inference *and* paid tool calls both meter on a single Floe credit line** — with an audible budget taper and a hard-stop when the cap is reached.

- **Compute plane** — the agent *thinks* on [Venice](https://venice.ai) (x402-native, open models) through Floe's metered proxy. Floe fronts one pooled Venice balance and debits the agent the at-cost token usage. No Venice key.
- **Tool plane** — the agent *looks things up* via Exa web search, paid through Floe's x402 proxy. No wallet.
- **One ceiling** — both draw on the same agent credit line + session spend-limit. When the budget runs out, the agent tells the caller and stops — it never overspends.

> This is the sibling of [`vapi-voice-agent`](../vapi-voice-agent), which governs only the tool plane (its brain is GPT-4o, called directly by Vapi, off Floe). Here the **model itself** is governed too.

## How it works

```text
   Phone call
      │
      ▼
   ┌────────┐   custom-llm     ┌──────────────┐   POST /v1/venice     ┌────────────┐
   │  Vapi  │ ───────────────▶ │  venice-llm  │ ────────────────────▶ │    Floe    │──▶ Venice
   │ (voice)│   (this server)  │    shim      │   (Floe agent key)    │  (metered) │   (pooled)
   └────────┘                  └──────────────┘                       └────────────┘
      │  tool call (search_web)          │                                  ▲
      └──────────────────────────────────┴── POST /v1/proxy/fetch ──────────┘──▶ Exa
                                             (same credit line)
```

- Vapi's `custom-llm` provider points at `<SERVER_URL>/llm/<VAPI_SERVER_SECRET>` (the secret in the path authenticates this credit-line-spending endpoint — the server listens on `0.0.0.0`). The shim (`venice-llm.ts`) forwards each turn to Floe's OpenAI-compatible `/v1/venice/chat/completions` with `stream:false` (Floe meters per-call), then re-emits the completion to Vapi as a single-chunk SSE stream.
- `search_web` webhooks to `/vapi/tool-call`, which calls Exa through Floe's x402 proxy and appends a `[Floe budget: …]` line so the model can pace itself.
- The **real** enforcer is Floe's server-side session spend-limit (set in `setup.ts`). When it's exhausted, both planes get a `402` and the agent says it's out of budget.

## Prerequisites

- A [Vapi](https://dashboard.vapi.ai) account (private + public keys, a phone number)
- A funded [Floe](https://dev-dashboard.floelabs.xyz) **agent** API key (`floe_…`)
- [ngrok](https://ngrok.com) (or any public tunnel) so Vapi can reach this server
- Node 18+

## Setup

```bash
cp .env.example .env      # fill in keys; pick VENICE_MODEL + FLOE_SPEND_LIMIT_RAW
npm install
npm run start             # terminal 1 — webhook + LLM shim (keep ngrok pointed at it)
npm run setup             # terminal 2 — creates the Venice assistant + sets the spend cap
# add the printed VAPI_ASSISTANT_ID to .env, then:
npm run call              # dials TARGET_PHONE_NUMBER — the agent calls you
```

Ask a few factual lookups ("weather in San Francisco?", "what time does Tartine close?", "who won the game?", "latest news on X?"). Each search spends from the credit line; as the budget tapers the agent gets terser, and at the cap it tells you it's hit its limit and stops.

## Configuration

| Env | Purpose |
|---|---|
| `LLM_PROVIDER` | `venice` (default, governed) or `openai` (gpt-4o direct, off Floe — the contrast) |
| `VENICE_MODEL` | Any Venice chat model. Source of truth is the marketplace: `dev-dashboard.floelabs.xyz/vendors/venice-compute`. Default `mistral-small-3-2-24b-instruct` — fast + tool-calling, good for voice. |
| `FLOE_SPEND_LIMIT_RAW` | Session cap in USDC base units (6 dp). `50000` = $0.05. |

## Notes

- **Non-streaming.** Floe's metered Venice endpoint needs the terminal usage block to bill, so it refuses `stream:true`. The shim calls it with `stream:false` and fakes a one-chunk SSE stream back to Vapi. Snappier voice would stream tokens through the proxy — a follow-up, not needed here.
- **Model choice matters for voice.** Smaller Venice models cut latency; the default balances speed, tool reliability, and answer quality. Browse `/vendors/venice-compute` for the current list.
- **No secrets in the agent.** No Venice key (Floe's pool pays it); no wallet (the x402 proxy signs). The agent only holds a Floe API key.
