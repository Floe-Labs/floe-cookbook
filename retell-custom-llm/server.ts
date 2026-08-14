/**
 * Retell custom-LLM → Floe keyless gateway — the WebSocket adapter.
 *
 * Retell's custom LLM is NOT an OpenAI-compatible base_url swap: Retell
 * connects OUT to your server over a proprietary WebSocket
 * (wss://<you>/llm/<secret>/<call_id>) and speaks a message protocol —
 * `response_required` in, `response` chunks out. This adapter is that
 * server: each turn it rebuilds the transcript into OpenAI messages, calls
 * Floe's gateway with stream:true, and relays deltas to Retell as they
 * arrive. Which buys the Floe governance story on Retell's model leg:
 *
 *   • every token metered on your floe_ key (one ledger)
 *   • PRE-CALL gating — the turn that would start past the cap is refused
 *     402 before any tokens are bought; the adapter then SPEAKS a graceful
 *     "I've reached my budget limit" and ends the call (end_call: true)
 *   • X-Floe-Budget-Advisory logged per turn (taper hook)
 *
 * Auth: Retell documents no auth header for this socket — the unguessable
 * path secret IS the auth (same pattern as Vapi shims). Keep it long.
 *
 * Run: npm start   (expose with ngrok; then npm run setup)
 */
import { WebSocketServer, WebSocket } from "ws";
import OpenAI from "openai";
import { BudgetGuard } from "floe-guard";
import { RetellBudgetGuard } from "floe-guard/adapters/retell";
import "dotenv/config";

const FLOE_API_KEY = process.env.FLOE_API_KEY!;
const FLOE_MODEL = process.env.FLOE_MODEL || "openai/gpt-4o-mini";
const LLM_PATH_SECRET = process.env.LLM_PATH_SECRET;
const FLOE_CREDIT_API = (process.env.FLOE_CREDIT_API_URL || "https://credit-api.floelabs.xyz").replace(/\/+$/, "");
const PORT = Number(process.env.PORT || 3112);
// floe-guard: a LOCAL per-call budget ceiling (a dollar cap you own in-process),
// separate from the balance Floe enforces server-side. One guard per call.
const FLOE_LOCAL_BUDGET_USD = Number(process.env.FLOE_LOCAL_BUDGET_USD || "0.10");

if (!FLOE_API_KEY?.startsWith("floe_") || FLOE_API_KEY.startsWith("floe_live_")) {
  console.error("Set FLOE_API_KEY in .env to an AGENT key (floe_<hex>)");
  process.exit(1);
}
if (!LLM_PATH_SECRET || LLM_PATH_SECRET.length < 16) {
  console.error("Set LLM_PATH_SECRET in .env (≥16 chars — it authenticates this spend-capable socket)");
  process.exit(1);
}

const SYSTEM_PROMPT = "You are a friendly, concise voice assistant. Keep answers short and conversational.";
const BUDGET_STOP_LINE = "I've reached my budget limit for this call. Thanks for chatting — goodbye!";

// The gateway is OpenAI-compatible, so the OpenAI SDK is the whole client.
const floe = new OpenAI({ baseURL: `${FLOE_CREDIT_API}/v1`, apiKey: FLOE_API_KEY });

/** Retell transcript utterance → OpenAI chat message. */
interface RetellUtterance { role: "agent" | "user"; content: string }
function toMessages(transcript: RetellUtterance[], isReminder = false): OpenAI.ChatCompletionMessageParam[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...transcript.map((u): OpenAI.ChatCompletionMessageParam =>
      u.role === "agent" ? { role: "assistant", content: u.content } : { role: "user", content: u.content }),
    // reminder_required means the caller went quiet — without this the model
    // would answer a question nobody asked.
    ...(isReminder
      ? [{ role: "system", content: "(The caller has gone quiet. Check in briefly and naturally — don't answer a question they didn't ask.)" } as const]
      : []),
  ];
}

interface RetellInbound {
  interaction_type: "ping_pong" | "call_details" | "update_only" | "response_required" | "reminder_required";
  response_id?: number;
  transcript?: RetellUtterance[];
  timestamp?: number;
}

