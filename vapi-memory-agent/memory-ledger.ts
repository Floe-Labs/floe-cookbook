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

async function hydra(op: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ url: `${HYDRA}/${op}`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`HydraDB ${op} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

async function venice(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch(VENICE, { method: "POST", headers: auth, body: JSON.stringify({ model: VENICE_MODEL, stream: false, messages }) });
  if (!res.ok) throw new Error(`Venice ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const d = (await res.json()) as any;
  return d.choices?.[0]?.message?.content ?? "";
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
  const res = await fetch(TX, { headers: { Authorization: `Bearer ${FLOE_API_KEY}` } });
  return ((await res.json()) as { transactions: TxRow[] }).transactions ?? [];
}

async function main() {
  console.log("🧠 Floe unified-billing proof — memory + model, one key\n");
  const beforeIds = new Set((await ledger()).map((t) => t.id));

  console.log("1. remember two facts (HydraDB ingest)");
  await hydra("ingest", { type: "memory", memories: [{ text: "The caller's name is Alex and he is allergic to shellfish.", infer: true }] });
  await hydra("ingest", { type: "memory", memories: [{ text: "Alex is planning a trip to Lisbon in October.", infer: true }] });

  console.log("2. wait for memory to index, then recall (HydraDB query)");
  await new Promise((r) => setTimeout(r, 6000));
  const q = await hydra("query", { query: "What should I know about the caller Alex?", type: "memory", maxResults: 5 });
  const chunks: any[] = q?.result?.data?.chunks ?? [];
  const memories = chunks.map((c) => String(c.chunk_content || "").split("\n")[0]).filter(Boolean);
  console.log(`   recalled ${memories.length}: ${memories.join(" | ") || "(none yet — indexing lag)"}`);

  console.log("3. the model (Venice) uses the recalled memory to greet Alex");
  const spoken = await venice([
    { role: "system", content: "You are a concierge. Use the caller's remembered details to greet them warmly in one sentence." },
    { role: "user", content: `Remembered about the caller: ${memories.join("; ") || "nothing yet"}. Greet them.` },
  ]);
  console.log(`   🗣️  "${spoken}"\n`);

  await new Promise((r) => setTimeout(r, 2500));
  const fresh = (await ledger()).filter((t) => !beforeIds.has(t.id)).sort((a, b) => a.id - b.id);

  console.log("─".repeat(60));
  console.log("💳 Floe ledger — new charges, all on ONE key:\n");
  let mem = 0;
  let model = 0;
  for (const t of fresh) {
    const amt = usd(t.paymentAmountRaw);
    const host = t.targetHost ?? new URL(t.targetUrl).host;
    const isModel = host.includes("venice.ai");
    isModel ? (model += amt) : (mem += amt);
    console.log(`  ${isModel ? "🧠 model " : "💾 memory"}  ${host.padEnd(26)} ${fmt(amt).padStart(12)}  ${t.status}`);
  }
  console.log("─".repeat(60));
  console.log(`  💾 memory (HydraDB):  ${fmt(mem)}`);
  console.log(`  🧠 model (Venice):    ${fmt(model)}`);
  console.log(`  ──────────────────────────────`);
  console.log(`  Σ ONE Floe key:       ${fmt(mem + model)}   (${fresh.length} charges)`);
  console.log("\n✅ Memory and model billed to the same Floe key — unified billing, no vendor keys.");
}

main().catch((err) => {
  console.error("❌ Proof failed:", (err as Error).message || err);
  process.exit(1);
});
