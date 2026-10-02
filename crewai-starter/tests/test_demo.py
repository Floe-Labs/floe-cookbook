"""Smoke test: the zero-key demo must hard-stop at the budget ceiling.

This is the contract that makes the starter's headline true — a runaway loop is
stopped before it crosses the cap — and it runs with no API key and no network.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def test_demo_hard_stops_at_ceiling() -> None:
    result = subprocess.run(
        [sys.executable, "demo.py"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=120,
        # Inherit the real environment so the subprocess has everything it needs
        # on every platform (Windows needs SystemRoot etc.); pin only a small
        # ceiling so the loop stops fast regardless of the default.
        env={**os.environ, "FLOE_BUDGET_USD": "0.10"},
    )

    assert result.returncode == 0, result.stderr
    assert "HARD-STOPPED the loop" in result.stdout
    # The loop must stop strictly under the ceiling (the crossing call never runs).
    assert "$0.10 ceiling" in result.stdout
