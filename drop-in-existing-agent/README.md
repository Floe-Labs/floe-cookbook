# drop-in-existing-agent

**Already have an STT→LLM→TTS agent? Route its spend through Floe by changing
two lines.** No provider account, no vendor keys — point your existing `openai`
client at Floe's **keyless** gateway and Floe holds the upstream credential and
bills every call to one key.

This is the minimal "add Floe to what I already have" recipe: the smallest diff
on an agent you didn't build from scratch. If you want to keep using **your own**
provider key (BYOK) instead, see [`../metered-llm`](../metered-llm).

## What it demonstrates

- The two-line swap that routes an existing agent's LLM leg through Floe.
- The **keyless** path: no OpenAI/Anthropic key anywhere — Floe holds the upstream credential.
- Per-call cost returned on a response header, billed to one Floe key.

## The two-line swap (BEFORE → AFTER)

You already have a client like this, pointed straight at OpenAI with your own key:

```ts
// BEFORE — your existing agent, your OpenAI account
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // your provider key
});
const res = await client.chat.completions.create({
  model: "gpt-4o",
  messages,
});
```

Change **only** the `baseURL`, the `apiKey`, and the model id — everything else
stays:

```ts
// AFTER — same client, now keyless through Floe
const client = new OpenAI({
  baseURL: "https://credit-api.floelabs.xyz/v1", // ← Floe keyless gateway
  apiKey: process.env.FLOE_API_KEY,              // ← floe_<hex>, NOT a provider key
});
const res = await client.chat.completions.create({
  model: "openai/gpt-4o",                        // ← Floe-namespaced model id
  messages,
});
```

No `OPENAI_API_KEY`. Floe holds the upstream credential and bills each call to
your Floe key.

## Stack

| | |
|---|---|
| Language | TypeScript · Python |
| Framework | Standard `openai` SDK (framework-agnostic) |
| Floe surface | Keyless LLM gateway |

## How it works

| | |
|---|---|
| Base URL | `https://credit-api.floelabs.xyz/v1` — set as the SDK `baseURL`/`base_url`; the client appends `/chat/completions` |
| `Authorization: Bearer` | your Floe agent key `floe_<hex>` — the **only** key you pass; auth + billing identity |
| Provider key | **none** — Floe holds the upstream OpenAI credential, so you pass no provider key at all |
| `model` (in body) | Floe-namespaced id, e.g. `openai/gpt-4o` |
| Cost | billed to your Floe key; returned on the `X-Floe-Payment-Amount` (decimal USDC) response header, also `X-Floe-Cost-USDC` (raw 6-dp) |

### Keyless vs BYOK — which recipe?

| | this recipe (keyless) | [`../metered-llm`](../metered-llm) (BYOK) |
|---|---|---|
| Base URL | `…/v1` | `…/v1/llm` |
| Provider key | none — Floe holds it | your own, via `X-Floe-Provider-Key` |
| Model id | `openai/gpt-4o` | raw, e.g. `gpt-5.5` |
| Best for | "just add Floe, I have no provider account" | "keep my own OpenAI/Anthropic account, meter it" |

## The whole pipeline (optional)

This recipe swaps only the **LLM leg** — the minimal drop-in. Your STT and TTS
legs can route through Floe too: send those requests through
`POST https://credit-api.floelabs.xyz/v1/proxy/fetch` with header
`X-Floe-Task-Id` so one conversation rolls up into one cost line. See the guide:
[Integrate an existing pipeline](https://floe-labs.gitbook.io/docs/getting-started/integrate-existing-pipeline).

## Prerequisites

- Node.js 18+ or Python 3.10+
- A Floe agent key (`floe_<hex>`) — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)
- **No provider key.** That's the point — Floe holds the upstream credential.

## Run

```bash
cp .env.example .env      # FLOE_API_KEY (floe_<hex>) — that's all

# TypeScript
npm install && npm start

# Python
pip install -r requirements.txt && python main.py
```

Get a Floe agent key at the [dashboard](https://dev-dashboard.floelabs.xyz) →
Create an agent. Fund it with a card — no crypto, no wallet to manage.

## Learn more

- [Integrate an existing pipeline](https://floe-labs.gitbook.io/docs/getting-started/integrate-existing-pipeline) — route STT/TTS legs through Floe too
- Want to keep your own provider key? See [`../metered-llm`](../metered-llm) (BYOK metered proxy)
