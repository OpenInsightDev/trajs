import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // `@/*` mirrors the paths in tsconfig.json, which shadcn/ui writes its
    // imports against.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
