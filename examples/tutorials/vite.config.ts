import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["*/main.test.ts"],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
