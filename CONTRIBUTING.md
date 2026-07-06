# Contributing

> Note: this file currently only documents the repo's **shared configuration**.
> If a broader contribution guide is added in another PR, merge that content in
> above this section rather than replacing it.

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
