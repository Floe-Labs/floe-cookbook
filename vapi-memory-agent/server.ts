/**
 * Vapi + Floe voice agent with persistent memory (HydraDB).
 *
 * The agent thinks on Venice and remembers on HydraDB — and BOTH, plus any
 * other paid tool, bill to ONE Floe key (unified billing, programmable spend
 * controls). No Venice key, no HydraDB key, no wallet: the agent holds a single
 * Floe API key and Floe meters every vendor call against it.
 *
 * Two memory tools the model can call:
 *   - remember(fact)   → HydraDB ingest  (store a memory)
 *   - recall(query)    → HydraDB query   (semantic recall)
 * Because HydraDB persists per-agent (hard tenant isolation, auto-derived by the
 * shim), memories survive across calls — so a later call recalls what an earlier
 * one stored. That's the demo: the agent actually remembers you.
 *
 * Endpoints:
 *   POST /llm/:secret/chat/completions  → Venice via Floe (see venice-llm.ts)
 *   POST /vapi/tool-call                → remember / recall via Floe → HydraDB
 */
import Fastify from "fastify";
import "dotenv/config";
import { registerVeniceLlm } from "./venice-llm.js";

const FLOE_API_KEY = process.env.FLOE_API_KEY;
const FLOE_PROXY = "https://credit-api.floelabs.xyz/v1/proxy/fetch";
const FLOE_VENICE_URL = "https://credit-api.floelabs.xyz/v1/venice/chat/completions";
const HYDRA_BASE = "https://marketplace.floelabs.xyz/v1/db/hydradb";
const VENICE_MODEL = process.env.VENICE_MODEL || "mistral-small-3-2-24b-instruct";
const VAPI_SERVER_SECRET = process.env.VAPI_SERVER_SECRET;
const PORT = parseInt(process.env.PORT || "3000", 10);
const FETCH_TIMEOUT_MS = 20_000;
const LLM_TIMEOUT_MS = 60_000;

if (!FLOE_API_KEY) {
  console.error("Set FLOE_API_KEY in .env (one key pays Venice + HydraDB)");
  process.exit(1);
}
if (!VAPI_SERVER_SECRET) {
  console.error("Set VAPI_SERVER_SECRET in .env (authenticates Vapi webhooks + the LLM shim)");
  process.exit(1);
}

// ── HydraDB via the Floe proxy ────────────────────────────────────────────
// Every op is a paid marketplace call metered on the Floe key. The proxy wraps
// the upstream body; HydraDB replies { result: { success, data } }.

async function callHydra(op: string, body: Record<string, unknown>): Promise<{ json: any; costUsdc: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FLOE_PROXY, {
      method: "POST",
      headers: { Authorization: `Bearer ${FLOE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${HYDRA_BASE}/${op}`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      signal: controller.signal,
    });
    const costUsdc = res.headers.get("x-floe-cost-usdc");
    const text = await res.text();
    if (!res.ok) throw new Error(`Floe→HydraDB ${op} ${res.status}: ${text.slice(0, 200)}`);
    return { json: JSON.parse(text), costUsdc };
  } finally {
    clearTimeout(timeout);
  }
}

/** Store a fact the caller shared. */
async function remember(fact: string): Promise<string> {
  const { json, costUsdc } = await callHydra("ingest", {
    type: "memory",
    memories: [{ text: fact, infer: true }],
  });
  console.log(`   🧠 remember → HydraDB ingest ($${costUsdc ?? "?"}): "${fact.slice(0, 60)}"`);
  return json?.result?.success ? "Got it — I'll remember that." : "I had trouble saving that.";
}

/** Recall what the agent knows relevant to a query. */
async function recall(query: string): Promise<string> {
  const { json, costUsdc } = await callHydra("query", {
    query,
    type: "memory",
    maxResults: 5,
  });
  const chunks: any[] = json?.result?.data?.chunks ?? [];
  console.log(`   🔎 recall → HydraDB query ($${costUsdc ?? "?"}): ${chunks.length} hit(s)`);
  if (chunks.length === 0) return "I don't have anything on that yet.";
  const memories = chunks.map((c) => String(c.chunk_content || "").split("\n")[0]).filter(Boolean);
  return `Here's what I remember: ${memories.join("; ")}`;
}

// ── Vapi tool webhook ──────────────────────────────────────────────────────

const app = Fastify({ logger: false });

registerVeniceLlm(app, {
  floeApiKey: FLOE_API_KEY,
  floeVeniceUrl: FLOE_VENICE_URL,
  veniceModel: VENICE_MODEL,
  timeoutMs: LLM_TIMEOUT_MS,
  authToken: VAPI_SERVER_SECRET,
});

app.post("/vapi/tool-call", async (request, reply) => {
  const raw = request.headers["x-vapi-secret"] || request.headers.authorization;
  const hdr = Array.isArray(raw) ? raw[0] : raw;
  const token = typeof hdr === "string" && hdr.startsWith("Bearer ") ? hdr.slice(7) : hdr;
  if (token !== VAPI_SERVER_SECRET) return reply.status(401).send({ error: "Unauthorized" });

  const body = request.body as any;
  const calls = body?.message?.toolCallList;
  if (body?.message?.type !== "tool-calls" || !Array.isArray(calls)) return { results: [] };

  const results = [];
  for (const call of calls) {
    const name = call.function?.name;
    let args: Record<string, unknown> = {};
    try {
      args = typeof call.function?.arguments === "string" ? JSON.parse(call.function.arguments) : call.function?.arguments || {};
    } catch {
      /* leave empty */
    }
    let result: string;
    try {
      if (name === "remember" && typeof args.fact === "string" && args.fact.trim()) {
        result = await remember(args.fact.trim());
      } else if (name === "recall" && typeof args.query === "string" && args.query.trim()) {
        result = await recall(args.query.trim());
      } else {
        result = `Unknown or malformed tool call: ${name}`;
      }
    } catch (err) {
      console.error(`   ❌ ${name} failed: ${(err as Error).message}`);
      result = "My memory is momentarily unavailable — let's continue and I'll try again.";
    }
    results.push({ name, toolCallId: call.id, result });
  }
  return { results };
});

app.get("/health", async () => ({ status: "ok" }));

app.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`\n🎙️  Vapi memory agent on :${PORT}`);
  console.log(`   Brain:  Venice (${VENICE_MODEL}) via Floe`);
  console.log(`   Memory: HydraDB (ingest/query) via Floe`);
  console.log(`   ONE Floe key meters the model AND the memory — unified billing.\n`);
});
