---
"@trajs/utils": minor
"@trajs/platform-node": minor
"@trajs/platform-bun": minor
"@trajs/platform-browser": minor
---

`Compression.make` takes a `Compression.Codec`: the frame of each algorithm its runtime writes
and reads, and nothing of the options. The algorithm of a call, and the chunks `None` passes
through untouched, are resolved in `@trajs/utils`, as `Checksum.make` takes a `Checksum.Codec`
and reads the tables of that package where a runtime states no checksum.

`Compression.Frame` names one direction of a frame, and `Compression.CodedAlgorithm` the
algorithms a codec states: every algorithm except `None`, which no codec writes.

`NodeCompression.layer`, `BunCompression.layer` and `BrowserCompression.layer` therefore
state one codec per algorithm, and `NodeChecksum.layer` and `BunChecksum.layer` state the
checksum of their runtime. `NodeCompression.compress`, `NodeCompression.decompress`,
`NodeChecksum.of` and `BunChecksum.of` read the same frames and the same numbers as before.
