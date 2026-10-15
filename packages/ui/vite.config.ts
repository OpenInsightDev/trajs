import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    // Each component is its own entry, so a consumer that imports one of them
    // does not carry the rest. The `exports` map in package.json is written by
    // hand rather than by `vp pack`, since components are added and removed
    // with `shadcn add` and two wildcards already describe the whole surface.
    entry: ["src/components/*.tsx", "src/hooks/*.ts"],
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
