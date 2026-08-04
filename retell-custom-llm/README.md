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

```
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
  the unguessable path secret is the auth. Keep `LLM_PATH_SECRET` long, rotate
  it by redeploying.
- **Turn racing**: Retell can supersede a turn (`reminder_required`, barge-in).
  The adapter tracks the latest `response_id` and abandons stale streams.
- **The other legs** (STT/TTS/telephony) stay on Retell — govern them with
  **Reconcile Mode**: `POST /v1/developer/orchestrators` (provider `retell`,
  secret = your Retell API key, which Retell signs webhooks with), then point
  the agent's webhook at the returned `call-end` URL and the phone number's
  inbound webhook at the `pre-call` URL — an over-budget agent's next inbound
  call is rejected before it connects.
- Spend proof: `GET /v1/agents/transactions` on your Floe key.
