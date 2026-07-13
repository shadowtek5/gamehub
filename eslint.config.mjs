import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // refs/ is gitignored local scratch (Big Picture capture + probe scripts),
    // not application source — never lint it.
    "refs/**",
    // Emscripten / WASM build glue is generated, not hand-written source.
    "a.out.*",
  ]),
  {
    // Two React-Compiler rules from the Next preset fire on idioms this app
    // uses deliberately and correctly: setting state inside a mount-time
    // data-load effect, and snapshotting the latest state into a ref for a
    // window listener. They flag optimisation hints, not bugs (the code
    // type-checks and runs), so keep them visible as warnings rather than
    // build-breaking errors.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);

export default eslintConfig;
