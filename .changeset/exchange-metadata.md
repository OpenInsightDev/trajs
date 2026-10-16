---
"@trajs/core": minor
"@trajs/platform-browser": minor
"@trajs/platform-bun": minor
"@trajs/platform-node": minor
"@trajs/utils": minor
---

Let a recording state how it was written and what it is named by: the tail of a
recording is its exchange metadata — the compression algorithm, the hash algorithm,
the digest and the version of trajs that wrote it — as one `SchemaBinary` frame
followed by the length of that frame, so `Loaded.digest` is `Loaded.metadata`. A
compression and a hash state the algorithm they are over
(`Compression.algorithm`, `StreamHash.algorithm`), which is what the metadata is
written from, and the layers of the platform packages state it where they are built.
