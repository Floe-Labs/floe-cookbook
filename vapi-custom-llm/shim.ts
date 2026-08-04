/**
 * Graceful-stop shim — the OPTIONAL middle layer between Vapi and Floe.
 *
 * The direct integration (setup.ts) is one config field, but at the budget
 * cap the gateway's 402 surfaces to Vapi as an LLM *failure*. This shim
 * trades one extra hop for a graceful ending: it streams Floe's SSE bytes
 * through untouched, and when Floe refuses with 402 it fabricates a final
 * spoken turn — "I've reached my budget limit for this call." — as a
 * single-chunk SSE stream, so the caller hears a clean goodbye instead of
 * an error tone.
 *
 * It also logs X-Floe-Budget-Advisory off every response (headers arrive
 * BEFORE the first token on streams), which is where you'd hook tapering:
 * e.g. flip the model to a cheaper slug when near_limit is true.
 *
 * Point Vapi at it: model.url = `${SERVER_URL}/llm/${SHIM_PATH_SECRET}`
 * (path secret because Vapi's custom-llm does not reliably forward custom
 * headers; the shim then attaches YOUR floe_ key server-side).
 *
 * Run: npm run shim   (then re-run setup with model.url pointed here)
 */
import Fastify from "fastify";
import "dotenv/config";

const FLOE_API_KEY = process.env.FLOE_API_KEY!;
const SHIM_PATH_SECRET = process.env.SHIM_PATH_SECRET;
const FLOE_CREDIT_API = (process.env.FLOE_CREDIT_API_URL || "https://credit-api.floelabs.xyz").replace(/\/+$/, "");
const PORT = Number(process.env.PORT || 3111);

if (!FLOE_API_KEY?.startsWith("floe_")) {
  console.error("Set FLOE_API_KEY in .env (floe_<hex> agent key)");
  process.exit(1);
}
if (!SHIM_PATH_SECRET || SHIM_PATH_SECRET.length < 16) {
  console.error("Set SHIM_PATH_SECRET in .env (≥16 chars — it authenticates this spend-capable endpoint)");
  process.exit(1);
}

const BUDGET_STOP_LINE = "I've reached my budget limit for this call. Thanks for chatting — goodbye!";

/** One OpenAI-shaped SSE stream containing a single spoken line, then DONE —
 *  what Vapi needs to say a graceful goodbye instead of erroring the call. */
function spokenStopSse(model: string): string {
  const id = `chatcmpl-floe-stop-${Date.now()}`;
  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    `data: ${JSON.stringify({
      id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
  return (
    chunk({ role: "assistant", content: BUDGET_STOP_LINE }, null)
    + chunk({}, "stop")
    + "data: [DONE]\n\n"
  );
}

const app = Fastify({ logger: false });

app.post("/llm/:secret/chat/completions", async (req, reply) => {
  if ((req.params as { secret: string }).secret !== SHIM_PATH_SECRET) {
    return reply.code(404).send({ error: "not_found" });
  }
  const body = req.body as Record<string, unknown>;
  const model = typeof body.model === "string" ? body.model : "openai/gpt-4o-mini";

  const upstream = await fetch(`${FLOE_CREDIT_API}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLOE_API_KEY}`,
      "Content-Type": "application/json",
    },
    // Pass Vapi's OpenAI payload through as-is — the gateway forwards tools/
    // tool_choice/etc. verbatim and injects usage accounting itself.
    body: JSON.stringify(body),
  });

  // Budget pressure, logged per turn. Wire tapering here if you want it —
  // the JSON has { tightest: { scope, used_bps, remaining_raw } }.
  const advisory = upstream.headers.get("x-floe-budget-advisory");
  if (advisory) console.log(`[floe budget] ${advisory}`);

  if (upstream.status === 402) {
    // Cap hit BEFORE any tokens were bought — end the call audibly.
    console.log("[floe budget] 402 budget_exhausted → spoken stop");
    reply.raw.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
    reply.raw.end(spokenStopSse(model));
    return reply;
  }
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return reply.code(upstream.status).send(text || { error: "upstream_error" });
  }

  // Healthy path: byte-for-byte SSE passthrough (real streaming, no fake).
  reply.raw.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
  });
  const reader = upstream.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    reply.raw.write(value);
  }
  reply.raw.end();
  return reply;
});

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  console.log(`Graceful-stop shim on :${PORT}`);
  console.log(`Point Vapi's model.url at <public-url>/llm/${SHIM_PATH_SECRET}`);
});
