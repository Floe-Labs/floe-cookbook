/**
 * Add Floe to an agent you already have — keyless LLM gateway.
 *
 * You already have an STT→LLM→TTS agent whose LLM leg uses the standard `openai`
 * SDK pointed at OpenAI with your own key. To route that spend through Floe,
 * change TWO things: the baseURL and the apiKey (and the model id namespace).
 * No provider key — Floe holds the upstream credential and bills each call to
 * your one Floe key.
 *
 * Run:  npm install && npm start
 * Env:  FLOE_API_KEY
 */
import "dotenv/config"; // load .env so `cp .env.example .env` just works
import OpenAI from "openai";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

// This is the entire change vs your existing OpenAI client:
//   baseURL → Floe's keyless gateway   (was: default OpenAI)
//   apiKey  → your Floe key floe_<hex> (was: your OPENAI_API_KEY)
// No provider key anywhere — Floe holds the upstream credential.
const client = new OpenAI({
  baseURL: "https://credit-api.floelabs.xyz/v1", // the client appends /chat/completions
  apiKey: requireEnv("FLOE_API_KEY"),            // floe_<hex> — Floe auth + billing identity
});

// Floe-namespaced model id (your existing "gpt-4o" becomes "openai/gpt-4o").
const model = "openai/gpt-4o";

const { data, response } = await client.chat.completions
  .create({
    model,
    messages: [{ role: "user", content: "In one sentence: what is an AI agent?" }],
  })
  .withResponse();

console.log(`\n${model} → ${data.choices[0]?.message?.content ?? ""}`);
// Floe stamps the per-call cost on the response — bill it to one key, no invoices.
console.log(`cost (USDC): ${response.headers.get("x-floe-payment-amount")}`);
