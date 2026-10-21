"""crew.py — a real, budget-governed CrewAI crew.

A minimal two-agent crew (a Researcher and a Writer) with a local budget guard
wired in by default. Both agents share a ``budget_guarded_llm`` and one guard.
The wrapper checks the budget in the LLM call path, outside LiteLLM callbacks.
Once the budget is exhausted, the next LLM call raises ``BudgetExceeded``.
Usage-based estimates can still underestimate the cost of an admitted call.

Run it (needs an LLM key)::

    export OPENAI_API_KEY=sk-...
    python crew.py

The ceiling defaults to $1.00; override with FLOE_BUDGET_USD.

Optional hosted upgrade
-----------------------
If FLOE_API_KEY is set, this script makes ONE read-only GET to Floe's credit API
for your agent's server-side remaining budget and tightens the local cap to it.
Be honest about what that is: the read only INFORMS the local, in-process
ceiling. The un-bypassable, cross-vendor enforcement is the hosted Floe product
running server-side — not this script. Any read failure (missing key, network,
parse) falls back safely to the local cap.
"""

from __future__ import annotations

import os
import sys

import requests
from dotenv import load_dotenv

from floe_guard import BudgetExceeded, BudgetGuard
from floe_guard.integrations.crewai import budget_guarded_llm, guard_crew

load_dotenv()

MODEL = "gpt-4o"

# The only Floe endpoint this starter talks to. Reading it is optional (gated on
# FLOE_API_KEY) and only ever tightens the local cap.
CREDIT_REMAINING_URL = "https://credit-api.floelabs.xyz/v1/agents/credit-remaining"
# USDC has 6 decimals; the API returns base-unit integer strings.
_USDC_DECIMALS = 1_000_000
_HOSTED_READ_TIMEOUT_S = 10.0


def _local_budget_usd() -> float:
    """The local spend ceiling. Defaults to $1.00; override with FLOE_BUDGET_USD."""
    raw = os.environ.get("FLOE_BUDGET_USD", "").strip()
    if not raw:
        return 1.00
    try:
        value = float(raw)
    except ValueError:
        return 1.00
    return value if value >= 0 else 1.00


def _resolve_ceiling() -> float:
    """Pick the spend ceiling, tightening to hosted remaining budget if available.

    Always fail safe to the local cap: a missing key, a network failure, or an
    unparseable response must never *raise* the budget — it can only lower it.
    """
    local_cap = _local_budget_usd()
    remaining = _fetch_hosted_remaining_usd()
    if remaining is None:
        return local_cap

    ceiling = min(local_cap, remaining)
    print(
        f"Hosted Floe reports ${remaining:.2f} remaining; tightening the ceiling "
        f"to ${ceiling:.2f} (min of local cap and hosted remaining).\n"
        "Note: this READS your server-side budget to inform the local cap. "
        "Un-bypassable cross-vendor enforcement is the hosted Floe product.\n"
    )
    return ceiling


def _fetch_hosted_remaining_usd() -> float | None:
    """Read server-side remaining USD from Floe, or None on any failure.

    When FLOE_API_KEY is set, GET ``/v1/agents/credit-remaining`` and use the
    tighter of ``headroomToAutoBorrow`` (credit headroom) and
    ``sessionSpendRemaining`` (per-session cap) — both returned as USDC base-unit
    strings (6 decimals). Fails safe: a missing key, network error, timeout,
    non-OK status, or unparseable body returns None so the caller falls back to
    the local cap. This only READS remaining budget — it is not server-side
    enforcement; un-bypassable cross-vendor enforcement is the hosted Floe
    product. The key is never logged or persisted.
    """
    key = os.environ.get("FLOE_API_KEY", "").strip()
    if not key:
        return None

    try:
        response = requests.get(
            CREDIT_REMAINING_URL,
            headers={"Authorization": f"Bearer {key}"},
            timeout=_HOSTED_READ_TIMEOUT_S,
        )
        if not response.ok:
            return None
        data = response.json()
    except Exception:
        # Network error, timeout, bad JSON — fall back to the local cap.
        return None

    if not isinstance(data, dict):
        return None

    candidates = [
        usd
        for usd in (
            _parse_usdc(data.get("headroomToAutoBorrow")),
            _parse_usdc(data.get("sessionSpendRemaining")),
        )
        if usd is not None
    ]
    return min(candidates) if candidates else None


def _parse_usdc(value: object) -> float | None:
    """Parse a USDC base-unit integer string into USD, or None if it isn't valid."""
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    try:
        # The API returns integer base-unit strings — parse exactly, not via float.
        raw = int(s, 10)
    except ValueError:
        return None
    if raw < 0:
        return None
    return raw / _USDC_DECIMALS


def build_crew(guard: BudgetGuard, model: str = MODEL):
    """Build a minimal two-agent research-and-write crew.

    Imported lazily inside main() so the module imports cleanly without crewai's
    heavier dependencies being exercised until a run is actually requested.
    """
    from crewai import Agent, Crew, Process, Task

    # CrewAI initializes LiteLLM's callback registry from this explicit list.
    # Preserve the metering callback as well as the wrapper's admission check.
    llm = budget_guarded_llm(guard, model, callbacks=[guard_crew(guard)])

    researcher = Agent(
        role="Researcher",
        goal="Find the three most important, concrete facts about the topic.",
        backstory="A concise analyst who cites specifics and never pads.",
        llm=llm,
        verbose=True,
    )
    writer = Agent(
        role="Writer",
        goal="Turn the research into a tight, three-sentence summary.",
        backstory="An editor who values clarity and brevity over length.",
        llm=llm,
        verbose=True,
    )

    topic = os.environ.get("CREW_TOPIC", "why AI agents need spend governance").strip()

    research_task = Task(
        description=f"Research the topic: {topic}. List three concrete facts.",
        expected_output="Three bullet points, each a concrete, specific fact.",
        agent=researcher,
    )
    write_task = Task(
        description="Write a three-sentence summary from the research bullets.",
        expected_output="Exactly three sentences, no preamble.",
        agent=writer,
        context=[research_task],
    )

    return Crew(
        agents=[researcher, writer],
        tasks=[research_task, write_task],
        process=Process.sequential,
        verbose=True,
    )


def main() -> int:
    if not os.environ.get("OPENAI_API_KEY", "").strip():
        print(
            "OPENAI_API_KEY is not set. The real crew needs an LLM key to run.\n\n"
            "  1. cp .env.example .env\n"
            "  2. add your OpenAI key to .env\n"
            "  3. python crew.py\n\n"
            "No key yet? Run the zero-key budget demo instead: python demo.py"
        )
        return 0

    ceiling = _resolve_ceiling()
    guard = BudgetGuard(limit_usd=ceiling)

    print(f"Running a governed crew with a ${ceiling:.2f} ceiling...\n")
    crew = build_crew(guard)

    try:
        result = crew.kickoff()
    except BudgetExceeded as exc:
        print(
            f"\nfloe-guard stopped the crew at its ${ceiling:.2f} ceiling "
            f"(spent ${exc.spent_usd:.4f}). The next LLM call was refused."
        )
        return 0

    print("\n--- Crew result ---")
    print(result)
    print(f"\nSpent ${guard.spent_usd:.4f} of the ${ceiling:.2f} ceiling.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
