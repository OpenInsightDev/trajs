import { defineDocs } from "fumadocs-mdx/macro";
import { defineConfig } from "fumapress";
import { fumadocsMdx } from "fumapress/adapters/mdx";
import { metaSchema, pageSchema } from "fumapress/adapters/mdx/schema";
import { createDocsLayoutPage } from "fumapress/layouts/docs";

import { mdxComponents } from "./src/components/mdx";

const docs = defineDocs({
  dir: "content",
  docs: {
    async: true,
    schema: pageSchema,
    lastModified: true,
    // The recommended plugins include `llms.txt`, which serves each page as
    // Markdown, and so needs the processed text to be kept on the page.
    postprocess: { includeProcessedMarkdown: true },
  },
  meta: { schema: metaSchema },
});

const DocsPage = createDocsLayoutPage<typeof config.$context>();

const config = defineConfig({
  content: docs.toFumadocsSource(),
  renderPage: ({ lang, slugs, page }) => <DocsPage lang={lang} page={page} slugs={slugs} />,
  defaultLayoutProps: {
    nav: { title: "trajs gallery", url: "/" },
  },
  site: {
    name: "trajs gallery",
    baseUrl: "https://gallery.tra.js.org",
  },
});

// `getMdxComponents` is what makes the demos ordinary page content: they are
// server-rendered with the page rather than mounted into it afterwards, so they
// are in the HTML, in the search index, and in the copy of the page served to
// agents.
export default config.adapters(fumadocsMdx({ getMdxComponents: () => mdxComponents }));
