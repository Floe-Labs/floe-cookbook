# Vapi voice legs → Floe — custom transcriber + custom voice

Put Floe **inside** Vapi's provider slots: this recipe patches an assistant so
its STT and TTS run through Floe's orchestrator surfaces (Vapi's own
`custom-transcriber` / `custom-voice` extension points — no partnership, no
BD). Combined with [`vapi-custom-llm`](../vapi-custom-llm), every leg except
telephony is metered, **pre-call gated**, and on one Floe ledger.

```text
 Vapi call
   ├─ STT  ──wss──►  /v1/orchestrator/transcriber   Deepgram multichannel via Floe
   │                 (stereo customer+assistant)     metered per audio-second
   ├─ LLM  ──sse──►  /v1  (see ../vapi-custom-llm)   metered per token
   └─ TTS  ──http─►  /v1/orchestrator/voice          ElevenLabs PCM via Floe
                     (voice-request → raw PCM16)     metered per character
```

## Run

```bash
cp .env.example .env      # VAPI_API_KEY, FLOE_API_KEY
npm install
npx tsx setup.ts <assistantId>
```

## Honest notes

- **Flag-gated + benchmarked first.** These surfaces sit in the live media
  path; Floe keeps them behind `ORCHESTRATOR_VOICE_ENABLED` until the added
  latency vs native Deepgram/ElevenLabs is measured and published
  (`apps/api/scripts/bench-orchestrator-voice.ts`). Check the docs for the
  current numbers before production traffic.
- **Budget cutoff mid-call**: the transcriber re-gates every 60s; an
  over-budget agent's STT socket closes (4402) and the TTS leg refuses 402 —
  Vapi then degrades per its own error handling. That is the deal: exact
  enforcement, orchestrator-controlled UX.
- Both legs bill against catalog rates (`deepgram/nova-3` per audio-second,
  `elevenlabs/eleven-turbo-v2-5` per character) — visible per-call in the
  dashboard's inference usage + coverage cards.
