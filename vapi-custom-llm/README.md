# Vapi custom-llm → Floe — govern the model leg in one config field

Point your Vapi assistant's **custom LLM** at Floe's keyless gateway and the
model leg — ~60% of a typical per-call cost — becomes **pre-call governed**:
metered per token, refused with `402` *before* any tokens are bought once the
cap is hit, and attributed on your one Floe ledger. Real SSE streaming, tools
pass through verbatim, no shim required.

```
 Vapi (STT ⇄ TTS ⇄ telephony)          Floe keyless gateway
   └── custom-llm  ──stream──►  https://credit-api.floelabs.xyz/v1
        Authorization: Bearer floe_…      • metered per token
        (via Vapi custom-llm credential)  • 402 pre-call at the cap
                                          • X-Floe-Budget-Advisory per turn
```

## Direct integration (recommended start)

```bash
cp .env.example .env   # VAPI_API_KEY, FLOE_API_KEY, cap, model
npm install
npm run setup
```

What `setup.ts` does:
1. sets a **fail-closed session cap** on the Floe side (`PUT /v1/agents/spend-limit`),
2. creates a Vapi **custom-llm credential** carrying your `floe_` agent key
   (Vapi sends it as `Authorization: Bearer …` — model-config headers are not
   reliable, the credential is the supported path),
3. creates the assistant with `model.url = <floe>/v1` and a **fully-qualified
   catalog slug** (`openai/gpt-4o-mini`, `anthropic/claude-haiku-4-5`, … —
   discover with `GET /v1/models`).

## The honest boundary

- **Direct mode:** when the cap is hit, the gateway refuses the turn with a
  JSON `402` — Vapi sees a failed LLM request and ends/degrades the call per
  its error handling. Enforcement is exact; the *ending* is not graceful.
- **Shim mode (`npm run shim`):** one extra hop buys a clean goodbye — the
  shim streams Floe's SSE through untouched and turns a `402` into a spoken
  *"I've reached my budget limit for this call."* It also logs
  `X-Floe-Budget-Advisory` per turn (arrives before the first token), which
  is the hook for tapering to a cheaper model near the limit. To provision
  against it: start the shim, expose it publicly, set `SERVER_URL` +
  `SHIM_PATH_SECRET` in `.env`, and re-run `npm run setup` — the assistant's
  `model.url` then points at `$SERVER_URL/llm/$SHIM_PATH_SECRET`.
- **STT / TTS / telephony stay on Vapi** in this recipe. Govern them too:
  - **Reconcile Mode** — connect the agent (`POST /v1/developer/orchestrators`)
    and point Vapi's server webhook at the returned `call-end` URL: every
    call's full cost lands on the Floe ledger post-call, counts against your
    policies, and a tripped `suspend_agent` policy blocks the next session.
  - Or move legs onto Floe rails entirely — see
    [`migrate-to-full-coverage`](../migrate-to-full-coverage) (graduate to 100%
    coverage: every leg gated pre-call).

## Spend proof

```bash
curl -s https://credit-api.floelabs.xyz/v1/agents/transactions?limit=10 \
  -H "Authorization: Bearer $FLOE_API_KEY" | jq
```

BYOK variant: store your own provider key once
(`PUT /v1/developer/provider-keys/{provider}`) and the gateway prefers it —
your vendor credits pay for inference, Floe bills the service fee only.
