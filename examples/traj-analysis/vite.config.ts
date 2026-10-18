import { defineConfig } from "vite-plus";

// Unlike the packages under `packages/`, an example is never built or published, so
// this config states no `pack` block: there is no library to bundle. It keeps the
// lint and format settings the rest of the workspace uses, and names where an
// example's tests live — one `main.test.ts` per case.
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
