"""
LiveKit voice agent with its bill on Floe.

Three of the four legs meter on ONE Floe key:
  • LLM  → Floe keyless inference (OpenAI-compatible base_url swap)
  • TTS  → Floe keyless speech    (OpenAI-compatible base_url swap)
  • STT  → your own Deepgram key  ← the one leg not on Floe *yet*

Why STT is BYO here: LiveKit's STT plugin needs a live streaming feed (audio in →
interim/final transcripts out). Floe's STT today is batch (POST /v1/audio/
transcriptions) — a live streaming-STT surface is on the roadmap. When it lands,
delete DEEPGRAM_API_KEY and point the STT line at Floe; nothing else changes.

The LLM + TTS legs are metered + capped on your Floe balance because they route
through https://credit-api.floelabs.xyz/v1 with your Floe agent key. Set a spend
cap on that agent in the dashboard (or PUT /v1/agents/spend-limit) to bound the run.

Run:
  pip install -r requirements.txt
  cp .env.example .env    # fill in Floe + Deepgram + LiveKit
  python agent.py dev     # LiveKit Agents dev mode
"""
import os
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession
from livekit.plugins import openai, deepgram, silero

load_dotenv()

FLOE_BASE_URL = os.environ.get("FLOE_BASE_URL", "https://credit-api.floelabs.xyz/v1")
FLOE_API_KEY = os.environ["FLOE_API_KEY"]  # floe_… agent key
FLOE_LLM_MODEL = os.environ.get("FLOE_LLM_MODEL", "openai/gpt-4o-mini")   # any Floe Inference model
FLOE_TTS_MODEL = os.environ.get("FLOE_TTS_MODEL", "openai/tts-1")
FLOE_TTS_VOICE = os.environ.get("FLOE_TTS_VOICE", "alloy")


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are a warm, concise voice assistant. Keep replies to a sentence or two — "
                "this is a live phone-style conversation, not an essay."
            )
        )


async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()

    session = AgentSession(
        # STT — streaming. BYO Deepgram key for now (reads DEEPGRAM_API_KEY).
        # Swap for Floe's streaming-STT endpoint when it ships.
        stt=deepgram.STT(model="nova-3"),

        # LLM — on Floe. OpenAI-compatible, so we just point the base_url + key at Floe.
        # The model id stays fully qualified (provider/model) as Floe Inference expects.
        llm=openai.LLM(model=FLOE_LLM_MODEL, base_url=FLOE_BASE_URL, api_key=FLOE_API_KEY),

        # TTS — on Floe. Same trick: Floe's keyless /v1/audio/speech is OpenAI-compatible.
        tts=openai.TTS(model=FLOE_TTS_MODEL, voice=FLOE_TTS_VOICE, base_url=FLOE_BASE_URL, api_key=FLOE_API_KEY),

        # Voice-activity detection (endpointing) runs locally.
        vad=silero.VAD.load(),
    )

    await session.start(agent=Assistant(), room=ctx.room)
    await session.generate_reply(instructions="Greet the caller and ask how you can help.")


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
