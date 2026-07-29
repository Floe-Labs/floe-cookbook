/**
 * The sales brain — Floe Phone WEBHOOK backend.
 *
 * Floe Phone runs the telephony + STT + TTS and posts each finished caller
 * utterance here: { type:"agent.message", channel:"voice", callId, text,
 * recentHistory }. We run the model + tools and reply with NDJSON text chunks
 * that Floe speaks back. Every model + tool call carries X-Floe-Task-Id=<callId>,
 * so the LLM, the paid research tool, and the phone legs all meter on ONE Floe
 * balance under ONE campaign spend cap.
 *
 *   npx tsx server.ts        # keep an ngrok https tunnel pointed at PORT
 */
import Fastify from "fastify";
import "dotenv/config";
import { keylessChat, proxyFetch, MODEL, type ChatMessage, type BudgetAdvisory } from "./floe.js";
import { getCall, appendTurn, updateCall, type Disposition } from "./store.js";

const PORT = Number(process.env.PORT || 3000);
const EXA_URL = process.env.EXA_URL || "https://api.exa.ai/search";
const MAX_TOOL_ROUNDS = 4;

// WEBHOOK_SECRET authenticates Floe Phone's webhook to this server. Floe Phone
// sends no auth header, so the secret lives in the webhook URL path (setup.ts
// bakes it in as /floe/voice/<secret>) and we reject anything that doesn't match.
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
for (const k of ["FLOE_API_KEY", "WEBHOOK_SECRET"]) {
  if (!process.env[k]) { console.error(`Set ${k} in .env`); process.exit(1); }
}

// What the agent is selling: Floe itself. Prospecting for the product it runs on.
const SYSTEM_PROMPT = `You are Riley, a friendly, sharp sales rep for **Floe** — the spend layer for AI voice agents. You are on a live phone call with someone who asked to hear about Floe. Your ONE goal this call: qualify them and **book a 20-minute demo**.

What Floe does (say it simply): one API key pays every vendor a voice agent uses — telephony, speech-to-text, the LLM, text-to-speech, data APIs — from a prepaid balance, with server-side spend limits per call, per day, per vendor. No wallets, no crypto, no juggling ten vendor accounts and bills. It's live on Base. (Fun fact you can drop: this very call runs on Floe — the phone, the voice, my brain, and any lookup I do all meter on one Floe key.)

How to run the call:
- Open warm and brief. Confirm you're talking to the right person and it's a good time.
- Ask 1-2 qualifying questions: what are they building with voice, and how do they pay their vendors today?
- Tie their pain to Floe in one or two sentences. Handle objections plainly, don't oversell.
- Drive to the CTA: offer a 20-min demo. If yes, call the book_demo tool with their email and a suggested time.
- Use research_prospect (a paid web lookup) ONLY if it clearly helps — e.g. to reference their company. It costs money; don't waste it.
- If they're not interested or ask to be removed, respect it immediately: call mark_disposition (not_interested or opt_out), thank them, and wrap up. Never be pushy.

Style: SHORT, spoken, one thought at a time — this is a phone call, not an email. Two sentences max per turn. Never read tool JSON aloud; summarize.`;

// ── Tools the model can call ──────────────────────────────────────────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "research_prospect",
      description: "Look up quick public info about the prospect or their company (paid web search via Floe). Use sparingly — only when it helps the pitch.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "What to look up (e.g. 'Acme Corp voice AI product')." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_demo",
      description: "Book a 20-minute Floe demo for the prospect. Call this the moment they agree.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "Prospect's email for the invite." },
          suggestedTime: { type: "string", description: "A time they suggested or you proposed, in words." },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_disposition",
      description: "Record the call outcome when it's clear. Call this before wrapping up.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["interested", "not_interested", "callback", "opt_out"] },
          note: { type: "string", description: "One-line reason / next step." },
        },
        required: ["status"],
      },
    },
  },
];

/** A short budget line appended to paid tool results so the model paces itself. */
function budgetLine(advisory: BudgetAdvisory | null, spentUsd: number): string {
  const t = advisory?.tightest;
  if (t?.remaining_raw != null) {
    const left = Number(t.remaining_raw) / 1e6;
    const pace = advisory?.near_limit ? "nearly out — wrap up soon" : "on track";
    return `\n\n[Floe budget: ~$${left.toFixed(3)} left on the ${t.scope ?? "call"} cap · pace: ${pace}]`;
  }
  return `\n\n[Floe budget: ~$${spentUsd.toFixed(3)} spent so far this call]`;
}

