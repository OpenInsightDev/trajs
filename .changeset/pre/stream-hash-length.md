---
"@trajs/utils": minor
"@trajs/platform-node": minor
"@trajs/platform-bun": minor
"@trajs/platform-browser": minor
---

`StreamHash.Options` takes a `length`, the digest bytes a call reads. It is stated
in either form, `StreamHash.digest` and `StreamHash.start`, and from 1 to the
bytes of the algorithm: SHA-256 reads 32 bytes, BLAKE2b-512 64, and XXH64 8.

A `length` below the bytes of the algorithm cuts the digest to its leading bytes,
so a call that states `length: 8` of SHA-256 reads the first 8 bytes of the same
digest, as 16 hex characters. A `length` beyond the algorithm raises a
`RangeError` when the call is made, because no digest of that length exists.

`StreamHash.make` builds the service from a `StreamHash.Codec`, which states the
running digest of each algorithm and nothing of the options. The options and the
digest bytes are resolved there, the digest is cut, and it is read as hex, so
`NodeStreamHash.layer`, `BunStreamHash.layer` and `BrowserStreamHash.layer` state
a running digest per algorithm only.

A stored trajectory records the algorithm of its digest, not the `length` of the
call that wrote it, so `Exchange.SaveOptions` digests the whole bytes of its
algorithm.

`BrowserStreamHash.layer` reads SHA-256 with `@noble/hashes` in both forms, where
it read the stream form with WebCrypto. A page therefore needs no secure context
to read a digest, and no stream is held whole to be digested.
