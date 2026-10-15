import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    // The command is one executable: its entry is bundled, while every
    // dependency stays external, so what ships is the command itself rather
    // than a copy of `effect` beside it.
    entry: ["src/index.ts"],
    // Nothing imports the command, so it has no declarations to emit.
    dts: false,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
