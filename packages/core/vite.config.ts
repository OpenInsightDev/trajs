import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/atif/index.ts", "src/codec/index.ts"],
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
        "./atif/internal/*": null,
        "./codec/internal/*": null,
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
