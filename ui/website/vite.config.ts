import tailwindcss from "@tailwindcss/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import press from "fumapress/vite";
import { defineConfig } from "vite-plus";

// `press()` is the Fumapress/Waku app, `fumadocsMdx()` compiles the MDX under
// `content/`, and `tailwindcss()` supplies the styles `src/app.css` imports.
//
// The Cloudflare adapter is off with the Cloudflare Worker it built for, and
// Fumapress falls back to the Node adapter: what is deployed is `dist/public`,
// which every adapter prerenders the same way, and the adapter only decides the
// server bundle — the one `/mcp` needed — that nothing uploads now. It was named
// rather than detected because Fumapress reads it from the build environment,
// which Cloudflare's Workers Builds sets and a plain CI runner does not; uncomment
// it with the Worker to get that bundle back.
//
// `SITE_BASE_PATH` is the path the site is served under: `/` on a domain of its
// own, `/trajs/` on a GitHub Pages project site. Every asset, every `url()` the
// stylesheet carries and every link the site renders follows it, so the deploy
// hands the build the path GitHub Pages answers on.
export default defineConfig({
  plugins: [
    // press({ adapter: "waku/adapters/cloudflare" }),
    press({ basePath: process.env.SITE_BASE_PATH ?? "/" }),
    fumadocsMdx(),
    tailwindcss(),
  ],
});
