---
"@trajs/platform-browser": minor
"@trajs/platform-bun": minor
"@trajs/platform-node": minor
"@trajs/utils": minor
---

Let a layer state which algorithm carries a trajectory's parts and which names it:
none, zstd, gzip or deflate (`Compression.Options`), and BLAKE3, BLAKE2b or SHA-256
(`StreamHash.Options`), each over a codec the platform states. The layers of the
platform packages take those options, and the hash `@trajs/utils` ships computes all
three digests in JavaScript.
