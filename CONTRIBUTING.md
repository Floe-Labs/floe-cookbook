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
   (e.g. `vapi-voice-agent`, `metered-llm`).
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

Open PRs against `main`. Questions: [hello@floefinance.com](mailto:hello@floefinance.com)
or [@FloeLabs](https://x.com/FloeLabs).

---


Every example in this cookbook is **independent**: its own `package.json` /
`requirements.txt`, its own lockfile (if any), no workspace, no cross-example
imports. The shared config below is **opt-in** — it gives you a sane, strict
baseline to extend, but nothing forces an example to adopt it.

## Shared configuration

### TypeScript — `tsconfig.base.json`

Strict base with `ES2022` + `Bundler` module resolution (matches the `tsx`/ESM
examples). Extend it from an example's own `tsconfig.json`:

```jsonc
{
  "extends": "../tsconfig.base.json",
  "include": ["index.ts"]
  // add example-specific compilerOptions here if needed
}
```

CI runs `tsc --noEmit` for any example that has a `tsconfig.json`; an example
without one is skipped, not failed.

### Prettier — `.prettierrc.json`

Applied automatically. Prettier walks up the directory tree, so every example
inherits the root config with no per-example setup. Just run `npx prettier .`
from within an example (or the repo root).

### ESLint — `eslint.config.mjs`

Opt-in and **not** part of CI (linting is an authoring convenience). To adopt it
in an example, install the peer tools locally and re-export the root config:

```bash
npm i -D eslint @eslint/js typescript-eslint
```

```js
// <example>/eslint.config.mjs
export { default } from "../eslint.config.mjs";
```

Then `npx eslint .` inside the example. Because examples are independent (no
root `node_modules`), the peer tools must be installed in the example itself.

## What CI checks

Push/PR runs `.github/workflows/ci.yml`, which discovers examples at runtime:

- **TypeScript** (any dir with `package.json`): clean install (`npm ci` if a
  lockfile exists, else `npm install`) + `tsc --noEmit` when a `tsconfig.json`
  is present.
- **Python** (any dir with `requirements.txt` / `pyproject.toml` / `*.py`):
  `ruff check` if the example ships a ruff config, otherwise a `py_compile`
  syntax smoke test.

Add a new example directory and it is picked up automatically — no workflow edit
required.

## Dependency updates

Managed by **Renovate** (`renovate.json`), which auto-discovers every example's
`package.json` and `requirements.txt`. Non-major updates are grouped into weekly
PRs; dev-dependency and GitHub Actions minor/patch bumps auto-merge; majors
always get a reviewable PR. (Renovate replaced Dependabot so we didn't have to
hand-list every example directory.)
