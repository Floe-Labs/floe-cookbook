# Contributing to the Floe Cookbook

Thanks for adding a recipe. The cookbook is a **gallery of independent
examples** — each folder stands on its own and demonstrates one clear thing
about building agents on Floe.

## Principles

- **One example, one idea.** Show a single capability well rather than many
  half-shown. If your example does two things, consider two folders.
- **Self-contained.** Everything to run the example lives in its own folder:
  code, `requirements.txt`/`package.json`, a `.env.example`, and a README.
- **Runnable and honest.** Every example must actually run against the live Floe
  API with the keys its README lists. Don't document features that don't exist
  and don't fabricate output — if a script can't run without config, it should
  say exactly what it needs and exit cleanly.
- **Walletless-first.** Prefer the managed-wallet, card-funded path. If an
  example is self-custody (signs from a private key) or on-chain, say so at the
  top of its README.

## Adding an example

1. Create a new top-level folder named for the framework or use case
   (e.g. `langchain-agent`, `metered-llm`).
2. Add a `.env.example` listing every variable the example reads, with a short
   comment on what each is. Never commit real keys — `.env` is gitignored.
3. Write a `README.md` following [docs/EXAMPLE_TEMPLATE.md](./docs/EXAMPLE_TEMPLATE.md).
4. Add a row to the **Examples** table in the root [README.md](./README.md):
   `Example · Language · Framework/Stack · Difficulty · What it shows · Link`.
   Keep the "What it shows" cell to one sentence.
5. If your example is on-chain / self-custody, note its run status and extra
   prerequisites (funded wallet, RPC endpoint) in the README.

## Style

- Use **"one Floe key" / "unified billing"** when describing the spend layer —
  not "one credit line" (working-capital credit is a separate roadmap feature).
- Prefer TypeScript examples first, Python second, where you ship both.
- Keep code small and readable — this is reference material people learn from.
- Match the tone of the existing examples: precise, no hype, no invented numbers.

## Before you open a PR

- [ ] `.env.example` present and complete; no real secrets committed.
- [ ] README follows the template and links to the relevant Floe docs.
- [ ] Example runs end-to-end with the documented keys.
- [ ] Root README table updated with your example's card.

Open PRs against `main`. Questions: [hello@floelabs.xyz](mailto:hello@floelabs.xyz)
or [@FloeLabs](https://x.com/FloeLabs).
