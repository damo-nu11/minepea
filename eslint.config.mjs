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
    // One-off brand-asset build scripts (Node .cjs, not app source).
    "brand-exploration/**",
    // The art sub-app (art/) is its own Next project with its own
    // toolchain; the root linter must not walk into it.
    "art/**",
  ]),
]);

export default eslintConfig;
