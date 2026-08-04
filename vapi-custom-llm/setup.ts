/**
 * Vapi custom-llm → Floe keyless gateway — DIRECT, no shim.
 *
 * The one config field Vapi gives you (`model.url`) points straight at
 * Floe's OpenAI-compatible gateway. Every model turn then runs through
 * Floe: metered per token, PRE-CALL gated against the agent's balance and
 * session cap (a turn past the cap is refused with 402 before any tokens
 * are bought), and attributed on the one Floe ledger. Real SSE streaming —
 * Vapi sends stream:true and the gateway streams tokens back as they come.
 *
 * Auth rides Vapi's credential system: a `custom-llm` credential holding
 * your floe_ agent key, which Vapi sends as `Authorization: Bearer …` on
 * every request to the custom LLM URL (custom headers on the model config
 * are unreliable; the credential is the supported path).
 *
 * Honest boundary: on a direct integration a mid-conversation 402 surfaces
 * to Vapi as an LLM failure — the call degrades per your Vapi error config
 * rather than the agent SPEAKING "I'm out of budget". If you want the
 * spoken hard-stop, run the graceful-stop shim (shim.ts) and point
 * model.url at it instead.
 *
 * Usage:
 *   cp .env.example .env   # fill in keys
 *   npm install
 *   npx tsx setup.ts
 */
import { VapiClient } from "@vapi-ai/server-sdk";
import "dotenv/config";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const FLOE_API_KEY = process.env.FLOE_API_KEY;
const FLOE_MODEL = process.env.FLOE_MODEL || "openai/gpt-4o-mini";
const FLOE_SPEND_LIMIT_RAW = process.env.FLOE_SPEND_LIMIT_RAW || "100000";
const FLOE_CREDIT_API = (process.env.FLOE_CREDIT_API_URL || "https://credit-api.floelabs.xyz").replace(/\/+$/, "");
const SERVER_URL = (process.env.SERVER_URL || "").replace(/\/+$/, "");
const SHIM_PATH_SECRET = process.env.SHIM_PATH_SECRET;

// Direct by default; shim mode when BOTH shim vars are set (run `npm run shim`
// first). Vapi appends /chat/completions, which matches the shim's route.
const useShim = Boolean(SERVER_URL || SHIM_PATH_SECRET);
if (useShim && (!SERVER_URL || !SHIM_PATH_SECRET)) {
  console.error("Shim mode needs BOTH SERVER_URL and SHIM_PATH_SECRET set — leave both unset for the direct integration");
  process.exit(1);
}
const MODEL_URL = useShim
  ? `${SERVER_URL}/llm/${encodeURIComponent(SHIM_PATH_SECRET!)}`
  : `${FLOE_CREDIT_API}/v1`;

if (!VAPI_API_KEY) {
  console.error("Set VAPI_API_KEY in .env");
  process.exit(1);
}
if (!FLOE_API_KEY || !FLOE_API_KEY.startsWith("floe_") || FLOE_API_KEY.startsWith("floe_live_")) {
  console.error("Set FLOE_API_KEY in .env to an AGENT key (floe_<hex>, not the floe_live_ developer key)");
  process.exit(1);
}
if (!/^\d+$/.test(FLOE_SPEND_LIMIT_RAW) || Number(FLOE_SPEND_LIMIT_RAW) <= 0) {
  console.error(`FLOE_SPEND_LIMIT_RAW must be a positive integer in USDC base units (e.g. 100000 = $0.10). Got: "${FLOE_SPEND_LIMIT_RAW}"`);
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a friendly, concise voice assistant. Keep answers short and conversational — one or two sentences unless asked for more.`;

async function main() {
  // Step 0: fail-closed session cap on the Floe side. The cap is what turns
  // "metered" into "governed": the gateway refuses (402) the turn that would
  // start past it. Set BEFORE the assistant exists so there is never an
  // uncapped window.
  console.log("💰 Setting the Floe session spend cap...");
  const capRes = await fetch(`${FLOE_CREDIT_API}/v1/agents/spend-limit`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${FLOE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ limitRaw: FLOE_SPEND_LIMIT_RAW }),
  });
  if (!capRes.ok) {
    console.error(`   ❌ Could not set spend-limit (${capRes.status}): ${(await capRes.text()).slice(0, 200)}`);
    console.error("      Aborting — refusing to create an uncapped assistant. Check FLOE_API_KEY, then re-run.");
    process.exit(1);
  }
  console.log(`   ✅ Session cap: ${FLOE_SPEND_LIMIT_RAW} base units = $${(Number(FLOE_SPEND_LIMIT_RAW) / 1e6).toFixed(3)}`);

  // Step 1: the custom-llm CREDENTIAL — how the floe_ key reaches Floe.
  // Vapi stores it and sends `Authorization: Bearer <key>` on every request
  // to the custom LLM url. (Raw REST: the server SDK's credential coverage
  // varies by version; the endpoint itself is stable.)
  console.log("🔑 Creating the custom-llm credential (carries your floe_ key)...");
  const credRes = await fetch("https://api.vapi.ai/credential", {
    method: "POST",
    headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "custom-llm", apiKey: FLOE_API_KEY }),
  });
  if (!credRes.ok) {
    console.error(`   ❌ Credential create failed (${credRes.status}): ${(await credRes.text()).slice(0, 200)}`);
    process.exit(1);
  }
  const credential = (await credRes.json()) as { id: string };
  console.log(`   ✅ Credential ${credential.id}`);

  // Step 2: the assistant. model.url is THE integration — Vapi appends
  // /chat/completions, so the base is Floe's bare /v1. The model id must be
  // a fully-qualified Floe catalog slug (provider/model — GET /v1/models).
  console.log(`🤖 Creating the assistant (${useShim ? "shim" : "direct"} model.url)...`);
  // Top-level guard already exited on a missing key; assert for the closure.
  const vapi = new VapiClient({ token: VAPI_API_KEY! });
  const assistant = await vapi.assistants.create({
    name: "Floe-Governed Assistant",
    model: {
      provider: "custom-llm" as const,
      url: MODEL_URL,
      model: FLOE_MODEL,
      messages: [{ role: "system" as const, content: SYSTEM_PROMPT }],
      // Keep the request body a clean OpenAI chat payload — Vapi's injected
      // call metadata is noise to a general-purpose gateway.
      metadataSendMode: "off",
    } as Parameters<typeof vapi.assistants.create>[0]["model"],
    voice: {
      provider: "11labs",
      voiceId: "cgSgspJ2msm6clMCkdW9",
    },
    firstMessage: "Hi! Ask me anything.",
  });
  console.log(`   ✅ Assistant created: ${assistant.name} (${assistant.id})`);

  console.log(`
Done. Every LLM turn of this assistant now routes through Floe:
  • metered per token on your floe_ key (GET /v1/agents/transactions)
  • pre-call gated — the turn that would start past the cap gets 402
  • model: ${FLOE_MODEL} (swap via FLOE_MODEL; discovery: GET /v1/models)

Pair it with Reconcile Mode to govern the OTHER legs (STT/TTS/telephony)
Vapi still carries: connect the agent at POST /v1/developer/orchestrators
and point Vapi's server webhook at the returned call-end URL.`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
