/**
 * Venice LLM shim — the "compute" plane, governed by Floe.
 *
 * Vapi's custom-llm provider POSTs an OpenAI-compatible chat request to
 * `<SERVER_URL>/llm/chat/completions`. This shim forwards it to Floe's METERED
 * Venice endpoint (`/v1/venice/chat/completions`) with a Floe agent key. Floe
 * keeps one pooled Venice balance (its own float), pays Venice per call, and
 * debits the AGENT only the at-cost token usage (X-Floe-Cost-USDC) against the
 * same credit line + session ceiling that the agent's tools draw on. One
 * ceiling, model + tools. No Venice key, no $10 top-up on the agent.
 *
 * Why a shim at all: Floe's metered endpoint refuses stream:true (it needs the
 * terminal usage block to meter), but Vapi's custom-llm expects an OpenAI SSE
 * chunk stream. So we call Floe with stream:false and re-emit the finished
 * completion to Vapi as a single-chunk SSE stream.
 *
 * Model list (source of truth): Floe's marketplace /vendors/venice-compute,
 * not Venice's docs. Floe strips any `venice/` prefix from the model id.
 */
import type { FastifyInstance, FastifyReply } from "fastify";

export interface VeniceLlmConfig {
  /** Floe AGENT key (floe_…, not floe_live_…) — auth + credit-line debit. */
  floeApiKey: string;
  /** Floe's metered Venice endpoint, e.g. https://credit-api.floelabs.xyz/v1/venice/chat/completions */
  floeVeniceUrl: string;
  /** Venice model id (with or without the venice/ prefix; Floe strips it). */
  veniceModel: string;
  timeoutMs: number;
  /**
   * Shared secret Vapi carries in the custom-llm URL path
   * (`${SERVER_URL}/llm/${authToken}` → Vapi appends `/chat/completions`). This
   * gates the endpoint, which spends the server's Floe credit line and listens
   * on 0.0.0.0. A path segment is used because Vapi's custom-llm doesn't reliably
   * send custom headers.
   */
  authToken: string;
}

/** Error carrying the upstream HTTP status so failures classify by code, not text. */
class FloeVeniceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// Fields we forward to Floe→Venice. Anything else Vapi sends (its own metadata,
// call ids, etc.) is dropped so Venice's OpenAI-compatible parser stays happy.
const PASSTHROUGH_FIELDS = [
  "messages",
  "tools",
  "tool_choice",
  "temperature",
  "max_tokens",
  "max_completion_tokens",
  "top_p",
  "stop",
] as const;

interface OpenAiChoice {
  index: number;
  message: { role: string; content: string | null; tool_calls?: unknown[] };
  finish_reason: string | null;
}
interface OpenAiCompletion {
  id?: string;
  created?: number;
  model?: string;
  choices?: OpenAiChoice[];
}

/**
 * Strip fields Venice emits in its OWN responses but rejects on input. When a
 * tool turn echoes the prior assistant message back, Venice's validator 400s on
 * `name: null` (wants a string or absent) and the non-standard
 * `reasoning_content`. Clean each message so the multi-turn tool loop works.
 */
function sanitizeMessages(messages: unknown): unknown {
  if (!Array.isArray(messages)) return messages;
  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    const m = { ...(msg as Record<string, unknown>) };
    delete m.reasoning_content;
    if (m.name === null || m.name === undefined) delete m.name;
    return m;
  });
}

/** Build the Floe→Venice request from Vapi's incoming OpenAI request. */
function buildVeniceBody(incoming: Record<string, unknown>, model: string): string {
  // stream MUST be false — Floe's metered endpoint refuses streaming.
  const out: Record<string, unknown> = { model, stream: false };
  for (const field of PASSTHROUGH_FIELDS) {
    if (incoming[field] === undefined) continue;
    out[field] = field === "messages" ? sanitizeMessages(incoming[field]) : incoming[field];
  }
  return JSON.stringify(out);
}

