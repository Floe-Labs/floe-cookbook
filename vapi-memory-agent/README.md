# Vapi × Floe × HydraDB — a voice agent that actually remembers you

A phone concierge with **real long-term memory**. Tell it your name and preferences on one call, hang up, **call back later — and it remembers**, because its memory lives in [HydraDB](https://dev-dashboard.floelabs.xyz/vendors/hydradb), not in a context window.

The point: an agent's **brain** and its **memory** are two different vendors — and here **one Floe key pays for both**, with one programmable spend limit. No Venice key, no HydraDB key, no wallet.

- **Brain** — the agent thinks on [Venice](https://dev-dashboard.floelabs.xyz/vendors/venice-compute) through Floe (metered per token).
- **Memory** — it stores and recalls facts in **HydraDB** through Floe (`$0.004` ingest, `$0.002` query), with **hard per-agent tenant isolation** — your memories are yours, auto-isolated by the shim.
- **One key, unified billing** — every model token and every memory op meters on the same Floe key. One ledger, one ceiling.

## The "wow"

```text
  Call #1                             Call #2 (minutes or days later)
  ───────                             ──────────────────────────────
  AI:  Hi — first time we've talked?  AI:  Welcome back, Alex! Still avoiding
  You: I'm Alex, allergic to               shellfish? Want me to keep that in
       shellfish.                          mind for the Lisbon trip in October?
  AI:  Got it — I'll remember that.
       (→ HydraDB ingest)                  (→ HydraDB recall, before it even speaks)
```

Nothing about you sits in the prompt between calls — it's in HydraDB, retrieved on demand.

## How it works

```text
   Phone call
      │
      ▼
   ┌────────┐  custom-llm   ┌──────────────┐   /v1/venice     ┌──────────┐
   │  Vapi  │ ────────────▶ │ venice-llm   │ ───────────────▶ │   Floe   │──▶ Venice
   └────────┘   (shim)      │   shim       │                  │ (metered)│
      │  remember / recall          │                          └──────────┘
      ▼                             │  /v1/proxy/fetch → marketplace shim   ▲
   /vapi/tool-call ─────────────────┴────────────────────────────────────┐ │
                                                                          ▼ │
                                                                       HydraDB
```

- **Recall happens *before* the call, not during it.** `call.ts` queries HydraDB while the phone is ringing, injects what it finds into the prompt (a `{{memory}}` variable) and bakes a personalized greeting into the first message. So the caller hears *"Welcome back, Alex…"* the instant they pick up — no in-call lookup latency. (Recalling mid-call, through two proxies plus a model turn, is what made an earlier version feel broken.)
- **Remember happens *during* the call.** When the caller shares a new fact, the model calls `remember(fact)` → HydraDB **ingest** through Floe's proxy. The prompt forces an actual tool call per fact (a model that just *says* "I'll remember" without calling the tool stores nothing).
- Memory persists because HydraDB is keyed to your Floe agent (auto-derived tenant) — so the next call recalls what this one stored.

## Setup

```bash
cp .env.example .env       # fill in Vapi + Floe keys, your phone number
npm install
npm run setup              # provisions the HydraDB store, sets the spend limit,
                           # creates the assistant → prints VAPI_ASSISTANT_ID (add it to .env)
npm run start              # terminal 2 — server + LLM shim (keep ngrok pointed at it)
npm run call               # dials TARGET_PHONE_NUMBER
```

Tell it your name and a preference, hang up, then `npm run call` again — it greets you by memory.

> **First-run note:** `setup` provisions your HydraDB store in the **background** (a few seconds to a minute). If the very first `remember` says memory is unavailable, wait a moment and try again — the store is still being created.

## Prove it without a phone call

```bash
npm run proof
```

Runs the memory loop (remember → recall → the model uses it) and prints the Floe ledger — **HydraDB ops and Venice inference on the same key**:

```text
  💾 memory  marketplace.floelabs.xyz     $0.000000  success   ← HydraDB (free today)
  💾 memory  marketplace.floelabs.xyz     $0.000000  success
  💾 memory  marketplace.floelabs.xyz     $0.000000  success
  🧠 model   api.venice.ai                $0.000110  success   ← Venice (metered)
  ──────────────────────────────
  Σ ONE Floe key:  $0.000110   (4 charges)
```

> **HydraDB is currently free through Floe** (`x-floe-payment: free`) — the vendor page lists `$0.004` ingest / `$0.002` query, but metering isn't switched on yet, so memory ops show `$0` today. What the demo proves regardless: **one Floe key reaches every vendor, no per-vendor keys or wallet, and everything lands on one ledger under one spend limit.** When HydraDB metering turns on, it bills the same key — no code change.

## Configuration

| Env | Purpose |
|---|---|
| `VENICE_MODEL` | Any Venice chat model — see `/vendors/venice-compute`. |
| `FLOE_SPEND_LIMIT_RAW` | One spend ceiling (USDC base units) across model + memory. `250000` = $0.25. |

## Notes

- **Per-caller memory (multi-tenant):** this demo uses one memory store for the agent (fine for a single caller). To isolate callers, pass `subTenantId` (e.g. the caller's number) on the ingest/query calls — HydraDB namespaces within your forced tenant. See [the vendor page](https://dev-dashboard.floelabs.xyz/vendors/hydradb).
- **No secrets in the agent:** no HydraDB key, no Venice key, no wallet — just one Floe key. The proxy signs and meters every vendor call.
