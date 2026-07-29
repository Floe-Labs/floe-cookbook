# Floe Phone sales agent

An outbound **voice sales agent** that prospects for Floe — built **on Floe**. It places a real phone call, pitches Floe, qualifies the prospect, and captures a demo request (email + time — you wire your own scheduler/CRM to confirm it). The twist: **every leg of the call — telephony, speech-to-text, the LLM, text-to-speech, and any web lookup — meters on one Floe key, under one budget.** It's Floe selling Floe, paid for by Floe.

```
campaign.ts ──POST /v1/calls (agent key, campaign cap)──► Floe Phone
                                                              │  Deepgram STT ⇄ ElevenLabs TTS  (barge-in)
                                                              ▼
                                              server.ts  (webhook "sales brain")
                                                 • LLM turn  → Floe keyless inference
                                                 • research  → Floe x402 proxy (Exa)
                                                 • book_demo / disposition → local
                                              every call tagged X-Floe-Task-Id=<callId>
                                                 └─ one key · one ledger · one cap
```

## Why this is the dogfood
A voice turn spends across ~5 vendors in real time. Here they all land on **one Floe balance** with **one spend cap** — the exact thing Floe sells. The agent even says so on the call.

## What's live vs. what you add
- **Live on Floe (used here):** native phone number + outbound `POST /v1/calls`, webhook voice mode, barge-in, keyless LLM, x402 tool payments, per-call + campaign spend caps that cut a call off mid-flight.
- **Out of scope for this example (do it before dialing cold):** outbound-sales **compliance** — DNC scrubbing, prior consent, recording disclosure, calling hours, opt-out. Use **warm / opt-in** leads only. Warm **transfer to a human** is also not wired (the agent captures a demo request instead).

## Prerequisites
- A Floe account + agent: **developer key** (`floe_live_…`) and **agent key** (`floe_…`), and the agent's numeric id — all from [dev-dashboard.floelabs.xyz](https://dev-dashboard.floelabs.xyz). Fund the agent (a phone number is $2/mo + usage).
- [ngrok](https://ngrok.com) (or any public HTTPS tunnel) — Floe posts each caller utterance to your server over **https**.
- Node 18+.

## Run it
```bash
cp .env.example .env          # fill in FLOE_LIVE_KEY, FLOE_API_KEY, FLOE_AGENT_ID
npm install

ngrok http 3000               # copy the https URL into SERVER_URL in .env

npx tsx setup.ts              # sets the campaign cap, buys a number, sets webhook voice mode
npx tsx server.ts             # the sales brain (keep ngrok pointed at it)

# in another shell:
npx tsx call.ts +1XXXXXXXXXX  # the agent calls you — answer it
# or dial a list (warm/opt-in only):
npx tsx campaign.ts

npx tsx report.ts             # dispositions + cost per demo request, from the Floe ledger
```

## How spend stays on one key
`setup.ts` sets a **campaign cap** (`PUT /v1/agents/spend-limit`). During a call, `server.ts` tags every model + tool request with `X-Floe-Task-Id=<callId>`, so the LLM turns and the paid research lookup roll into the same task budget as the call's phone legs. When the cap is hit, Floe refuses the next paid call and the agent wraps up gracefully (`report.ts` shows the spend). Nothing runs uncapped — `setup.ts` fails closed if the cap can't be set.

## Files
| File | What it does |
|---|---|
| `setup.ts` | cap → number → webhook voice mode (run once) |
| `server.ts` | the webhook sales brain: LLM + tools per turn, logs transcript + disposition |
| `campaign.ts` | dial a lead list (`leads.json`, else `leads.example.json`) |
| `call.ts` | single "the agent calls you" test |
| `report.ts` | dispositions + cost-per-demo-request |
| `floe.ts` | thin Floe client (keyless chat, x402 proxy, phone, spend-limit) |
| `store.ts` | tiny JSON store for outcomes — swap for your CRM |

## Tuning
- **Model:** `FLOE_MODEL` (default `openai/gpt-4o-mini`) — any Floe Inference model; pick a fast one for voice.
- **Pitch / script:** `SYSTEM_PROMPT` in `server.ts`. **Greeting:** `BEGIN_MESSAGE` in `setup.ts`.
- **Budget:** `FLOE_SESSION_LIMIT_RAW` (USDC base units; `2000000` = $2.00 across the campaign).
- **Real tools:** `research_prospect` hits Exa via the Floe proxy — add your CRM/enrichment/scheduler tools the same way (route them through Floe so they meter too).
