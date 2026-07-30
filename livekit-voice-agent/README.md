# LiveKit voice agent on Floe

A [LiveKit Agents](https://docs.livekit.io/agents/) voice agent whose **LLM and TTS bills meter on one Floe key** — no OpenAI account, no per-vendor billing. It's the "route your existing voice stack through Floe" pattern, for a real-time LiveKit/Pipecat-style loop.

```
LiveKit room ⇄ agent.py
   ├─ STT  Deepgram (streaming)      ← BYO key for now  (roadmap: Floe streaming STT)
   ├─ LLM  Floe keyless inference    ← on Floe  (base_url swap)
   └─ TTS  Floe keyless speech       ← on Floe  (base_url swap)
```

## Three legs on Floe today, the fourth coming
- **LLM** and **TTS** route to `https://credit-api.floelabs.xyz/v1` with your Floe agent key. Both are OpenAI-compatible, so it's a `base_url` + key swap — metered and capped on your Floe balance.
- **STT** stays on your **own Deepgram key** for now. LiveKit's STT plugin needs a *live streaming* feed (audio in → interim/final transcripts out); Floe's STT today is **batch** (`POST /v1/audio/transcriptions`). A **native Floe streaming-STT surface is on the roadmap** — when it lands, delete `DEEPGRAM_API_KEY` and point the `stt=` line at Floe, and all four legs meter on one key.

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
stt = deepgram.STT(model="nova-3")   # BYO DEEPGRAM_API_KEY — swap for Floe when streaming STT ships
```
Model ids stay **fully qualified** (`provider/model`) — that's what Floe Inference expects. See [Floe Inference](https://floe-labs.gitbook.io/docs/developers/keyless-inference) and [Add Floe to your existing pipeline](https://floe-labs.gitbook.io/docs/getting-started/integrate-existing-pipeline).

> **Enhancement:** to tag LLM/TTS calls with a per-session `X-Floe-Task-Id` (so a task budget bounds one conversation), pass a custom OpenAI client / default headers to the plugin. Left out here to keep the wiring obvious.
