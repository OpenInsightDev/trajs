import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
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
