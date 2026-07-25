"""
Add Floe to an agent you already have — keyless LLM gateway (Python).

You already have an STT→LLM→TTS agent whose LLM leg uses the standard `openai`
SDK pointed at OpenAI with your own key. To route that spend through Floe, change
THREE values: base_url, api_key, and the model id. No provider key — Floe holds
the upstream credential and bills each call to your one Floe key.

Run:  pip install -r requirements.txt && python main.py
Env:  FLOE_API_KEY
"""
import os
import sys

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()  # load .env so `cp .env.example .env` just works


def require_env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        sys.exit(f"Missing {name}. Copy .env.example to .env and fill it in.")
    return v


# The routing change vs your existing OpenAI client:
#   base_url → Floe's keyless gateway   (was: default OpenAI)
#   api_key  → your Floe key floe_<hex> (was: your OPENAI_API_KEY)
# No provider key anywhere — Floe holds the upstream credential.
client = OpenAI(
    base_url="https://credit-api.floelabs.xyz/v1",  # client appends /chat/completions
    api_key=require_env("FLOE_API_KEY"),            # floe_<hex> — Floe auth + billing
    max_retries=0,  # billable gateway: bills per call, no retry dedupe — default auto-retry could double-charge
)

# Floe-namespaced model id (your existing "gpt-4o" becomes "openai/gpt-4o").
model = "openai/gpt-4o"

resp = client.chat.completions.with_raw_response.create(
    model=model,
    messages=[{"role": "user", "content": "In one sentence: what is an AI agent?"}],
)
completion = resp.parse()
print(f"\n{model} → {completion.choices[0].message.content}")
# Floe stamps the per-call cost on the response — bill it to one key, no invoices.
print(f"cost (USDC): {resp.headers.get('x-floe-payment-amount')}")
