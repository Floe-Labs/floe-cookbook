# Retell custom-LLM → Floe — the WebSocket adapter

Retell's custom LLM is **not** a base_url swap: Retell connects out to *your*
WebSocket (`wss://…/llm/<secret>/<call_id>`) and speaks its own protocol
(`response_required` in → `response` chunks out). This recipe is that server —
a ~150-line adapter that turns each Retell turn into a **streaming Floe
gateway call**, which puts the model leg under Floe governance:

- every token metered on your one `floe_` key,
- **pre-call gated** — the turn that would start past the session cap is
  refused `402` before any tokens are bought,
- graceful ending — on `402` the adapter *speaks* "I've reached my budget
  limit for this call" and sets `end_call: true` (Retell hangs up cleanly),
- `X-Floe-Budget-Advisory` available per turn for tapering to a cheaper slug.

```text
 Retell (STT ⇄ TTS ⇄ telephony)
   └── custom-llm  ──wss──►  server.ts  ──SSE──►  Floe /v1/chat/completions
        response_required        │ adapter            metered • gated • ledgered
        response chunks     ◄────┘
```

## Run it

```bash
cp .env.example .env      # RETELL_API_KEY, FLOE_API_KEY, secrets, model
npm install
npm start                 # the adapter (expose: ngrok http 3112 → wss URL)
npm run setup             # sets the Floe cap, creates the Retell agent
```

Attach the created agent to a Retell number and call it.

## Notes

- **Socket auth**: Retell documents no auth header for the custom-LLM socket —
  the unguessable path secret is the auth. Keep `LLM_PATH_SECRET` long. To
  rotate it, redeploy with the new secret **and** update the agent's
  `llm_websocket_url` (or recreate the agent with `npm run setup`) — the URL
  written at setup time carries the old secret, so a redeploy alone locks the
  existing agent out.
- **Turn racing**: Retell can supersede a turn (`reminder_required`, barge-in).
  The adapter tracks the latest `response_id` and abandons stale streams.
- **The other legs** (STT/TTS/telephony) stay on Retell — govern them with
  **Reconcile Mode**: `POST /v1/developer/orchestrators` (provider `retell`,
  secret = your Retell API key, which Retell signs webhooks with), then point
  the agent's webhook at the returned `call-end` URL and the phone number's
  inbound webhook at the `pre-call` URL — an over-budget agent's next inbound
  call is rejected before it connects.
- Spend proof: `GET /v1/agents/transactions` on your Floe key.

## Guarded by floe-guard

The `402` above is Floe's *balance*, enforced server-side. [floe-guard](https://github.com/Floe-Labs/floe-guard) adds a **local budget ceiling** — a dollar cap you own in-process (`FLOE_LOCAL_BUDGET_USD`) that refuses a turn *before* it ever calls Floe. One guard per call plus the Retell adapter (`server.ts`):

```ts
const guard = new BudgetGuard(FLOE_LOCAL_BUDGET_USD);
const budget = new RetellBudgetGuard(guard, { model: FLOE_MODEL });

const turn = budget.beginTurn({ interaction_type: msg.interaction_type, response_id: responseId });
if (!turn.admitted) { send(BUDGET_STOP_LINE, true, true); return; }   // over the local cap
// … stream the turn …
budget.settleTurn(responseId, { promptTokens, completionTokens });   // meter real usage
```

`beginTurn` reserves before the model call and `settleTurn` meters the real token usage after; a newer `response_id` (barge-in) releases the prior turn's hold, and `budget.close()` frees any open reservation on hangup. Scope is pre-turn admission + per-turn settlement — nothing cuts a turn off partway.

> **Dependency note:** `"floe-guard": "^0.12.0"` in `package.json` resolves once floe-guard's voice-adapters release (PR [#76](https://github.com/Floe-Labs/floe-guard)) publishes to npm — this wiring is illustrative until then.
