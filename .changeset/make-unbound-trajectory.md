---
"@trajs/core": minor
---

Make `Trajectory.make` construct an unbound trajectory. It no longer takes a
toolkit and an extension kit: it attaches the metadata to the parts and leaves
the toolkit empty and the extension kit unheld, so the returned trajectory takes
the parts in their tolerant form. Bind the recording to the tools and extensions
it refers to with `Toolkit.toolkits` and `Extensionkit.extkits` when its parts
should carry their types.