async function runTool(
  name: string,
  args: any,
  callId: string,
): Promise<{ content: string; advisory: BudgetAdvisory | null; costUsd: number | null }> {
  if (name === "research_prospect") {
    const r = await proxyFetch(
      EXA_URL,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: args.query, numResults: 3, contents: { text: { maxCharacters: 400 } } }) },
      callId,
    );
    if (r.blocked) return { content: "PAYMENT_BLOCKED: budget/policy limit reached — do not retry paid lookups.", advisory: r.advisory, costUsd: r.costUsd };
    if (!r.ok) return { content: `research_prospect failed (${r.status}) — skip it and continue the call.`, advisory: r.advisory, costUsd: r.costUsd };
    // Summarize Exa results into a compact string for the model.
    let summary = r.body.slice(0, 600);
    try {
      const j = JSON.parse(r.body);
      summary = (j.results ?? []).slice(0, 3).map((x: any) => `- ${x.title ?? ""}: ${(x.text ?? "").slice(0, 160)}`).join("\n") || "No results.";
    } catch { /* keep raw slice */ }
    return { content: summary, advisory: r.advisory, costUsd: r.costUsd };
  }
  if (name === "book_demo") {
    // Local CRM action — no paid API. In production, hit your scheduler here.
    const slot = args.suggestedTime || "a time we'll confirm by email";
    updateCall(callId, { disposition: "booked_demo", bookedSlot: `${args.email} · ${slot}` });
    return { content: `Demo booked for ${args.email} (${slot}). A calendar invite will follow.`, advisory: null, costUsd: null };
  }
  if (name === "mark_disposition") {
    const map: Record<string, Disposition> = { interested: "interested", not_interested: "not_interested", callback: "callback", opt_out: "opt_out" };
    updateCall(callId, { disposition: map[args.status] ?? "in_progress" });
    return { content: `Noted: ${args.status}.`, advisory: null, costUsd: null };
  }
  return { content: `Unknown tool ${name}.`, advisory: null, costUsd: null };
}

/** Map Floe's recentHistory into chat messages (defensive about shape). */
function mapHistory(recent: any): ChatMessage[] {
  if (!Array.isArray(recent)) return [];
  return recent.map((m: any) => ({
    role: m.role === "assistant" || m.role === "agent" ? "assistant" : "user",
    content: String(m.text ?? m.content ?? ""),
  }));
}

const app = Fastify({ logger: false });

// Floe Phone posts each finished caller utterance here (webhook voice mode).
app.post("/floe/voice/:token", async (request, reply) => {
  if ((request.params as any).token !== WEBHOOK_SECRET) {
    return reply.status(401).send({ error: "unauthorized" });
  }
  const ev = request.body as any;
  if (ev?.type !== "agent.message") {
    return reply.status(200).send(""); // ignore non-message events
  }
  // No callId → reject. Defaulting to a literal would merge unrelated calls into
  // one task budget and one calls.json record.
  if (!ev.callId) return reply.status(400).send({ error: "missing callId" });
  const callId = String(ev.callId);
  const callerText = String(ev.text ?? "");
  appendTurn(callId, "caller", callerText);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...mapHistory(ev.recentHistory),
    { role: "user", content: callerText },
  ];

  let spentUsd = 0;
  let finalText = "";

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const { message, costUsd, advisory, blocked } = await keylessChat(messages, TOOLS, callId);
      if (costUsd) spentUsd += costUsd;
      if (blocked) {
        finalText = "I'm sorry — I've reached my budget for this call, so I'll wrap up here. I'll follow up by email. Thanks so much for your time!";
        break;
      }
      messages.push(message);
      const toolCalls = message.tool_calls ?? [];
      if (!toolCalls.length) {
        finalText = String(message.content ?? "").trim();
        break;
      }
      // Execute each tool call, feed results back to the model.
      for (const tc of toolCalls) {
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch { /* empty */ }
        const out = await runTool(tc.function?.name, args, callId);
        if (out.costUsd) spentUsd += out.costUsd;
        const content = out.content + (tc.function?.name === "research_prospect" ? budgetLine(out.advisory, spentUsd) : "");
        messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function?.name, content });
      }
    }
  } catch (err) {
    request.log.error(err);
    finalText = "Sorry, I hit a snag on my end. Can I follow up with you by email?";
  }

  if (!finalText) finalText = "Thanks — I'll follow up by email with the details.";
  appendTurn(callId, "agent", finalText);

  // NDJSON reply: one line = the text Floe speaks. (Stream interim chunks for
  // lower perceived latency in production; one final chunk is fine for a demo.)
  reply.header("content-type", "application/x-ndjson");
  return reply.send(JSON.stringify({ text: finalText }) + "\n");
});

app.get("/health", async () => ({ ok: true, model: MODEL }));

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  console.log(`🎙️  Floe Phone sales brain listening on :${PORT}  (model: ${MODEL})`);
  console.log(`   Point your Floe Phone webhookUrl at  <public-https>/floe/voice/<WEBHOOK_SECRET>  (setup.ts does this)`);
  console.log(`   (run setup.ts to buy a number + set webhook voice mode)`);
});
