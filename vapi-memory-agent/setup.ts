/**
 * One-time setup for the Vapi memory agent.
 *
 *   1. Provisions the agent's HydraDB memory store (tenant/create — the store
 *      is created in the background, so the first `remember` may lag a bit).
 *   2. Sets a Floe spend limit — one key, one programmable ceiling across BOTH
 *      the model (Venice) and memory (HydraDB).
 *   3. Creates the Vapi assistant: custom-llm → Venice via Floe, with the
 *      remember/recall memory tools.
 *
 * Run once:  npm run setup   (then add the printed VAPI_ASSISTANT_ID to .env)
 */
import { VapiClient } from "@vapi-ai/server-sdk";
import "dotenv/config";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const SERVER_URL = process.env.SERVER_URL;
const FLOE_API_KEY = process.env.FLOE_API_KEY;
const VAPI_SERVER_SECRET = process.env.VAPI_SERVER_SECRET;
const VENICE_MODEL = process.env.VENICE_MODEL || "mistral-small-3-2-24b-instruct";
// USDC base units (6 dp): 250000 = $0.25 — one ceiling over model + memory.
const FLOE_SPEND_LIMIT_RAW = process.env.FLOE_SPEND_LIMIT_RAW || "250000";
const FLOE_CREDIT_API = process.env.FLOE_CREDIT_API_URL || "https://credit-api.floelabs.xyz";
const HYDRA_BASE = "https://marketplace.floelabs.xyz/v1/db/hydradb";

for (const [k, v] of Object.entries({ VAPI_API_KEY, SERVER_URL, FLOE_API_KEY, VAPI_SERVER_SECRET })) {
  if (!v) {
    console.error(`Set ${k} in .env`);
    process.exit(1);
  }
}
if (!/^\d+$/.test(FLOE_SPEND_LIMIT_RAW) || Number(FLOE_SPEND_LIMIT_RAW) <= 0) {
  console.error(`FLOE_SPEND_LIMIT_RAW must be a positive integer (USDC base units). Got: "${FLOE_SPEND_LIMIT_RAW}"`);
  process.exit(1);
}

// Validated non-null by the loop above (TS doesn't narrow through Object.entries).
const vapi = new VapiClient({ token: VAPI_API_KEY! });
const BASE_URL = (SERVER_URL ?? "").replace(/\/+$/, "");
const toolCallUrl = `${BASE_URL}/vapi/tool-call`;

const SYSTEM_PROMPT = `You are a warm, concise voice concierge with LONG-TERM MEMORY that persists across calls.

At the START of every call, call recall with a short query about the caller (e.g. "caller preferences and details") and greet them using anything you find — by name and preferences if you know them. If recall returns nothing, greet them as a new caller and offer to remember things for next time.

Whenever the caller shares something worth keeping — their name, preferences, allergies, plans, important facts — call remember with a single clear sentence to store it. Confirm briefly out loud ("I'll remember that").

Keep spoken replies to 1-2 sentences. You're on a phone call.`;

async function provisionMemory(): Promise<void> {
  console.log("🧠 Provisioning HydraDB memory store...");
  const res = await fetch(`${FLOE_CREDIT_API}/v1/proxy/fetch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${FLOE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: `${HYDRA_BASE}/tenant/create`, method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
  });
  const text = await res.text();
  // "accepted / creation started" is success; an already-provisioned store is fine too.
  if (res.ok) {
    console.log(`   ✅ memory store ready/queued (created in the background)\n`);
  } else {
    console.warn(`   ⚠️  tenant/create returned ${res.status}: ${text.slice(0, 160)}`);
    console.warn(`      Continuing — if the store already exists this is harmless.\n`);
  }
}

async function setSpendLimit(): Promise<void> {
  console.log(`💵 Setting Floe spend limit ($${(Number(FLOE_SPEND_LIMIT_RAW) / 1e6).toFixed(3)}) — one ceiling for model + memory...`);
  const res = await fetch(`${FLOE_CREDIT_API}/v1/agents/spend-limit`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${FLOE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ limitRaw: FLOE_SPEND_LIMIT_RAW }),
  });
  if (!res.ok) {
    console.error(`   ❌ Could not set spend limit (${res.status}). Check FLOE_API_KEY is a funded agent key. Aborting.`);
    process.exit(1);
  }
  console.log(`   ✅ spend limit set\n`);
}

async function main() {
  console.log("🎙️  Setting up the Vapi memory agent...\n");
  await setSpendLimit();
  await provisionMemory();

  console.log("📦 Creating memory tools...");
  const rememberTool = await vapi.tools.create({
    type: "function",
    function: {
      name: "remember",
      description: "Store a fact the caller shared (name, preference, allergy, plan, important detail) into long-term memory. Pass one clear sentence.",
      parameters: { type: "object", properties: { fact: { type: "string", description: "A single clear sentence to remember." } }, required: ["fact"] },
    },
    server: { url: toolCallUrl, headers: { "x-vapi-secret": VAPI_SERVER_SECRET! } },
  });
  const recallTool = await vapi.tools.create({
    type: "function",
    function: {
      name: "recall",
      description: "Search long-term memory for anything relevant to the caller or their question.",
      parameters: { type: "object", properties: { query: { type: "string", description: "What to look up in memory." } }, required: ["query"] },
    },
    server: { url: toolCallUrl, headers: { "x-vapi-secret": VAPI_SERVER_SECRET! } },
  });
  console.log(`   ✅ remember (${rememberTool.id})  recall (${recallTool.id})\n`);

  console.log("🤖 Creating assistant (Venice via Floe + memory tools)...");
  const model = {
    provider: "custom-llm" as const,
    // Secret in the path authenticates the credit-line-spending shim (server.ts).
    url: `${BASE_URL}/llm/${VAPI_SERVER_SECRET}`,
    model: VENICE_MODEL,
    messages: [{ role: "system" as const, content: SYSTEM_PROMPT }],
    toolIds: [rememberTool.id, recallTool.id],
  };
  const assistant = await vapi.assistants.create({
    name: "Floe Memory Concierge",
    model: model as Parameters<typeof vapi.assistants.create>[0]["model"],
    voice: { provider: "11labs", voiceId: "cgSgspJ2msm6clMCkdW9" },
    firstMessage: "Hi! Give me one second while I see if we've talked before.",
  });
  console.log(`   ✅ ${assistant.name} (${assistant.id})\n`);

  console.log(`📝 Add to .env:  VAPI_ASSISTANT_ID=${assistant.id}\n`);
  console.log(`📞 Next: 1) npm run start  (keep ngrok on it)   2) npm run call`);
  console.log(`   Tell it your name + a preference, hang up, then call again — it remembers.\n`);
  console.log(`💰 Spend (model + memory, one key):`);
  console.log(`   curl -H "Authorization: Bearer $FLOE_API_KEY" ${FLOE_CREDIT_API}/v1/agents/transactions?limit=10`);
}

main().catch((err) => {
  console.error("❌ Setup failed:", err.message || err);
  process.exit(1);
});
