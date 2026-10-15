import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    // The modules are emitted as they are reached — `src/index.ts` reaches all of
    // them — and `Zstd` is reached by nothing: it is the one module the entry point
    // leaves out (see `src/index.ts`), so it is named here as well or it is not
    // built at all.
    entry: ["src/index.ts", "src/Zstd.ts"],
    unbundle: true,
    dts: {
      generator: "tsgo",
    },
    exports: {
      devExports: true,
      customExports: (exports, { isPublish }) => ({
        ...exports,
        "./*": isPublish ? "./dist/*.mjs" : "./src/*.ts",
        "./internal/*": null,
        "./*/index": null,
      }),
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
