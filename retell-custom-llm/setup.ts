/**
 * Retell agent setup — wire the custom-LLM socket + fail-closed Floe cap.
 *
 * Creates a Retell agent whose response engine is the WebSocket adapter in
 * server.ts (which routes every model turn through Floe). Sets the Floe
 * session spend cap FIRST so there is never an uncapped window.
 *
 * Usage:
 *   npm start                # in one terminal (expose via ngrok → wss URL)
 *   cp .env.example .env     # fill in keys + SERVER_WSS_URL
 *   npm run setup
 */
import "dotenv/config";

const RETELL_API_KEY = process.env.RETELL_API_KEY;
const FLOE_API_KEY = process.env.FLOE_API_KEY;
const FLOE_SPEND_LIMIT_RAW = process.env.FLOE_SPEND_LIMIT_RAW || "100000";
const SERVER_WSS_URL = (process.env.SERVER_WSS_URL || "").replace(/\/+$/, "");
const LLM_PATH_SECRET = process.env.LLM_PATH_SECRET;
const FLOE_CREDIT_API = (process.env.FLOE_CREDIT_API_URL || "https://credit-api.floelabs.xyz").replace(/\/+$/, "");

for (const [name, v] of [
  ["RETELL_API_KEY", RETELL_API_KEY],
  ["FLOE_API_KEY", FLOE_API_KEY],
  ["SERVER_WSS_URL", SERVER_WSS_URL],
  ["LLM_PATH_SECRET", LLM_PATH_SECRET],
] as const) {
  if (!v) {
    console.error(`Set ${name} in .env`);
    process.exit(1);
  }
}
if (!SERVER_WSS_URL.startsWith("wss://")) {
  console.error(`SERVER_WSS_URL must be a public wss:// URL (got "${SERVER_WSS_URL}")`);
  process.exit(1);
}

async function main() {
  console.log("💰 Setting the Floe session spend cap...");
  const capRes = await fetch(`${FLOE_CREDIT_API}/v1/agents/spend-limit`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${FLOE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ limitRaw: FLOE_SPEND_LIMIT_RAW }),
  });
  if (!capRes.ok) {
    console.error(`   ❌ Could not set spend-limit (${capRes.status}): ${(await capRes.text()).slice(0, 200)}`);
    console.error("      Aborting — refusing to create an uncapped agent.");
    process.exit(1);
  }
  console.log(`   ✅ Session cap: ${FLOE_SPEND_LIMIT_RAW} base units = $${(Number(FLOE_SPEND_LIMIT_RAW) / 1e6).toFixed(3)}`);

  console.log("🤖 Creating the Retell agent (custom-llm → the Floe adapter)...");
  const res = await fetch("https://api.retellai.com/create-agent", {
    method: "POST",
    headers: { Authorization: `Bearer ${RETELL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_name: "Floe-Governed Retell Agent",
      voice_id: "11labs-Adrian",
      response_engine: {
        type: "custom-llm",
        // Retell appends /<call_id> when it connects.
        llm_websocket_url: `${SERVER_WSS_URL}/llm/${LLM_PATH_SECRET}`,
      },
    }),
  });
  if (!res.ok) {
    console.error(`   ❌ create-agent failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const agent = (await res.json()) as { agent_id: string; agent_name: string };
  console.log(`   ✅ Agent created: ${agent.agent_name} (${agent.agent_id})`);
  console.log(`
Attach the agent to a Retell phone number (dashboard or /create-phone-number)
and call it — every model turn now meters + gates through Floe.

Pair with Reconcile Mode for the legs Retell still carries (STT/TTS/telephony):
POST /v1/developer/orchestrators with your Retell API key, then paste the
returned call-end URL as the webhook and the pre-call URL as the number's
inbound webhook (over-budget agents get {"call_inbound":{"reject":true}}).`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
