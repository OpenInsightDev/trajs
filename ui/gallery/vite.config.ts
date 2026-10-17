import tailwindcss from "@tailwindcss/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import press from "fumapress/vite";
import { defineConfig } from "vite-plus";

// `press()` is the Fumapress/Waku app, `fumadocsMdx()` compiles the MDX under
// `content/`, and `tailwindcss()` supplies the styles `src/app.css` imports —
// including the ones the demos are built from.
export default defineConfig({
  plugins: [press(), fumadocsMdx(), tailwindcss()],
});
