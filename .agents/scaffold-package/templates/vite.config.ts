import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      generator: "tsgo",
    },
    exports: {
      devExports: true,
      customExports: {
        "./*": "./src/*.ts",
        "./internal/*": null,
        "./*/index": null,
      },
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
