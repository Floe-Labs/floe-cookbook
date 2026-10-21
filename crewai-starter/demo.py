"""demo.py — the zero-key reward: watch a runaway agent loop die at the budget.

CrewAI's most expensive failure mode is the runaway loop: an agent re-feeds its
whole growing scratchpad into the next call, so every turn costs more than the
last, and nobody is awake at 3 AM to stop it. This script reproduces that loop
and lets floe-guard hard-stop it *before* the call that would cross your ceiling.

Run it with NO API key, NO account, NO network::

    python demo.py

The "LLM" here is a stub that returns growing token usage — no crewai, no
litellm, no key needed. Each fake ``gpt-4o`` call is priced offline from
floe-guard's bundled cost map, exactly as a real call would be. This is the
reproducible "the loop dies at $1, not $400" demo.
"""

from __future__ import annotations

import os

from floe_guard import BudgetExceeded, BudgetGuard

MODEL = "gpt-4o"

# A real runaway loop re-sends its accumulating history every turn, so the prompt
# grows and each call costs more than the one before. We start at this many input
# tokens and add this much each iteration; completion size stays fixed.
_START_PROMPT_TOKENS = 2_000
_PROMPT_GROWTH_PER_TURN = 2_000
_COMPLETION_TOKENS = 800


def _budget_usd() -> float:
    """The spend ceiling. Defaults to $1.00; override with FLOE_BUDGET_USD."""
    raw = os.environ.get("FLOE_BUDGET_USD", "").strip()
    if not raw:
        return 1.00
    try:
        value = float(raw)
    except ValueError:
        return 1.00
    return value if value >= 0 else 1.00


def stub_llm(turn: int) -> dict[str, int | str]:
    """A fake LLM call. No network, no API key — returns growing token usage."""
    return {
        "model": MODEL,
        "prompt_tokens": _START_PROMPT_TOKENS + _PROMPT_GROWTH_PER_TURN * (turn - 1),
        "completion_tokens": _COMPLETION_TOKENS,
    }


def main() -> None:
    limit = _budget_usd()
    # Silence floe-guard's default stderr banner — we print our own summary below
    # so the stop reads as a clean, single narrative for the demo.
    guard = BudgetGuard(limit_usd=limit, on_block=lambda spent, cap: None)

    print(f"A CrewAI agent is stuck in a runaway loop. Budget ceiling: ${limit:.2f}.")
    print("Each turn re-sends the whole growing transcript, so every call costs more.\n")

    turn = 0
    while True:  # a real runaway loop never decides to stop on its own
        turn += 1
        try:
            guard.check()  # the kill-switch: raises BEFORE the crossing call runs
        except BudgetExceeded:
            print(
                f"\nfloe-guard HARD-STOPPED the loop before turn #{turn}.\n"
                f"  spent ${guard.spent_usd:.4f} of the ${limit:.2f} ceiling — "
                "the next call would have crossed it, so it never ran.\n"
                "  The 3 AM infinite loop dies here, not at $400."
            )
            break

        response = stub_llm(turn)
        cost = guard.record(
            str(response["model"]),
            int(response["prompt_tokens"]),
            int(response["completion_tokens"]),
        )
        print(
            f"  turn #{turn:>2}: +${cost:.4f}  "
            f"(running total ${guard.spent_usd:.4f} / ${limit:.2f})"
        )


if __name__ == "__main__":
    main()
