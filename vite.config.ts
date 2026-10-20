import { defineConfig } from "vite-plus";

// What fmt and lint stay out of: agent tooling assets and the vendored anti-slop
// plugin, which are copied sources rather than project code, and the shadcn/ui
// components in `ui/shadcn/src`, which are copied sources for the same reason —
// they are re-added with `shadcn add`, so leaving them as written keeps that a
// no-op. The rest is written by a build.
const ignoredByFmtAndLint = [
  ".agents/**",
  "tools/oxlint/anti-slop/**",
  "ui/shadcn/src/**",
  // The shader runtime the landing page draws its fills with, copied from
  // https://github.com/figma/expressive-components — see the README beside it.
  // Kept as written so it can be diffed against upstream.
  "ui/website/src/shader-runtime/**",
  // Written by the Fumapress builds and the Fumadocs MDX collections they load.
  "ui/website/.source/**",
  "ui/website/src/pages.gen.ts",
  "ui/gallery/.source/**",
  "ui/gallery/src/pages.gen.ts",
];

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [...ignoredByFmtAndLint],
    // Organize imports into Oxfmt's default groups (builtin, external,
    // internal, relative, style) and sort within each, so import order is a
    // formatter concern rather than something reviewers have to check.
    sortImports: true,
  },
  lint: {
    ignorePatterns: [...ignoredByFmtAndLint],
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
      // TypeScript leaves a conditional type over an unresolved type parameter
      // unevaluated, so a member typed that way has no literal tag to branch on.
      // "anti-slop-effect/no-manual-tag-comparison": "error",
      "anti-slop-effect/no-manual-tagged-construction": "error",
      "anti-slop-effect/no-service-constructor-imports": "error",
      "anti-slop-effect/prefer-effect-match": "error",
      // These APIs take the value itself, so a call reads inside out where a
      // `.pipe(...)` stage reads left to right; the rewrite is mechanical.
      "anti-slop-effect/prefer-pipe-for-data-last-apis": "warn",
      // Deep call nesting is a readability prompt, not a defect, and a nested
      // value does not always have the `.pipe(...)` a staged chain would call.
      "anti-slop-effect/prefer-pipe-over-nesting": "warn",
    },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    // Cache tasks, not `package.json` scripts (the Vite+ default). Script
    // caching would also cover long-running commands like the docs dev server,
    // whose cached output would be replayed instead of served.
    cache: { tasks: true, scripts: false },
    tasks: {
      // `vp run website` starts the docs site's Fumapress dev server; the task
      // is never replayed for the same reason.
      website: {
        command: "vp run website#dev",
        cache: false,
      },
      // `vp run viewer` starts the viewer's Vite dev server; the task is never
      // replayed for the same reason.
      viewer: {
        command: "vp run viewer#dev",
        cache: false,
      },
      // `vp run gallery` starts the component gallery's Fumapress dev server;
      // the task is never replayed for the same reason.
      gallery: {
        command: "vp run gallery#dev",
        cache: false,
      },
    },
  },
});
