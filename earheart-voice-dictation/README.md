# Earheart voice dictation on Floe

Dictate prompts into Claude Code, Codex, or Cursor by voice with
[Earheart](https://github.com/cleanunicorn/earheart), and run both of its
engines — speech-to-text and transcript cleanup — on one Floe key with a
single session spend cap. No provider accounts, no model downloads.

## What it demonstrates

- Earheart's two custom-endpoint slots pointed at Floe's OpenAI-compatible
  gateway: batch STT on `POST /v1/audio/transcriptions` and cleanup on
  `POST /v1/chat/completions`.
- Hosted `nvidia/parakeet-tdt-0.6b-v3` — the same model Earheart runs
  locally — served from Floe instead of a ~2.4 GB on-device download.
- One Floe key and unified billing across both legs, governed by a
  server-side session spend limit.

## Stack

|              |                                               |
| ------------ | --------------------------------------------- |
| Language     | Config only (Earheart settings)               |
| Framework    | Earheart (Electron desktop app)               |
| Floe surface | Floe Inference (batch STT + chat completions) |

## Prerequisites

- [Earheart](https://github.com/cleanunicorn/earheart/releases) — Windows,
  macOS, or Linux
- A Floe **agent key** (`floe_*`) — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)

## Run

Earheart processes everything on-device by default. Pointing either engine at
a hosted endpoint is a per-engine choice in its settings — you can move one
leg to Floe and keep the other local.

**1. Speech-to-text on Floe** — Earheart Settings → Speech-to-text:

| Field    | Value                                |
| -------- | ------------------------------------ |
| Engine   | Custom (OpenAI-compatible)           |
| Base URL | `https://credit-api.floelabs.xyz/v1` |
| API key  | your `floe_*` key                    |
| Model    | `nvidia/parakeet-tdt-0.6b-v3`        |

Any other id from Floe's batch STT catalog works too (e.g.
`openai/whisper-large-v3-turbo`) — model ids are fully qualified as
`provider/model`.

**2. Transcript cleanup on Floe** — Earheart Settings → Cleanup:

| Field    | Value                                |
| -------- | ------------------------------------ |
| Engine   | Custom (OpenAI-compatible)           |
| Base URL | `https://credit-api.floelabs.xyz/v1` |
| API key  | your `floe_*` key                    |
| Model    | `google/gemma-3-12b`                 |

`google/gemma-3-12b` keeps the same model family Earheart uses locally;
`openai/gpt-4o-mini` is a good alternative.

**3. Cap the session.** Both legs meter against the same key, so one spend
limit covers dictation end to end. With the
[Floe MCP server](https://github.com/Floe-Labs/floe-mcp-server) connected to
your agent, ask it to `set_spend_limit`, or set the cap in the
[dashboard](https://dev-dashboard.floelabs.xyz).

**4. Dictate.** Focus Claude Code, press the hotkey
(`Ctrl/Cmd+Shift+Space`), speak, press again — the cleaned transcript is
pasted into the prompt. Transcription meters per audio second, cleanup per
token, both as line items on the same ledger.

Verify the endpoints from the shell before wiring up the app:

```bash
# STT — any short wav/mp3 file
curl -s https://credit-api.floelabs.xyz/v1/audio/transcriptions \
  -H "Authorization: Bearer $FLOE_KEY" \
  -F model=nvidia/parakeet-tdt-0.6b-v3 -F file=@sample.wav

# Cleanup
curl -s https://credit-api.floelabs.xyz/v1/chat/completions \
  -H "Authorization: Bearer $FLOE_KEY" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-3-12b","messages":[{"role":"user","content":"Say ok"}]}'
```

## Learn more

- [Floe docs](https://floe-labs.gitbook.io/docs) — [Floe Inference](https://floe-labs.gitbook.io/docs/developers/keyless-inference)
- [Earheart](https://github.com/cleanunicorn/earheart) — hotkey dictation for AI coding agents
