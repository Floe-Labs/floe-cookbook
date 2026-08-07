# Pipecat / LiveKit → Floe Reconcile Mode (self-report cost)

Pipecat and [LiveKit Agents](https://docs.livekit.io/agents/) are **self-hosted**
frameworks. There is no platform sitting between you and the caller, so — unlike
Vapi/Retell/Bland — **nothing fires a "call cost" webhook**. Your own code is the
only thing that knows what the call cost. This recipe is that: at session end,
**you POST the cost to Floe**, signed. Floe records it and enforces the agent's
budget on its **next** session.

## Read this first — the better path is pre-call, not reconcile

Reconcile is a **fallback**. It can only enforce *between* calls, because the
cost arrives *after* the call is over. If a single call blows the budget, that
call still completed.

The stronger option is to **route the legs through Floe** so spend is metered and
**gated before each token/second is bought** — a single Floe key for LLM (and
STT/TTS), capped server-side. Both Pipecat and LiveKit take an OpenAI-compatible
`base_url`, so it's a one-line swap per leg:

- **[`../livekit-voice-agent`](../livekit-voice-agent)** — a LiveKit agent with LLM + TTS on Floe (and Floe's streaming STT WebSocket for the third leg).
- **[`../metered-llm`](../metered-llm)** — the framework-agnostic version: any model behind one billed, server-side-capped endpoint.

Use Reconcile **only for the legs Floe does not carry** — a BYO STT or TTS vendor
you call directly, telephony, or a tool Floe can't meter. Everything already on
Floe is on your ledger; **don't self-report it too, or it bills twice.**

## Coverage boundary (state it plainly)

| | On Floe's gateway | Self-reported here (Reconcile) |
|---|---|---|
| Metered | per token / second, automatically | only what you compute and POST |
| Enforced | **pre-call** — the call/turn that would exceed the cap is refused | **between calls** — the *next* session is blocked; the current one already ran |
| Trust | Floe measured it | you asserted it (signed, but self-declared) |

So: put as many legs on Floe as you can, and use this to close the gap on the
rest so the budget still trues up before the next call.

## How it works

At end of call, your agent code does one POST:

```http
POST {FLOE_CREDIT_API}/v1/webhooks/{pipecat|livekit}/call-end/{token}
X-Floe-Signature: <hex HMAC-SHA256(secret, raw request body)>
Content-Type: application/json

{
  "external_call_id": "<your session/room/call id>",
  "cost_usd": 0.045,
  "duration_seconds": 142,
  "floe_task_id": "<optional>",
  "floe_customer_id": "<optional>"
}
```

- **`token`** — a capability token that identifies your Reconcile connection (in the webhook URL). Unguessable; identifies, does not authenticate.
- **`X-Floe-Signature`** — `hex HMAC-SHA256(secret, rawBody)` over the **exact bytes** you send. The secret is the per-connection secret Floe returns at registration. Compute the HMAC over the serialized body *before* sending, and send those same bytes — don't re-serialize, or the signature won't match.
- Ingestion **dedupes on `external_call_id`**, so a retry (same id) is a safe no-op — it won't double-bill.

## Get a connection (token + secret)

Register once, either way:

- **Dashboard**: [dev-dashboard.floelabs.xyz](https://dev-dashboard.floelabs.xyz) → your agent → Reconcile / orchestrators.
- **API**: `POST /v1/developer/orchestrators` with a developer key (`floe_live_…`):

  ```json
  { "agentId": 123, "provider": "pipecat", "label": "my voice agent" }
  ```

The response gives you the **webhook URL** (contains the `token`) and the
**secret** — shown **once**. Put both in `.env`.

## Run

```bash
cp .env.example .env      # FLOE_ORCHESTRATOR_TOKEN, FLOE_ORCHESTRATOR_SECRET
pip install -r requirements.txt

python reconcile.py            # provider = pipecat (default)
python reconcile.py livekit    # or livekit
```

The script simulates one finished call, computes a cost for the **non-Floe**
legs, signs the body, and POSTs it. The POST is real; the call is simulated so
you can try it with only a Floe connection. To wire it into a real agent, call
the same POST from your Pipecat/LiveKit session-end handler with the real
`external_call_id`, duration, and your computed cost.

## Notes

- **What to put in `cost_usd`**: only the legs Floe didn't meter. See `cost_for_call()` in `reconcile.py` — it sums BYO STT + TTS per-second rates as an example. Replace with your real usage.
- **Enforcement is between-call by design.** A self-hosted loop can't be gated mid-turn from outside your process. If you need a hard mid-call ceiling, route that leg through Floe (see the recipes linked above).
- Spend proof: `GET /v1/agents/transactions` on your Floe key — reconciled calls appear alongside gateway usage on one ledger.