/** Pay Venice through Floe's metered endpoint. Returns the completion + USDC cost. */
async function callFloeVenice(
  body: string,
  cfg: VeniceLlmConfig,
): Promise<{ completion: OpenAiCompletion; costUsdc: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(cfg.floeVeniceUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.floeApiKey}`,
        "Content-Type": "application/json",
      },
      body,
      signal: controller.signal,
    });

    const costUsdc = res.headers.get("x-floe-cost-usdc");
    const text = await res.text();
    if (!res.ok) {
      // 402 (budget/funding gate) lands here → surfaced as the graceful hard-stop
      // below, classified by STATUS not body text.
      throw new FloeVeniceError(`Floe Venice ${res.status}: ${text.slice(0, 300)}`, res.status);
    }
    return { completion: JSON.parse(text) as OpenAiCompletion, costUsdc };
  } finally {
    clearTimeout(timeout);
  }
}

/** Re-emit a finished completion to Vapi as a one-chunk OpenAI SSE stream. */
function streamCompletion(reply: FastifyReply, completion: OpenAiCompletion): void {
  const choice = completion.choices?.[0];
  const base = {
    id: completion.id ?? "chatcmpl-floe",
    object: "chat.completion.chunk",
    created: completion.created ?? Math.floor(Date.now() / 1000),
    model: completion.model ?? "venice",
  };
  const delta: Record<string, unknown> = { role: "assistant" };
  if (choice?.message.content) delta.content = choice.message.content;
  // OpenAI streaming requires `index` on each tool_call delta — Vapi won't
  // execute the tool without it. Venice returns tool_calls without an index.
  if (choice?.message.tool_calls) {
    delta.tool_calls = choice.message.tool_calls.map((tc, i) =>
      tc && typeof tc === "object" && "index" in tc ? tc : { index: i, ...(tc as object) },
    );
  }

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const write = (obj: unknown) => reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
  write({ ...base, choices: [{ index: 0, delta, finish_reason: null }] });
  write({ ...base, choices: [{ index: 0, delta: {}, finish_reason: choice?.finish_reason ?? "stop" }] });
  reply.raw.write("data: [DONE]\n\n");
  reply.raw.end();
}

/**
 * Pick the spoken fallback by failure type. Only a genuine 402 budget refusal
 * should mention the budget — a timeout or upstream error must NOT, or the
 * agent falsely tells the caller it's out of money (which it isn't).
 */
function failureMessage(err: Error): string {
  // Classify by STATUS, not body wording. 402 = spend/funding ceiling; 403 =
  // access gate (e.g. allowlist). Either is a limit, not a transient glitch, so
  // don't tell the caller it's a "technical hiccup" — and it's one shared cap
  // (model + tools), so don't imply a search-only limit.
  const status = err instanceof FloeVeniceError ? err.status : undefined;
  if (status === 402 || status === 403) {
    return "I've reached my budget limit for this call, so I can't continue right now.";
  }
  return "Sorry — I had a brief technical hiccup. Could you ask that again?";
}

/** A graceful assistant turn so the caller (Vapi) never gets a 5xx mid-voice. */
function fallbackCompletion(message: string): OpenAiCompletion {
  return {
    id: "chatcmpl-floe-fallback",
    created: Math.floor(Date.now() / 1000),
    model: "venice",
    choices: [{ index: 0, message: { role: "assistant", content: message }, finish_reason: "stop" }],
  };
}

export function registerVeniceLlm(app: FastifyInstance, cfg: VeniceLlmConfig): void {
  // Secret in the URL path (Vapi is configured with `${SERVER_URL}/llm/${authToken}`)
  // gates this credit-line-spending endpoint on a 0.0.0.0 server.
  app.post<{ Params: { token: string } }>("/llm/:token/chat/completions", async (request, reply) => {
    if (request.params.token !== cfg.authToken) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const incoming = (request.body ?? {}) as Record<string, unknown>;
    const wantsStream = incoming.stream === true;

    let completion: OpenAiCompletion;
    try {
      const body = buildVeniceBody(incoming, cfg.veniceModel);
      const result = await callFloeVenice(body, cfg);
      completion = result.completion;
      const tools = completion.choices?.[0]?.message.tool_calls?.length ?? 0;
      console.log(
        `🧠 Venice inference via Floe: model=${cfg.veniceModel} cost=$${result.costUsdc ?? "?"} (raw) tool_calls=${tools}`,
      );
    } catch (err) {
      // Budget exhausted / proxy error → say something instead of crashing the
      // call. This is also where the credit-line ceiling surfaces to the agent.
      const msg = (err as Error).message || "unknown error";
      console.error(`❌ Venice inference failed: ${msg}`);
      completion = fallbackCompletion(failureMessage(err as Error));
    }

    if (wantsStream) {
      streamCompletion(reply, completion);
      return reply;
    }
    return completion;
  });
}
