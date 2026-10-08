// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  // GitHub Pages project site: https://openinsightdev.github.io/trajs/
  site: "https://openinsightdev.github.io",
  base: "/trajs",
  integrations: [
    starlight({
      title: "trajs",
      description:
        "Record, version and analyze AI model sessions as trajectories, with extension data as a first-class part of the record.",
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
          items: [
            { label: "Trajectories", slug: "concepts/trajectory" },
            { label: "Extensions", slug: "concepts/extensions" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Toolkits and recorded tools", slug: "guides/toolkits" },
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
