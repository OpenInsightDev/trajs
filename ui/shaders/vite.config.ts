import { defineConfig } from "vite-plus";

// The vendored Figma runtime is copied source rather than project code, so it is
// left as written — the same treatment the root config gives it — to keep the
// only thing that makes it checkable against upstream, which is that it is the
// same text. `vp check` inside this package reads this config, not the root one.
const copiedSources = ["src/internal/runtime/**"];

export default defineConfig({
  pack: {
    unbundle: true,
    dts: {
      generator: "tsgo",
    },
  },
  lint: {
    ignorePatterns: copiedSources,
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: copiedSources,
  },
});
