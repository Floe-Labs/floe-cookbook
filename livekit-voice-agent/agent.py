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
import sys
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession
from livekit.plugins import openai, deepgram, silero

# floe-guard: a LOCAL budget ceiling (a dollar cap you own in-process), separate
# from the balance Floe enforces server-side. It hard-stops a turn BEFORE the LLM
# call once this call's spend would cross the cap, and meters the Deepgram STT
# leg too — the one leg Floe never sees (see the guard wiring in entrypoint()).
from floe_guard import BudgetGuard
from floe_guard.integrations.livekit import LiveKitBudgetGuard

load_dotenv()


def require_env() -> None:
    """Fail fast with an actionable message if config is missing."""
    # FLOE_API_KEY: LLM + TTS billing. DEEPGRAM_API_KEY: the BYO STT leg.
    # LIVEKIT_*: how the worker reaches your LiveKit server.
    required = ["FLOE_API_KEY", "DEEPGRAM_API_KEY", "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"Missing env: {', '.join(missing)} — copy .env.example to .env and fill it in.", file=sys.stderr)
        sys.exit(1)


require_env()

FLOE_BASE_URL = os.environ.get("FLOE_BASE_URL", "https://credit-api.floelabs.xyz/v1")
FLOE_API_KEY = os.environ["FLOE_API_KEY"]  # floe_… agent key (validated above)
FLOE_LLM_MODEL = os.environ.get("FLOE_LLM_MODEL", "openai/gpt-4o-mini")   # any Floe Inference model
FLOE_TTS_MODEL = os.environ.get("FLOE_TTS_MODEL", "openai/tts-1")
FLOE_TTS_VOICE = os.environ.get("FLOE_TTS_VOICE", "alloy")
# Local per-call ceiling for floe-guard, in USD. This is the guard's own budget,
# not the Floe balance — set it to what a single call is allowed to spend.
FLOE_LOCAL_BUDGET_USD = float(os.environ.get("FLOE_LOCAL_BUDGET_USD", "0.50"))


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are a warm, concise voice assistant. Keep replies to a sentence or two — "
                "this is a live phone-style conversation, not an essay."
            )
        )


def prewarm(proc: agents.JobProcess) -> None:
    # Load Silero VAD once per worker process and reuse it across every job —
    # the model init is synchronous, so doing it per-session adds startup latency.
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()

    session = AgentSession(
        # STT — streaming, BYO Deepgram key (reads DEEPGRAM_API_KEY). Floe's
        # streaming-STT WebSocket is live too (see README) but not wired here.
        stt=deepgram.STT(model="nova-3"),

        # LLM — on Floe. OpenAI-compatible, so we just point the base_url + key at Floe.
        # The model id stays fully qualified (provider/model) as Floe Inference expects.
        llm=openai.LLM(model=FLOE_LLM_MODEL, base_url=FLOE_BASE_URL, api_key=FLOE_API_KEY),

        # TTS — on Floe. Same trick: Floe's keyless /v1/audio/speech is OpenAI-compatible.
        tts=openai.TTS(model=FLOE_TTS_MODEL, voice=FLOE_TTS_VOICE, base_url=FLOE_BASE_URL, api_key=FLOE_API_KEY),

        # Voice-activity detection (endpointing) — prewarmed once per worker.
        vad=ctx.proc.userdata["vad"],
    )

    # The guard line: one local BudgetGuard + the LiveKit adapter. `attach` wraps
    # the agent's llm_node (reserve/hard-stop before each model turn) and the
    # session's metrics_collected event (settle real token usage, and meter the
    # Deepgram STT leg from stt_model). Pre-turn admission + per-turn settlement —
    # an admitted turn runs to completion; nothing here cuts a turn off partway.
    guard = BudgetGuard(limit_usd=FLOE_LOCAL_BUDGET_USD)
    budget = LiveKitBudgetGuard(guard, model=FLOE_LLM_MODEL, stt_model="deepgram-nova-3")

    agent = Assistant()
    budget.attach(session, agent)
    await session.start(agent=agent, room=ctx.room)
    await session.generate_reply(instructions="Greet the caller and ask how you can help.")


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
