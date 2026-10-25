import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/atif/index.ts"],
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
