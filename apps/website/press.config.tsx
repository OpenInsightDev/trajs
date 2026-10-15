import { mcpPlugin } from "@fumapress/ai";
import { defineDocs } from "fumadocs-mdx/macro";
import { defineConfig } from "fumapress";
import { fumadocsMdx } from "fumapress/adapters/mdx";
import { metaSchema, pageSchema } from "fumapress/adapters/mdx/schema";

const docs = defineDocs({
  dir: "content",
  docs: {
    async: true,
    schema: pageSchema,
    lastModified: true,
    postprocess: { includeProcessedMarkdown: true },
  },
  meta: { schema: metaSchema },
});

export default defineConfig({
  content: docs.toFumadocsSource(),
  site: {
    name: "trajs",
    baseUrl: "https://tra.js.org",
    git: {
      user: "OpenInsightDev",
      repo: "trajs",
      branch: "main",
    },
  },
  meta: {
    root() {
      return (
        <>
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link
            href="https://fonts.googleapis.com/css2?family=Geist:ital,wght@0,100..900;1,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap"
            rel="stylesheet"
          />
        </>
      );
    },
  },
})
  .adapters(fumadocsMdx())
  // `mcpPlugin()` serves an MCP server at `/mcp` over Streamable HTTP, so the
  // site is deliberately not built in `mode: "static"`: that endpoint needs a
  // running server, which is the Worker the Cloudflare adapter deploys.
  .plugins(mcpPlugin());
