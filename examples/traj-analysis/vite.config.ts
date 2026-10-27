import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["cases/**/*.test.ts"],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
