# LiveKit — full-bill reconcile on one Floe budget

A self-hosted [LiveKit Agents](https://docs.livekit.io/agents/) voice agent whose
**whole bill lands on Floe**: the LLM is carried on Floe's gateway, and every leg
Floe doesn't carry — STT, TTS, the **avatar**, and any **paid tool** the agent
calls — is metered locally on **one budget** and **reconciled onto the same Floe
ledger** at call end. One key, one ledger, every leg.

```
LiveKit room ⇄ agent.py         ── ONE floe-guard budget ──
   ├─ LLM     Floe keyless inference (base_url swap)   → carried on the gateway
   ├─ STT     Deepgram (BYO)        ┐
   ├─ TTS     ElevenLabs (BYO)      │  metered locally, reconciled to the
   ├─ avatar  per-minute video (BYO)│  ledger at call end (kind="tool" legs)
   └─ tool    a paid API call       ┘
```

## What it demonstrates

- **The turnkey reconcile path.** `guard.record_tool(...)` lands the avatar and
  any paid tool on the same budget as LLM/STT/TTS, and one `push_ledger(...)` at
  call end reconciles every local leg onto Floe's ledger — no per-leg wiring.
- **One budget across every leg.** A single `BudgetGuard` enforces the local
  ceiling over the LLM, STT, TTS, avatar, and tool legs; the guard hard-stops a
  turn *before* its LLM call once the call's spend would cross the cap.
- **No double-billing, stated plainly.** The LLM routes through Floe's gateway
  and is already on the ledger, so only the local legs (everything recorded via
  `record_tool` — `kind="tool"`) are pushed to Reconcile. See `tool_legs_ndjson`
  in `agent.py`.

## Stack

| | |
|---|---|
| Language | Python |
| Framework | LiveKit Agents · Deepgram · ElevenLabs · floe-guard |
| Floe surface | metered LLM gateway (base_url swap) + Reconcile Mode (`/v1/agents/ledger/sync`) |

## Prerequisites

- Python 3.10+
- A Floe **agent** key (`floe_…`) — [get one at the dashboard](https://dev-dashboard.floelabs.xyz).
  Set a spend cap on the agent to bound the gateway LLM spend.
- A **Deepgram** key (BYO STT) and an **ElevenLabs** key (BYO TTS).
- LiveKit Cloud or self-hosted credentials (`LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`).

## Run

```bash
pip install -r requirements.txt
cp .env.example .env      # Floe agent key, Deepgram, ElevenLabs, LiveKit creds
python agent.py dev       # LiveKit Agents dev mode — connect from the LiveKit playground
```

Ask the agent about a company to trigger the paid `lookup_company` tool. At call
end you'll see a `[reconcile] synced N leg(s)` line — the STT/TTS/avatar/tool
legs landing on your ledger. Set `FLOE_RECONCILE_DRY_RUN=1` to print those legs
instead of POSTing them (no network) for a first try.

## How the reconcile works

Every leg meters on one `BudgetGuard`. The LiveKit adapter meters the LLM (for
local enforcement) and the STT/TTS legs from the bundled voice cost map; the new
`record_tool` lands the rest:

```python
budget = LiveKitBudgetGuard(
    guard, model=FLOE_LLM_MODEL,
    stt_model="deepgram-nova-3", tts_model="elevenlabs-flash-v2.5",
)
budget.record_tool("company-lookup", 0.02, label=domain)   # a paid tool leg
budget.record_tool("livekit-avatar", minutes * rate)        # the avatar leg
```

At call end, only the local legs are reconciled — the LLM is already on the
gateway ledger, so pushing it again would double-count:

```python
def tool_legs_ndjson(guard):
    return "".join(
        f"{line}\n" for line in guard.export_log().splitlines()
        if json.loads(line).get("kind") == "tool"
    )

push_ledger(tool_legs_ndjson(guard), FLOE_API_KEY, base_url=FLOE_LEDGER_BASE_URL)
```

Reconcile writes attribution rows only — **no money moves**, and ingestion is
idempotent, so a retry is a safe no-op. `GET /v1/agents/transactions` on your
Floe key shows the reconciled legs alongside the gateway LLM usage on one ledger.

## Coverage boundary (state it plainly)

| | On Floe's gateway (LLM) | Reconciled here (STT/TTS/avatar/tool) |
|---|---|---|
| Metered | per token, automatically | what you record via `record_tool` |
| Enforced | **pre-call**, server-side cap | local budget (guard), + reconciled after the call |
| Trust | Floe measured it | you asserted it (from your vendor's price) |

The stronger enforcement is always **on the gateway** — put as many legs on Floe
as you can. This recipe reconciles the legs Floe doesn't carry so your ledger
trues up to the whole call.

> **Avatars:** avatar vendors (Tavus, HeyGen, Simli, Beyond Presence) bill per
> minute of generated video and LiveKit emits no metric for them, so the leg is
> recorded from call duration × your rate (`FLOE_AVATAR_USD_PER_MINUTE`). Wiring
> a real avatar plugin into the room is orthogonal — its cost still lands via the
> same one-line `record_tool`.

## Related recipes

- [`../livekit-voice-agent`](../livekit-voice-agent) — the minimal version: LLM + TTS on Floe via a `base_url` swap.
- [`../pipecat-livekit-reconcile`](../pipecat-livekit-reconcile) — the other reconcile path: a signed per-call cost POST to the call-end webhook (per-call aggregate, needs a connection token + secret).

## Learn more

- [Floe docs](https://floe-labs.gitbook.io/docs) — [Add Floe to your existing pipeline](https://floe-labs.gitbook.io/docs/getting-started/integrate-existing-pipeline)
- [floe-guard](https://github.com/Floe-Labs/floe-guard) — the local budget + LiveKit adapter
- [LiveKit Agents](https://docs.livekit.io/agents/)
