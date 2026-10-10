import { defineConfig } from "vite-plus";

// Agent tooling assets and the vendored anti-slop plugin are copied sources, not
// project code, so neither linting nor formatting may rewrite them.
const generatedAndVendored = [".agents/**", "tools/oxlint/anti-slop/**"];

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: generatedAndVendored,
  },
  lint: {
    ignorePatterns: generatedAndVendored,
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
      {
        name: "anti-slop-effect",
        specifier: "./tools/oxlint/anti-slop/effect/index.ts",
      },
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "oxc/no-accumulating-spread": "error",
      "anti-slop/no-array-filter-map": "error",
      "anti-slop/no-reduce-accumulator-copy": "error",
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      "anti-slop/no-runtime-typeof": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-parameters": "error",
      "anti-slop/no-unknown-returns": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-readable-spacing": "error",
      "anti-slop/require-safety-comment-for-type-assertion": "error",
      "anti-slop-effect/no-manual-effect-error-tag": "error",
      "anti-slop-effect/no-manual-tag-comparison": "error",
      "anti-slop-effect/no-manual-tagged-construction": "error",
      "anti-slop-effect/no-service-constructor-imports": "error",
      "anti-slop-effect/prefer-effect-match": "error",
    },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    // Cache tasks, not `package.json` scripts (the Vite+ default). Script
    // caching would also cover long-running commands like the docs dev server,
    // whose recorded output would be replayed instead of served.
    cache: { tasks: true, scripts: false },
    tasks: {
      // `vp run website` starts the docs site's Astro dev server; the task is
      // never replayed for the same reason.
      website: {
        command: "vp run website#dev",
        cache: false,
      },
    },
  },
});
