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
import math
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
from floe_guard import (
    BudgetGuard,
    LedgerSyncError,
    price_voice_leg,
    push_ledger,
    resolve_voice_rate,
)
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


def _usd_env(name: str, default: str) -> float:
    """Parse a USD env var, rejecting anything not finite and non-negative.

    ``float()`` happily returns ``nan``, ``-inf`` or a negative, and every one of
    those makes a later ``> 0`` test False — so a typo'd rate would silently skip
    the leg instead of failing. A missing cost looks like a cheaper call, which is
    the worst way for a cost tool to be wrong. Fail at startup instead. ``0`` is
    the documented "disabled" sentinel and stays legal.
    """
    raw = os.environ.get(name, default)
    try:
        value = float(raw)
    except ValueError:
        print(f"{name}={raw!r} is not a number.", file=sys.stderr)
        sys.exit(1)
    if not math.isfinite(value) or value < 0:
        print(
            f"{name}={raw!r} must be a finite, non-negative number (0 disables it).",
            file=sys.stderr,
        )
        sys.exit(1)
    return value


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
# Your avatar vendor, priced from floe-guard's bundled leg map — one of
# "tavus-cvi-starter" / "tavus-cvi-growth" / "tavus-cvi-business" (each Tavus
# plan is its own key, because which plan you are on is a fact about you).
# Those are PUBLIC LIST rates, which is probably not what you actually pay.
FLOE_AVATAR_MODEL = os.environ.get("FLOE_AVATAR_MODEL", "")
# Your real per-minute rate. Wins over the map. Needed for vendors the map
# cannot price at all — HeyGen sells credits, Simli and Beyond Presence publish
# no per-minute figure — or set FLOE_RATE_CARD to a JSON file of your own rates.
# Both unset → no avatar leg is recorded.
FLOE_AVATAR_USD_PER_MINUTE = _usd_env("FLOE_AVATAR_USD_PER_MINUTE", "0")
# Print the legs that WOULD reconcile instead of POSTing them (for a dry try).
FLOE_RECONCILE_DRY_RUN = os.environ.get("FLOE_RECONCILE_DRY_RUN", "").lower() in ("1", "true", "yes")


def require_priceable_avatar() -> None:
    """Prove the avatar leg is priceable BEFORE taking any calls.

    ``on_close`` is the wrong place to discover a misconfigured avatar vendor: it
    runs after the call, and anything raised there skips ``reconcile(guard)`` —
    so one unpriceable avatar would take every OTHER local leg (STT, TTS, the
    paid tool) off the ledger with it. Fail-closed on pricing must not turn into
    fail-open on the whole bill. Resolving once here turns that into a startup
    error, which is the only place a config mistake is cheap.
    """
    if not FLOE_AVATAR_MODEL and FLOE_AVATAR_USD_PER_MINUTE == 0:
        return  # no avatar leg configured — the documented default
    try:
        resolve_voice_rate(
            FLOE_AVATAR_MODEL or None,
            "avatar",
            FLOE_AVATAR_USD_PER_MINUTE or None,
        )
    except Exception as exc:  # noqa: BLE001 — any resolution failure is fatal here
        print(
            f"Avatar leg is configured but cannot be priced: {exc}\n"
            "Set FLOE_AVATAR_USD_PER_MINUTE to the rate you pay, pick a bundled "
            "FLOE_AVATAR_MODEL, or add the vendor to your FLOE_RATE_CARD.",
            file=sys.stderr,
        )
        sys.exit(1)


require_priceable_avatar()


def tool_legs_ndjson(guard: BudgetGuard) -> str:
    """The local legs to reconcile — everything recorded via record_tool.

    The LLM turns route through Floe's gateway (base_url) and are already on the
    ledger, so pushing them again would double-count. Keep every NON-LLM event,
    which is exactly the set of legs Floe did not carry.

    Excluding ``kind == "llm"`` rather than keeping ``kind == "tool"``: since the
    guard's kind vocabulary widened past ``llm | tool``, a leg recorded under its
    own name (``avatar`` below, and ``sms`` / ``ocr`` / ``gpu`` elsewhere) is no
    longer a "tool" event. A keep-list would have silently dropped those legs
    from reconciliation — they would simply never appear on the bill, which is
    the worst possible failure for a cost tool: a missing cost looks like a
    cheaper call.
    """
    kept = []
    for line in guard.export_log().splitlines():
        try:
            if json.loads(line).get("kind") != "llm":
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
        # Record the avatar leg from the call's duration (an avatar bills per
        # minute of generated video, and LiveKit emits no metric for it), then
        # reconcile every local leg onto Floe's ledger.
        #
        # The rate resolves through floe-guard: your override first, then the
        # bundled list price for FLOE_AVATAR_MODEL. require_priceable_avatar()
        # already proved this resolves at startup, so reaching the except below
        # means something unforeseen.
        if FLOE_AVATAR_MODEL or FLOE_AVATAR_USD_PER_MINUTE > 0:
            minutes = (time.monotonic() - started_at) / 60.0
            try:
                cost = price_voice_leg(
                    "avatar",
                    minutes,
                    model=FLOE_AVATAR_MODEL or None,
                    override=FLOE_AVATAR_USD_PER_MINUTE or None,
                )
                if cost is not None:
                    # kind="avatar", not the old kind="tool": the leg travels
                    # under its own name, so the ledger says what the spend was.
                    budget.record_tool("livekit-avatar", cost, kind="avatar")
            except Exception as exc:  # noqa: BLE001 — never lose the other legs
                # on_close is the ONLY path that reconciles STT/TTS/tool. Letting
                # an avatar failure propagate would drop all of them from the
                # ledger to save one leg — loud about the leg we lost, but the
                # rest of the bill still lands.
                print(f"Avatar leg not recorded: {exc}", file=sys.stderr)
        reconcile(guard)

    session.on("close", on_close)

    agent = Assistant(budget)
    budget.attach(session, agent)
    await session.start(agent=agent, room=ctx.room)
    await session.generate_reply(instructions="Greet the caller and ask how you can help.")


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
