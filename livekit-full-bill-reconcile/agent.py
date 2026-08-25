"""
LiveKit voice agent whose WHOLE bill lands on Floe — one budget, every leg.

The turnkey reconcile setup for a self-hosted LiveKit agent: the LLM is carried
on Floe's gateway (metered + capped server-side via a one-line base_url swap),
and the legs Floe does not carry — STT, TTS, the avatar, and any paid tool the
agent calls — are metered locally by ONE floe-guard BudgetGuard and RECONCILED
onto the same Floe ledger at call end.

  LLM     → Floe keyless inference (base_url swap)   ── carried on the gateway
  STT     → Deepgram (BYO)          ┐
  TTS     → ElevenLabs (BYO)        │  metered locally on ONE budget, then
  avatar  → per-minute video (BYO)  │  reconciled to the ledger at call end
  tool    → a paid API the agent calls ┘

No leg is billed twice: the gateway already has the LLM, so only the local legs
(everything recorded via record_tool — STT/TTS/avatar/tool) are pushed to
Reconcile. Enforcement is layered — the local guard hard-stops a turn before it
crosses the ceiling, and Floe's server-side cap bounds the gateway LLM spend.

Run:
  pip install -r requirements.txt
  cp .env.example .env    # fill in Floe + Deepgram + ElevenLabs + LiveKit
  python agent.py dev     # LiveKit Agents dev mode
"""
import json
import os
import sys
import time

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession, RunContext, function_tool
from livekit.plugins import deepgram, elevenlabs, openai, silero

# floe-guard: ONE local BudgetGuard is the single budget every leg meters on.
# The LiveKit adapter meters LLM/STT/TTS; record_tool lands the avatar and any
# paid tool on the same budget. push_ledger reconciles the local legs to Floe.
from floe_guard import BudgetGuard, LedgerSyncError, push_ledger
from floe_guard.integrations.livekit import LiveKitBudgetGuard

load_dotenv()


def require_env() -> None:
    """Fail fast with an actionable message if config is missing."""
    required = [
        "FLOE_API_KEY",       # LLM billing (gateway) + the reconcile push key
        "DEEPGRAM_API_KEY",   # BYO STT leg
        "ELEVENLABS_API_KEY", # BYO TTS leg
        "LIVEKIT_URL",
        "LIVEKIT_API_KEY",
        "LIVEKIT_API_SECRET",
    ]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(
            f"Missing env: {', '.join(missing)} — copy .env.example to .env and fill it in.",
            file=sys.stderr,
        )
        sys.exit(1)


require_env()

# LLM rides Floe's OpenAI-compatible gateway; the ledger-sync host is the same
# origin WITHOUT the /v1 suffix (push_ledger appends /v1/agents/ledger/sync).
FLOE_BASE_URL = os.environ.get("FLOE_BASE_URL", "https://credit-api.floelabs.xyz/v1")
FLOE_LEDGER_BASE_URL = FLOE_BASE_URL.removesuffix("/v1")
FLOE_API_KEY = os.environ["FLOE_API_KEY"]
FLOE_LLM_MODEL = os.environ.get("FLOE_LLM_MODEL", "openai/gpt-4o-mini")
# Local per-call ceiling for the guard, in USD — the budget every leg shares.
FLOE_LOCAL_BUDGET_USD = float(os.environ.get("FLOE_LOCAL_BUDGET_USD", "0.50"))
# What one call of the demo paid tool costs you (what you pay the vendor).
FLOE_TOOL_PRICE_USD = float(os.environ.get("FLOE_TOOL_PRICE_USD", "0.02"))
# Your avatar vendor's per-minute rate (Tavus/HeyGen/Simli/Beyond Presence).
# Unset (0) → no avatar leg is recorded.
FLOE_AVATAR_USD_PER_MINUTE = float(os.environ.get("FLOE_AVATAR_USD_PER_MINUTE", "0"))
# Print the legs that WOULD reconcile instead of POSTing them (for a dry try).
FLOE_RECONCILE_DRY_RUN = os.environ.get("FLOE_RECONCILE_DRY_RUN", "").lower() in ("1", "true", "yes")


