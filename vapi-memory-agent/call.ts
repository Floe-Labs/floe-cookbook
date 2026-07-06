/**
 * Place an OUTBOUND call — the agent calls the user.
 *
 * Memory is fetched BEFORE dialing: we query HydraDB for what we know about this
 * caller and (a) inject it into the assistant's prompt via a {{memory}} variable
 * and (b) bake a personalized greeting into the first message. So when the caller
 * picks up they hear "Welcome back, Alex…" INSTANTLY — no in-call lookup lag.
 *
 * The webhook server (server.ts) must be running and reachable at SERVER_URL
 * (ngrok), because `remember` tool calls during the call still hit it.
 *
 *   npx tsx call.ts
 */
import { VapiClient } from "@vapi-ai/server-sdk";
import "dotenv/config";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
let VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || "";
const TARGET_PHONE_NUMBER = process.env.TARGET_PHONE_NUMBER;
const FLOE_API_KEY = process.env.FLOE_API_KEY;
const FLOE_CREDIT_API = process.env.FLOE_CREDIT_API_URL || "https://credit-api.floelabs.xyz";
const VENICE_MODEL = process.env.VENICE_MODEL || "mistral-small-3-2-24b-instruct";
const PROXY = `${FLOE_CREDIT_API}/v1/proxy/fetch`;
const VENICE = `${FLOE_CREDIT_API}/v1/venice/chat/completions`;
const HYDRA = "https://marketplace.floelabs.xyz/v1/db/hydradb";

for (const [k, v] of Object.entries({ VAPI_API_KEY, VAPI_ASSISTANT_ID, TARGET_PHONE_NUMBER, FLOE_API_KEY })) {
  if (!v) {
    console.error(`Set ${k} in .env`);
    process.exit(1);
  }
}
if (!/^\+[1-9]\d{6,14}$/.test(TARGET_PHONE_NUMBER!)) {
  console.error(`TARGET_PHONE_NUMBER must be E.164 (e.g. +14155551234). Got: "${TARGET_PHONE_NUMBER}"`);
  process.exit(1);
}
const auth = { Authorization: `Bearer ${FLOE_API_KEY}`, "Content-Type": "application/json" };

/** Pull this caller's memories from HydraDB (before the call). */
async function fetchMemories(): Promise<string[]> {
  try {
    const res = await fetch(PROXY, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ url: `${HYDRA}/query`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "caller name, preferences, allergies, plans, details", type: "memory", maxResults: 8 }) }),
    });
    const d = (await res.json()) as any;
    const chunks: any[] = d?.result?.data?.chunks ?? [];
    return chunks.map((c) => String(c.chunk_content || "").split("\n")[0].trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Build a warm one-line greeting — personalized (via Venice) if we remember them. */
async function buildGreeting(memories: string[]): Promise<string> {
  if (memories.length === 0) {
    return "Hey, I'm Ada! I don't think we've spoken before — tell me a bit about yourself and I'll remember it for next time.";
  }
  try {
    const res = await fetch(VENICE, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        model: VENICE_MODEL,
        stream: false,
        messages: [
          { role: "system", content: "You are Ada, a warm phone concierge. Write ONE short, natural spoken greeting for a returning caller — use their name and reference ONE thing you remember. No preamble, just the greeting." },
          { role: "user", content: `What you remember: ${memories.join("; ")}` },
        ],
      }),
    });
    const d = (await res.json()) as any;
    const g = d.choices?.[0]?.message?.content?.trim();
    return g || `Welcome back! Great to hear from you again.`;
  } catch {
    return "Welcome back! Great to hear from you again.";
  }
}

const vapi = new VapiClient({ token: VAPI_API_KEY! });

async function main() {
  if (!VAPI_PHONE_NUMBER_ID) {
    const numbers = await vapi.phoneNumbers.list();
    if (!numbers?.length) {
      console.error("❌ No phone numbers on this Vapi account — set VAPI_PHONE_NUMBER_ID in .env.");
      process.exit(1);
    }
    VAPI_PHONE_NUMBER_ID = numbers[0].id;
  }

  console.log("🧠 Looking up this caller's memory (before dialing)...");
  const memories = await fetchMemories();
  console.log(memories.length ? `   remembered ${memories.length}: ${memories.join(" | ")}` : "   new caller — nothing on file");
  const firstMessage = await buildGreeting(memories);
  console.log(`   greeting: "${firstMessage}"`);
  const memoryText = memories.length ? memories.join("\n- ") : "This is a new caller — you have nothing on file yet.";

  console.log(`\n📞 Placing outbound call → ${TARGET_PHONE_NUMBER} ...`);
  const result = await vapi.calls.create({
    assistantId: VAPI_ASSISTANT_ID!,
    phoneNumberId: VAPI_PHONE_NUMBER_ID,
    customer: { number: TARGET_PHONE_NUMBER! },
    // Personalized greeting + memory injected into the prompt's {{memory}} — no in-call lookup.
    assistantOverrides: { firstMessage, variableValues: { memory: memoryText } },
  } as Parameters<typeof vapi.calls.create>[0]);

  const callId = "id" in result ? result.id : (result as any).results?.[0]?.id;
  console.log(`   ✅ Call started. Call id: ${callId ?? "(unknown)"}`);
}

main().catch((err) => {
  console.error("❌ Outbound call failed:", err.message || err);
  process.exit(1);
});
