import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    unbundle: true,
    dts: {
      generator: "tsgo",
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
