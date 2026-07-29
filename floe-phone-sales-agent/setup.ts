/**
 * One-time provisioning. Run before the server.
 *
 *   cp .env.example .env   # fill in keys + your ngrok SERVER_URL
 *   npm install
 *   npx tsx setup.ts
 *
 * Sets the campaign spend cap FIRST (fail-closed — never run an uncapped
 * "spend-governed" agent), buys/attaches a Floe Phone number, and points the
 * agent's voice at THIS server in webhook mode.
 */
import "dotenv/config";
import { ensureNumber, setVoiceConfig, setSessionLimit } from "./floe.js";

const AGENT_ID = process.env.FLOE_AGENT_ID;
const SERVER_URL = process.env.SERVER_URL;
const SESSION_LIMIT_RAW = process.env.FLOE_SESSION_LIMIT_RAW || "2000000";
const AREA_CODE = process.env.AREA_CODE;

for (const [k, v] of Object.entries({
  FLOE_LIVE_KEY: process.env.FLOE_LIVE_KEY,
  FLOE_API_KEY: process.env.FLOE_API_KEY,
  FLOE_AGENT_ID: AGENT_ID,
  SERVER_URL,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
})) {
  if (!v) { console.error(`Set ${k} in .env`); process.exit(1); }
}
if (!/^https:\/\//.test(SERVER_URL!)) {
  console.error("SERVER_URL must be https — Floe's webhook requires it. Use ngrok (ngrok http 3000).");
  process.exit(1);
}
if (!/^\d+$/.test(SESSION_LIMIT_RAW) || Number(SESSION_LIMIT_RAW) <= 0) {
  console.error(`FLOE_SESSION_LIMIT_RAW must be a positive integer in USDC base units (2000000 = $2.00). Got: "${SESSION_LIMIT_RAW}"`);
  process.exit(1);
}

const BEGIN_MESSAGE =
  "Hi, this is Riley from Floe — you'd asked to hear how we put a voice agent's whole vendor bill on one key. Is now an okay time for a couple of minutes?";

async function main() {
  // 1) Spend cap first — fail closed.
  console.log("💵 Setting the campaign spend cap...");
  try {
    await setSessionLimit(SESSION_LIMIT_RAW);
  } catch (e) {
    console.error(`   ❌ ${(e as Error).message}`);
    console.error("      Aborting — refusing to run an uncapped agent. Check FLOE_API_KEY + funding, then re-run.");
    process.exit(1);
  }
  console.log(`   ✅ $${(Number(SESSION_LIMIT_RAW) / 1e6).toFixed(2)} across the whole campaign (LLM + tools)\n`);

  // 2) Phone number (buys one, or reuses the agent's existing number).
  console.log("☎️  Ensuring the agent has a Floe Phone number...");
  const num = await ensureNumber(AGENT_ID!, AREA_CODE);
  console.log(`   ✅ ${num.phoneNumber} (id ${num.id})\n`);

  // 3) Webhook voice mode → this server.
  const webhookUrl = `${SERVER_URL!.replace(/\/$/, "")}/floe/voice/${process.env.WEBHOOK_SECRET}`;
  console.log("🔌 Switching voice to webhook mode (this server is the brain)...");
  await setVoiceConfig(AGENT_ID!, { voiceMode: "webhook", webhookUrl, beginMessage: BEGIN_MESSAGE });
  console.log(`   ✅ webhook → ${webhookUrl}\n`);

  console.log("✅ Ready. Next:");
  console.log("   1. npx tsx server.ts          # keep ngrok pointed at it");
  console.log("   2. npx tsx call.ts +1XXXXXXXXXX   # the agent calls you (a test)");
  console.log("   3. npx tsx campaign.ts        # dial your opt-in lead list");
  console.log("   4. npx tsx report.ts          # dispositions + cost per booked demo");
  console.log(`\n   Save this for reporting →  FLOE_NUMBER_ID=${num.id}`);
}

main().catch((e) => { console.error("Setup failed:", (e as Error).message || e); process.exit(1); });
