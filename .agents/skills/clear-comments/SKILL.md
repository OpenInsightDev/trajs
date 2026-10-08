---
name: clear-comments
description: Use when user asks to clear the comments in the project.
---

# Comment Rules

- **No filler**: Do not repeat the file name, module path, or doc paths in comments (e.g. no `//! This module defines the... described in ...`).
- **Do not explain "what"**: Structures, names, and module relationships that the code already makes self-evident need no extra comments.
- **Only explain "why"**: Write brief comments only when the implementation is genuinely complex, relies on a special business trick, or is counter-intuitive, and explain the reason.
- **Stay self-consistent**: Assume the reader has already read related docs; do not restate or hyperlink their content in code.
