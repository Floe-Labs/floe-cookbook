# LiveKit voice agent on Floe

A [LiveKit Agents](https://docs.livekit.io/agents/) voice agent whose **LLM and TTS bills meter on one Floe key** — no OpenAI account, no per-vendor billing. It's the "route your existing voice stack through Floe" pattern, for a real-time LiveKit/Pipecat-style loop.

```
LiveKit room ⇄ agent.py
   ├─ STT  Deepgram (streaming)      ← on Floe too: streaming STT WebSocket (see below)
   ├─ LLM  Floe keyless inference    ← on Floe  (base_url swap)
   └─ TTS  Floe keyless speech       ← on Floe  (base_url swap)
```

## All four legs can land on Floe

- **LLM** and **TTS** route to `https://credit-api.floelabs.xyz/v1` with your Floe agent key. Both are OpenAI-compatible, so it's a `base_url` + key swap — metered and capped on your Floe balance.
- **STT** no longer needs a BYO key: Floe's **streaming STT WebSocket is live** at `wss://credit-api.floelabs.xyz/v1/audio/transcriptions/stream?model=deepgram/nova-3&encoding=linear16&sample_rate=16000` (Bearer floe_ key; binary PCM in, `{type:'transcript', text, is_final, speech_final}` out, metered per audio-second). The `pipecat-floe` package's `FloeSTTService` wraps it for Pipecat; for LiveKit, point a websocket STT adapter at it. **This example ships the BYO Deepgram line below** — `agent.py` still constructs `deepgram.STT(...)` and needs `DEEPGRAM_API_KEY` to run as-is; swapping in a Floe adapter is the exercise, not the default. Either way the other three legs meter on Floe.

## Run it
```bash
pip install -r requirements.txt
cp .env.example .env      # Floe agent key, Deepgram key, LiveKit creds
python agent.py dev       # LiveKit Agents dev mode — connect from the LiveKit playground
```

Set a **spend cap** on the Floe agent (dashboard, or `PUT /v1/agents/spend-limit`) to bound the LLM + TTS spend for the run.

## How the Floe wiring works
LiveKit's OpenAI plugin talks to any OpenAI-compatible endpoint, so pointing it at Floe is a one-line change per leg (`agent.py`):
```python
llm = openai.LLM(model="openai/gpt-4o-mini", base_url=FLOE_BASE_URL, api_key=FLOE_API_KEY)
tts = openai.TTS(model="openai/tts-1", voice="alloy", base_url=FLOE_BASE_URL, api_key=FLOE_API_KEY)
stt = deepgram.STT(model="nova-3")   # BYO key variant — or use Floe streaming STT (see README note above)
```
Model ids stay **fully qualified** (`provider/model`) — that's what Floe Inference expects. See [Floe Inference](https://floe-labs.gitbook.io/docs/developers/keyless-inference) and [Add Floe to your existing pipeline](https://floe-labs.gitbook.io/docs/getting-started/integrate-existing-pipeline).

> **Enhancement:** to tag LLM/TTS calls with a per-session `X-Floe-Task-Id` (so a task budget bounds one conversation), pass a custom OpenAI client / default headers to the plugin. Left out here to keep the wiring obvious.

## Guarded by floe-guard

The Floe spend cap above is a *balance* enforced server-side. [floe-guard](https://github.com/Floe-Labs/floe-guard) adds a **local budget ceiling** — a dollar cap you own in-process that hard-stops a turn *before* its LLM call once this call's spend would cross it. Three lines wire it (`agent.py`):

```python
guard = BudgetGuard(limit_usd=FLOE_LOCAL_BUDGET_USD)
budget = LiveKitBudgetGuard(guard, model=FLOE_LLM_MODEL, stt_model="deepgram-nova-3")
budget.attach(session, agent)   # wraps llm_node (reserve) + metrics_collected (settle)
```

`attach` reserves against the ceiling before each model turn and settles the real token usage after — plus it meters the **Deepgram STT leg**, the one leg Floe never sees on this recipe. Scope is pre-turn admission + per-turn settlement: an admitted turn runs to completion, nothing cuts a turn off partway. Tune `FLOE_LOCAL_BUDGET_USD` in `.env`.
