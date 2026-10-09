// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  // Published at https://openinsightdev.github.io/trajs/ until the tra.js.org request is approved.
  site: "https://openinsightdev.github.io",
  base: "/trajs",
  integrations: [
    starlight({
      title: "trajs",
      description: "Record, version and analyze AI model sessions as trajectories.",
      favicon: "/favicon.svg",
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/OpenInsightDev/trajs",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/OpenInsightDev/trajs/edit/main/",
      },
      sidebar: [
        {
          label: "Start",
          items: [{ label: "Getting started", slug: "getting-started" }],
        },
        {
          label: "Concepts",
          items: [{ label: "Trajectories", slug: "concepts/trajectory" }],
        },
        {
          label: "Guides",
          items: [
            { label: "Toolkits and recorded tools", slug: "guides/toolkits" },
            { label: "Versioned data", slug: "guides/versioned-data" },
            { label: "The .trajs format", slug: "guides/trajs-format" },
          ],
        },
        {
          label: "Vision",
          items: [{ label: "Vision and roadmap", slug: "vision" }],
        },
        {
          label: "Reference",
          items: [{ autogenerate: { directory: "reference" } }],
        },
      ],
    }),
  ],
});
