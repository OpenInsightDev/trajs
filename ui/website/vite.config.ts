import tailwindcss from "@tailwindcss/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import press from "fumapress/vite";
import { defineConfig } from "vite-plus";

// `press()` is the Fumapress/Waku app, `fumadocsMdx()` compiles the MDX under
// `content/`, and `tailwindcss()` supplies the styles `src/app.css` imports.
// The Cloudflare adapter is named rather than detected: Fumapress picks it up
// from the build environment, which Cloudflare's own Workers Builds sets and a
// plain CI runner does not.
export default defineConfig({
  plugins: [press({ adapter: "waku/adapters/cloudflare" }), fumadocsMdx(), tailwindcss()],
});
