# Migrate to 100% coverage — orchestrator → Pipecat/LiveKit on Floe

Vapi, Retell, and Bland are **distribution**, not your critical path. You can govern spend *on* them — pre-call on the model leg, reconciled on the rest (see the platform guides) — but only part of each call is enforceable before the money moves. To get **every leg gated pre-call — 100% coverage — you move the call itself onto Floe rails** and run it on a self-hosted stack (Pipecat or LiveKit). Nothing else can offer that: a token router governs one leg; Floe governs all of them.

This guide stitches the existing recipes into a leg-by-leg migration. The cost/coverage math lives in the docs: **[Graduate to 100% coverage](https://floe-labs.gitbook.io/docs/build/migrate-to-full-coverage)**.

## The four legs

| Leg | Off the orchestrator | On Floe rails | Recipe |
|---|---|---|---|
| **LLM** | custom-llm → Floe (already pre-call) | Same endpoint: `https://credit-api.floelabs.xyz/v1` — nothing to change | [`drop-in-existing-agent`](../drop-in-existing-agent) · [`metered-llm`](../metered-llm) |
| **STT** | platform vendor, reconciled | Streaming WS `wss://credit-api.floelabs.xyz/v1/audio/transcriptions/stream?model=deepgram/nova-3&encoding=linear16&sample_rate=16000` — PCM in, transcripts out, metered per audio-second | [`livekit-voice-agent`](../livekit-voice-agent) |
| **TTS** | platform vendor, reconciled | `POST /v1/audio/speech` (OpenAI-compatible, e.g. `openai/tts-1`) — metered per character | [`livekit-voice-agent`](../livekit-voice-agent) |
| **Telephony** | platform carrier, reconciled | [Floe Phone](https://floe-labs.gitbook.io/docs/developers/floe-phone): `POST /v1/developer/agents/{id}/numbers` + `POST /v1/calls`, metered per minute | [`floe-phone-sales-agent`](../floe-phone-sales-agent) |

Each leg you move flips from **reconciled ⟳** (counted after the call, enforced next session) to **pre-call ✓** (refused *this* call at the cap). Watch your [coverage score](https://floe-labs.gitbook.io/docs/core-concepts/coverage-score) climb as you go.

## The destination: a full-stack agent already on Floe

Two runnable references where **every leg is already on Floe** — copy the wiring rather than rebuild it:

- **[`livekit-voice-agent`](../livekit-voice-agent)** — a LiveKit Agents pipeline with LLM + STT + TTS on Floe rails.
- **[`floe-phone-sales-agent`](../floe-phone-sales-agent)** — the fullest example: LLM, STT, TTS **and** telephony all on Floe. This is 100% coverage.

For any leg you keep off Floe *during* the migration, close the gap with **[`pipecat-livekit-reconcile`](../pipecat-livekit-reconcile)** — self-report each call's cost so budgets true up on the next session.

## Sequence it

You don't have to move everything at once — that's the whole point of the coverage score. Migrate a leg, watch the number climb, keep going:

1. **LLM first** (the biggest, most variable line) — point custom-llm at Floe. Coverage jumps to the LLM share.
2. **STT + TTS** — swap the transcriber and voice legs onto the Floe endpoints above.
3. **Telephony** — move the number onto Floe Phone. Now every leg is enforced pre-call: **100%**.
4. **Drop the orchestrator** when you're ready — you're running Pipecat/LiveKit on Floe, with no platform fee left to reconcile.

See the [cost & coverage calculator](https://floe-labs.gitbook.io/docs/build/migrate-to-full-coverage#coverage--cost-calculator) for the blended `$/call` on each posture — orchestrator-plus-Floe-LLM vs. full-path-on-Floe.
