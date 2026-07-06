// Shared ESLint flat config for the Floe Cookbook examples.
//
// This is OPT-IN. Examples stay independent — there is no root install and no
// workspace. An example adopts it by installing the peer tools locally and
// re-exporting this file from its own eslint.config.mjs. See CONTRIBUTING.md
// ("Shared configuration") for the exact snippet.
//
// It is intentionally NOT wired into CI: CI runs `tsc --noEmit` (TS) and
// `ruff` / `py_compile` (Python). Linting is a local/authoring convenience.
//
// Peer tools an example must install to use this:
//   npm i -D eslint @eslint/js typescript-eslint

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.venv/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // Examples are teaching artifacts: allow an unused arg/var when it is
      // clearly a placeholder (leading underscore), and don't hard-fail on
      // `any` since example code often narrows loosely for readability.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
