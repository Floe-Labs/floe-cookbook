# Contributing to floe-vercel-ai-starter

This is a clonable starter that ships a Vercel AI SDK agent with
[`floe-guard`](https://github.com/Floe-Labs/floe-guard) spend-governance wired in
by default — the agent's spend is hard-capped before its next model call. Hosted
Floe is the upgrade path: enforcement moves server-side so the ceiling becomes
un-bypassable and cross-vendor.

Contributions are welcome.

## Development setup

```bash
git clone https://github.com/Floe-Labs/floe-vercel-ai-starter.git
cd floe-vercel-ai-starter
npm install
cp .env.example .env.local    # add OPENAI_API_KEY for live chat (optional for the demo)
```

Run the checks before opening a PR:

```bash
npm run typecheck     # TypeScript
npm run build         # next build
npm run dev           # then open http://localhost:3000 and run the zero-key demo
```

## Contribution flow

1. Fork the repo and create a branch off `main` (e.g. `feat/your-change`).
2. Make your change and keep `npm run typecheck` + `npm run build` green.
3. Open a **draft pull request** against `main` and describe what changed and why.

## Code style

- TypeScript with `strict` mode; Next.js App Router conventions.
- Keep files small and focused; match the existing style.
- Never commit API keys or secrets — keys come only from env / deploy-button prompts.
- Floe API calls go only to `https://credit-api.floelabs.xyz`.

Open an issue first if you want to discuss a larger change.
