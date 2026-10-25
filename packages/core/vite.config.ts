import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: [
      "src/index.ts",
      "src/codec/index.ts",
      "src/unstable/Indexing.ts",
      "src/unstable/atif/index.ts",
      "src/unstable/otel/index.ts",
    ],
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
        "./codec/internal/*": null,
        "./unstable/atif/internal/*": null,
        "./unstable/otel/internal/*": null,
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