def tool_legs_ndjson(guard: BudgetGuard) -> str:
    """The local legs to reconcile — everything recorded via record_tool.

    The LLM turns route through Floe's gateway (base_url) and are already on the
    ledger, so pushing them again would double-count. Keep only the ``kind="tool"``
    events (STT, TTS, avatar, paid tool), which is exactly the set of legs Floe
    did not carry.
    """
    kept = []
    for line in guard.export_log().splitlines():
        try:
            if json.loads(line).get("kind") == "tool":
                kept.append(line)
        except ValueError:
            continue
    return "".join(f"{line}\n" for line in kept)


def reconcile(guard: BudgetGuard) -> None:
    """Push this call's local legs onto Floe's ledger (attribution only, no money
    moves). Idempotent server-side, so a retry is safe."""
    ndjson = tool_legs_ndjson(guard)
    if not ndjson:
        return
    if FLOE_RECONCILE_DRY_RUN:
        print("[reconcile dry-run] would POST these legs to /v1/agents/ledger/sync:")
        print(ndjson, end="")
        return
    try:
        synced = push_ledger(ndjson, FLOE_API_KEY, base_url=FLOE_LEDGER_BASE_URL)
        print(f"[reconcile] synced {synced} leg(s) onto Floe's ledger")
    except LedgerSyncError as exc:
        print(f"[reconcile] failed: {exc}", file=sys.stderr)


class Assistant(Agent):
    def __init__(self, budget: LiveKitBudgetGuard) -> None:
        super().__init__(
            instructions=(
                "You are a warm, concise voice assistant. Keep replies to a sentence or two. "
                "When the caller asks about a company, call lookup_company with its domain."
            )
        )
        self._budget = budget

    @function_tool
    async def lookup_company(self, context: RunContext, domain: str) -> str:
        """Look up a company by its web domain (a paid data API)."""
        # >>> your real paid API call goes here (Apollo, Clearbit, …) <<<
        result = f"(demo) company profile for {domain}"
        # Meter the paid tool leg on the SAME budget as LLM/STT/TTS — you pay the
        # vendor, you record the price. This lands on the ledger via reconcile().
        self._budget.record_tool("company-lookup", FLOE_TOOL_PRICE_USD, label=domain)
        return result


def prewarm(proc: agents.JobProcess) -> None:
    # Load Silero VAD once per worker process and reuse it across jobs.
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: agents.JobContext) -> None:
    await ctx.connect()

    session = AgentSession(
        # STT — BYO Deepgram (streaming). Metered locally from stt_model.
        stt=deepgram.STT(model="nova-3"),
        # LLM — carried on Floe's gateway. OpenAI-compatible, so it's a base_url +
        # key swap; the model id stays fully qualified (provider/model).
        llm=openai.LLM(model=FLOE_LLM_MODEL, base_url=FLOE_BASE_URL, api_key=FLOE_API_KEY),
        # TTS — BYO ElevenLabs. Metered locally from tts_model (per-1k-chars).
        tts=elevenlabs.TTS(model="eleven_flash_v2_5"),
        vad=ctx.proc.userdata["vad"],
    )

    # ONE guard is the single budget. The adapter meters LLM (for local
    # enforcement) and the STT/TTS legs from the voice cost map; record_tool
    # (in the tool above, and for the avatar below) lands the rest on it.
    guard = BudgetGuard(limit_usd=FLOE_LOCAL_BUDGET_USD)
    budget = LiveKitBudgetGuard(
        guard,
        model=FLOE_LLM_MODEL,
        stt_model="deepgram-nova-3",
        tts_model="elevenlabs-flash-v2.5",
    )

    started_at = time.monotonic()

    def on_close(_ev: object) -> None:
        # Record the avatar leg from the call's duration × your vendor's rate
        # (an avatar bills per minute of generated video, and LiveKit emits no
        # metric for it), then reconcile every local leg onto Floe's ledger.
        if FLOE_AVATAR_USD_PER_MINUTE > 0:
            minutes = (time.monotonic() - started_at) / 60.0
            budget.record_tool("livekit-avatar", minutes * FLOE_AVATAR_USD_PER_MINUTE)
        reconcile(guard)

    session.on("close", on_close)

    agent = Assistant(budget)
    budget.attach(session, agent)
    await session.start(agent=agent, room=ctx.room)
    await session.generate_reply(instructions="Greet the caller and ask how you can help.")


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