function handleConnection(ws: WebSocket, callId: string) {
  console.log(`[${callId}] Retell connected`);
  // One local BudgetGuard per call + the Retell adapter. beginTurn reserves a
  // turn's budget before the LLM call (blocking it if this call is over the local
  // ceiling); settleTurn meters the real token usage after; close() frees any
  // still-open reservation on hangup. This is the local twin of Floe's remote cap.
  const guard = new BudgetGuard(FLOE_LOCAL_BUDGET_USD);
  const budget = new RetellBudgetGuard(guard, { model: FLOE_MODEL });
  // Without an "error" listener, ws (an EventEmitter) would crash the process.
  ws.on("error", (err) => console.error(`[${callId}] socket error:`, err.message));
  // Config first: no auto-reconnect churn, and we don't need live transcript
  // deltas (update_only) — each response_required carries the full transcript.
  ws.send(JSON.stringify({ response_type: "config", config: { auto_reconnect: true, call_details: true } }));

  // Serialize turns: Retell can fire reminder_required while a response is
  // streaming; a stale generation must not interleave. Latest response_id wins,
  // and the superseded turn's upstream stream is ABORTED — not just muted —
  // so a barge-in stops buying Floe tokens immediately.
  let activeResponseId = -1;
  let activeAbort: AbortController | null = null;

  ws.on("message", async (raw) => {
    let msg: RetellInbound;
    try {
      msg = JSON.parse(raw.toString()) as RetellInbound;
    } catch {
      return;
    }

    if (msg.interaction_type === "ping_pong") {
      ws.send(JSON.stringify({ response_type: "ping_pong", timestamp: msg.timestamp ?? Date.now() }));
      return;
    }
    if (msg.interaction_type === "call_details") {
      // Speak first — an opening line without burning a model turn.
      ws.send(JSON.stringify({ response_type: "response", response_id: 0, content: "Hi! Ask me anything.", content_complete: true }));
      return;
    }
    if (msg.interaction_type !== "response_required" && msg.interaction_type !== "reminder_required") return;

    const responseId = msg.response_id ?? 0;
    activeResponseId = responseId;
    activeAbort?.abort();
    const abort = new AbortController();
    activeAbort = abort;
    const send = (content: string, complete: boolean, endCall = false) => {
      if (ws.readyState !== WebSocket.OPEN || activeResponseId !== responseId) return;
      ws.send(JSON.stringify({
        response_type: "response",
        response_id: responseId,
        content,
        content_complete: complete,
        ...(endCall ? { end_call: true } : {}),
      }));
    };

    // floe-guard pre-turn admission: reserve this turn's budget BEFORE the model
    // call. Over the local ceiling → speak a wrap-up and end the call, never
    // reaching Floe. A newer response_id releases the prior turn's hold (barge-in),
    // mirroring the activeAbort above.
    const turn = budget.beginTurn({ interaction_type: msg.interaction_type, response_id: responseId });
    if (!turn.admitted) {
      console.log(`[${callId}] local budget exhausted → spoken stop + end_call`);
      send(BUDGET_STOP_LINE, true, true);
      return;
    }

    try {
      const { data: stream, response: raw } = await floe.chat.completions.create({
        model: FLOE_MODEL,
        messages: toMessages(msg.transcript ?? [], msg.interaction_type === "reminder_required"),
        stream: true,
        // Ask the gateway for the terminal usage block so the guard settles the
        // turn on REAL tokens (OpenAI-style SSE omits usage without this).
        stream_options: { include_usage: true },
      }, { signal: abort.signal }).withResponse();
      // Budget pressure, per turn — headers land before the first token, so
      // this is where you'd hook tapering to a cheaper slug.
      const advisory = raw.headers.get("x-floe-budget-advisory");
      if (advisory) console.log(`[${callId}] [floe budget] ${advisory}`);
      let usage: OpenAI.CompletionUsage | undefined;
      for await (const chunk of stream) {
        if (chunk.usage) usage = chunk.usage; // final (empty-choices) chunk carries it
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) send(delta, false);
        if (activeResponseId !== responseId) return; // superseded — newer turn frees the hold
      }
      send("", true);
      // Settle the reservation against real token usage (0/0 if the gateway sent none).
      budget.settleTurn(responseId, {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
      });
    } catch (err) {
      if (abort.signal.aborted) return; // superseded — the abort is expected
      const status = (err as { status?: number }).status;
      if (status === 402) {
        // The Floe cap: refused BEFORE any tokens were bought. End audibly.
        console.log(`[${callId}] 402 budget_exhausted → spoken stop + end_call`);
        send(BUDGET_STOP_LINE, true, true);
        return;
      }
      console.error(`[${callId}] gateway error:`, (err as Error).message);
      send("Sorry, I hit a technical problem. Let's try again in a moment.", true);
    }
  });

  ws.on("close", () => {
    activeAbort?.abort(); // don't let an in-flight stream outlive the call
    budget.close();       // free any still-open turn reservation on hangup
    console.log(`[${callId}] closed`);
  });
}

const wss = new WebSocketServer({ port: PORT });
wss.on("error", (err) => console.error("WebSocket server error:", err.message));
wss.on("connection", (ws, req) => {
  // Path: /llm/<secret>/<call_id> — Retell appends the call id itself.
  const parts = (req.url ?? "").split("/").filter(Boolean);
  const [prefix, secret, callId] = parts;
  if (prefix !== "llm" || secret !== LLM_PATH_SECRET || !callId) {
    ws.close(4401, "unauthorized");
    return;
  }
  handleConnection(ws, callId);
});

console.log(`Retell custom-LLM adapter on :${PORT}`);
console.log(`llm_websocket_url = <wss-public-url>/llm/${LLM_PATH_SECRET}`);
