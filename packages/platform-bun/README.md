# @trajs/platform-bun

The implementations of [`@trajs/utils`](../utils)'s services that a program on
Bun runs with.

- `BunCompression` — a frame `Bun.zstdCompress` and `Bun.zstdDecompress` write
  and read one with.
- `BunServices` — the compression and the BLAKE3 digest `@trajs/platform-node`
  reads through the Rust binding, as one layer provided beside the storage where
  a program on Bun keeps a recording.

Bun states no BLAKE3 of its own, so this package stands on
[`@trajs/platform-node`](../platform-node) for the digest the way
`@effect/platform-bun` stands on `@effect/platform-node`. Its own modules import
each other relatively rather than through the `imports` field's `#/*`: Bun
resolves that field's exact keys but not its wildcards, so the package could not
be loaded from source otherwise.
