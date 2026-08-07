"""
Floe Reconcile Mode — self-report an end-of-call cost from a self-hosted
Pipecat or LiveKit voice agent.

Pipecat and LiveKit are SELF-HOSTED frameworks: there is no platform that fires
a "call cost" webhook the way Vapi/Retell/Bland do. So YOUR code POSTs the cost
at session end. Floe records it on your ledger and gates the NEXT session if the
agent is over budget (between-call enforcement — see README for the boundary).

This script simulates one finished call, computes its cost, and POSTs it to your
Floe Reconcile connection with a signed body. The POST is real; the call/cost is
simulated so you can run it with nothing but a Floe connection.

Run:  pip install -r requirements.txt && python reconcile.py
Env:  FLOE_CREDIT_API, FLOE_ORCHESTRATOR_TOKEN, FLOE_ORCHESTRATOR_SECRET
      (optional: FLOE_ORCHESTRATOR_PROVIDER=pipecat|livekit — or pass as arg)
"""
import hashlib
import hmac
import json
import os
import sys
import uuid

import requests
from dotenv import load_dotenv

load_dotenv()  # so `cp .env.example .env` just works


def require_env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        sys.exit(f"Missing {name}. Copy .env.example to .env and fill it in.")
    return v


# pipecat | livekit — same self-report contract for both; only the URL segment
# differs. Take it from argv[1] if given, else env, else default to pipecat.
provider = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("FLOE_ORCHESTRATOR_PROVIDER", "pipecat")).lower()
if provider not in ("pipecat", "livekit"):
    sys.exit(f"provider must be 'pipecat' or 'livekit', got '{provider}'")

FLOE_CREDIT_API = os.environ.get("FLOE_CREDIT_API", "https://credit-api.floelabs.xyz").rstrip("/")
token = require_env("FLOE_ORCHESTRATOR_TOKEN")   # capability token (identifies the connection)
secret = require_env("FLOE_ORCHESTRATOR_SECRET")  # per-connection secret Floe returned at registration


def cost_for_call(duration_seconds: int) -> float:
    """
    Your OWN cost for this call — the legs Floe did NOT carry.

    Report only what Floe can't already see. If an STT/LLM/TTS leg ran through
    Floe's gateway it is ALREADY on your ledger; double-reporting it here would
    bill it twice. Here we pretend STT + TTS were BYO (e.g. Deepgram + Cartesia
    direct) and sum their per-second list rates. Replace with your real usage.
    """
    stt_usd_per_second = 0.0000722   # e.g. Deepgram nova-3 streaming
    tts_usd_per_second = 0.00025     # e.g. a BYO TTS vendor
    return round(duration_seconds * (stt_usd_per_second + tts_usd_per_second), 6)


# ── Simulate one finished call ────────────────────────────────────────────────
external_call_id = f"{provider}-{uuid.uuid4()}"  # YOUR id for the session (room name, call id, …)
duration_seconds = 142
cost_usd = cost_for_call(duration_seconds)

body = {
    "external_call_id": external_call_id,
    "cost_usd": cost_usd,
    "duration_seconds": duration_seconds,
    # Optional attribution — omit if you don't use them.
    # "floe_task_id": "quote-run-42",
    # "floe_customer_id": "acct_18a3",
}

# Sign the EXACT bytes we send. Serialize once to raw bytes, HMAC those bytes,
# then send those same bytes as the body — never re-serialize, or the signature
# won't match what Floe verifies over the raw request body.
raw = json.dumps(body, separators=(",", ":")).encode("utf-8")
signature = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()

url = f"{FLOE_CREDIT_API}/v1/webhooks/{provider}/call-end/{token}"
# Redact the capability token in logs — it identifies this connection endpoint,
# so keep it out of CI output / shared terminals (the full token is still sent).
print(f"POST {FLOE_CREDIT_API}/v1/webhooks/{provider}/call-end/<redacted>")
print(f"  {external_call_id}  ${cost_usd}  {duration_seconds}s")

try:
    resp = requests.post(
        url,
        data=raw,  # send the signed bytes verbatim (not json=, which re-serializes)
        headers={
            "Content-Type": "application/json",
            "X-Floe-Signature": signature,  # hex HMAC-SHA256(secret, raw body)
        },
        timeout=30,
    )
except requests.RequestException as exc:
    sys.exit(f"\nnetwork error posting to Floe: {exc}")

if resp.status_code == 200:
    print(f"\nok — recorded on your Floe ledger. Response: {resp.text}")
    print("Budgets now enforce on this agent's NEXT session (Reconcile is between-call, not mid-call).")
elif resp.status_code == 401:
    sys.exit("\n401 — bad signature. Check FLOE_ORCHESTRATOR_SECRET is the exact per-connection secret Floe returned.")
elif resp.status_code == 404:
    sys.exit("\n404 — unknown/disabled connection (or wrong provider for this token). Re-check FLOE_ORCHESTRATOR_TOKEN and the provider.")
else:
    sys.exit(f"\nunexpected {resp.status_code}: {resp.text[:300]}")
