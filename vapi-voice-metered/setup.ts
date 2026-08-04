/**
 * Vapi voice legs → Floe (custom transcriber + custom voice).
 *
 * Points a Vapi assistant's STT and TTS at Floe's orchestrator surfaces
 * using Vapi's OWN extension points — no partnership required:
 *
 *   transcriber → wss://credit-api.floelabs.xyz/v1/orchestrator/transcriber
 *                 (stereo customer+assistant PCM → Deepgram multichannel via
 *                  Floe, metered per wall-clock audio second)
 *   voice       → https://credit-api.floelabs.xyz/v1/orchestrator/voice
 *                 (voice-request → ElevenLabs PCM via Floe, metered per
 *                  character)
 *
 * Both legs are PRE-CALL gated on the agent balance/session cap and land on
 * the same Floe ledger as the LLM leg (pair with ../vapi-custom-llm for
 * 100% of the stack minus telephony). Auth on both is a Bearer credential
 * carrying your floe_ agent key — Vapi supports custom headers on
 * transcriber/voice server configs.
 *
 * NOTE: these surfaces are flag-gated server-side (ORCHESTRATOR_VOICE_ENABLED)
 * until the media-path latency benchmark is published — check the Floe docs
 * before wiring production traffic.
 *
 * Usage: cp .env.example .env && npm install && npx tsx setup.ts <assistantId>
 */
import "dotenv/config";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const FLOE_API_KEY = process.env.FLOE_API_KEY;
const FLOE_CREDIT_API = (process.env.FLOE_CREDIT_API_URL || "https://credit-api.floelabs.xyz").replace(/\/+$/, "");
const assistantId = process.argv[2];

if (!VAPI_API_KEY || !FLOE_API_KEY?.startsWith("floe_")) {
  console.error("Set VAPI_API_KEY and FLOE_API_KEY (floe_… agent key) in .env");
  process.exit(1);
}
if (!assistantId) {
  console.error("Usage: npx tsx setup.ts <vapi-assistant-id>");
  process.exit(1);
}

let res: Response;
try {
  res = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      transcriber: {
        provider: "custom-transcriber",
        server: {
          url: `${FLOE_CREDIT_API.replace(/^http/, "ws")}/v1/orchestrator/transcriber`,
          headers: { Authorization: `Bearer ${FLOE_API_KEY}` },
        },
      },
      voice: {
        provider: "custom-voice",
        server: {
          url: `${FLOE_CREDIT_API}/v1/orchestrator/voice`,
          headers: { Authorization: `Bearer ${FLOE_API_KEY}` },
        },
      },
    }),
    // Bounds the whole PATCH, body read included — a dead network rejects
    // fetch outright, so it never reaches the res.ok branch below.
    signal: AbortSignal.timeout(30_000),
  });
} catch (err) {
  console.error(`PATCH failed before a response: ${(err as Error).message}`);
  process.exit(1);
}
if (!res.ok) {
  console.error(`PATCH failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`);
  process.exit(1);
}
console.log(`✅ Assistant ${assistantId}: STT + TTS now run through Floe — metered, gated, one ledger.
Spend proof: GET ${FLOE_CREDIT_API}/v1/agents/transactions (Bearer floe_ key).`);
