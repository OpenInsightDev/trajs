import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["scenes/**/*.test.ts", "tutorials/**/*.test.ts"],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
