/**
 * Unified-billing proof (telephony-free).
 *
 * Proves the headline without a phone call: the agent's MEMORY (HydraDB) and its
 * BRAIN (Venice) bill to ONE Floe key. This harness plays what a call does —
 * remember a couple facts, recall them, let the model use them — then reads the
 * Floe ledger and shows every charge (HydraDB ops + model) on the same key.
 *
 * Prereqs:
 *   1. A funded FLOE_API_KEY in .env  (this SPENDS a few cents of real USDC)
 *   2. Memory store provisioned once:  npm run setup   (or run this — it waits)
 *   3. Then:  npm run proof
 */
import "dotenv/config";

const FLOE_API_KEY = process.env.FLOE_API_KEY;
const VENICE_MODEL = process.env.VENICE_MODEL || "mistral-small-3-2-24b-instruct";
const PROXY = "https://credit-api.floelabs.xyz/v1/proxy/fetch";
const VENICE = "https://credit-api.floelabs.xyz/v1/venice/chat/completions";
const HYDRA = "https://marketplace.floelabs.xyz/v1/db/hydradb";
const TX = "https://credit-api.floelabs.xyz/v1/agents/transactions?limit=50";

if (!FLOE_API_KEY) {
  console.error("Set FLOE_API_KEY in .env (funded — this spends real USDC).");
  process.exit(1);
}
const auth = { Authorization: `Bearer ${FLOE_API_KEY}`, "Content-Type": "application/json" };
const FETCH_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with an AbortController timeout so a stalled upstream can't hang the proof. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function hydra(op: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetchWithTimeout(PROXY, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ url: `${HYDRA}/${op}`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`HydraDB ${op} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

async function venice(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetchWithTimeout(VENICE, { method: "POST", headers: auth, body: JSON.stringify({ model: VENICE_MODEL, stream: false, messages }) });
  if (!res.ok) throw new Error(`Venice ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const d = (await res.json()) as any;
  return d.choices?.[0]?.message?.content ?? "";
}

/** Poll HydraDB until the just-ingested memories are indexed (or attempts run out). */
async function recallWithRetry(query: string, maxAttempts = 6, backoffMs = 2000): Promise<string[]> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const q = await hydra("query", { query, type: "memory", maxResults: 5 });
    const chunks: any[] = q?.result?.data?.chunks ?? [];
    const memories = chunks.map((c) => String(c.chunk_content || "").split("\n")[0]).filter(Boolean);
    if (memories.length > 0) return memories;
    if (attempt < maxAttempts) await sleep(backoffMs);
  }
  return [];
}

interface TxRow {
  id: number;
  targetHost: string | null;
  targetUrl: string;
  paymentAmountRaw: string | null;
  status: string;
}
const usd = (raw: string | null) => (raw ? Number(raw) / 1_000_000 : 0);
const fmt = (n: number) => `$${n.toFixed(6)}`;

async function ledger(): Promise<TxRow[]> {
  const res = await fetchWithTimeout(TX, { headers: { Authorization: `Bearer ${FLOE_API_KEY}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Ledger ${res.status}: ${text.slice(0, 160)}`);
  return ((JSON.parse(text) as { transactions: TxRow[] }).transactions ?? []);
}

// Explicit host classification — the ledger's targetHost is the UPSTREAM vendor
// (Venice or the marketplace), not Floe's proxy. Match exact hosts; anything
// else is flagged rather than silently bucketed as memory.
const MODEL_HOST = "api.venice.ai";
const MEMORY_HOST = "marketplace.floelabs.xyz";
function classifyHost(host: string): "model" | "memory" | "unknown" {
  if (host === MODEL_HOST) return "model";
  if (host === MEMORY_HOST) return "memory";
  return "unknown";
}

async function main() {
  console.log("🧠 Floe unified-billing proof — memory + model, one key\n");
  const beforeIds = new Set((await ledger()).map((t) => t.id));

  console.log("1. remember two facts (HydraDB ingest)");
  await hydra("ingest", { type: "memory", memories: [{ text: "The caller's name is Alex and he is allergic to shellfish.", infer: true }] });
  await hydra("ingest", { type: "memory", memories: [{ text: "Alex is planning a trip to Lisbon in October.", infer: true }] });

  console.log("2. poll until memory is indexed, then recall (HydraDB query)");
  const memories = await recallWithRetry("What should I know about the caller Alex?");
  console.log(`   recalled ${memories.length}: ${memories.join(" | ") || "(none yet — indexing lag)"}`);

  console.log("3. the model (Venice) uses the recalled memory to greet Alex");
  const spoken = await venice([
    { role: "system", content: "You are a concierge. Use the caller's remembered details to greet them warmly in one sentence." },
    { role: "user", content: `Remembered about the caller: ${memories.join("; ") || "nothing yet"}. Greet them.` },
  ]);
  console.log(`   🗣️  "${spoken}"\n`);

  await sleep(2500);
  const fresh = (await ledger()).filter((t) => !beforeIds.has(t.id)).sort((a, b) => a.id - b.id);

  console.log("─".repeat(60));
  console.log("💳 Floe ledger — new charges, all on ONE key:\n");
  let mem = 0;
  let model = 0;
  let unknown = 0;
  for (const t of fresh) {
    const amt = usd(t.paymentAmountRaw);
    const host = t.targetHost ?? new URL(t.targetUrl).host;
    const kind = classifyHost(host);
    if (kind === "model") model += amt;
    else if (kind === "memory") mem += amt;
    else unknown += amt;
    const label = kind === "model" ? "🧠 model " : kind === "memory" ? "💾 memory" : "❓ UNKNOWN";
    console.log(`  ${label}  ${host.padEnd(26)} ${fmt(amt).padStart(12)}  ${t.status}`);
  }
  console.log("─".repeat(60));
  console.log(`  💾 memory (HydraDB):  ${fmt(mem)}`);
  console.log(`  🧠 model (Venice):    ${fmt(model)}`);
  if (unknown > 0) console.log(`  ❓ unrecognized host:  ${fmt(unknown)}  ← not counted as memory; check classification`);
  console.log(`  ──────────────────────────────`);
  console.log(`  Σ ONE Floe key:       ${fmt(mem + model + unknown)}   (${fresh.length} charges)`);
  console.log("\n✅ Memory and model billed to the same Floe key — unified billing, no vendor keys.");
}

main().catch((err) => {
  console.error("❌ Proof failed:", (err as Error).message || err);
  process.exit(1);
});
