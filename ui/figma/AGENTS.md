# ui/figma

This directory is the local workspace for Figma: it holds the rules for working with Figma and the design specifications written as text. It produces no runnable code and publishes no package.

## What goes here

- **Rules** — conventions for reading and writing Figma files from this repository: layer naming, component organization, and how to use the plugins and MCP tools.
- **Design specs** — visual and interaction specifications in Markdown: color, type, spacing, grid, radius, elevation, motion, and component usage.
- **References** — file keys, node ids, and page or component inventories, kept so they can be looked up later.

## What does not go here

- Code and components: implementation belongs in `packages/`, UI components and styles in `ui/component`, `ui/shadcn`, and `ui/shaders`.
- Exported images, fonts, and other binary assets: link to Figma or name the source instead of piling files up here.

The conventions in the parent `AGENTS.md` — code style, comments, versioning, and the `vp` toolchain — still apply. This file only adds what is specific to this directory.
