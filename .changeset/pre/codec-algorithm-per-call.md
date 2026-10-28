---
"@trajs/core": minor
"@trajs/platform-browser": minor
"@trajs/platform-bun": minor
"@trajs/platform-node": minor
"@trajs/utils": minor
---

A compression and a hash no longer state the algorithm they carry or digest with.
`Compression.algorithm` and `StreamHash.algorithm` are removed. `Compression.compress`,
`Compression.decompress` and `StreamHash.digest` take the algorithm as the option of
the call (`Compression.Options`, `StreamHash.Options`). One service writes, reads and
digests with every algorithm its platform states.
`NodeCompression.layer`, `BunCompression.layer`, `BrowserCompression.layer`,
`NodeStreamHash.layer`, `BrowserStreamHash.layer`, `StreamHash.layer` and
`StreamHash.make` take no algorithm. `Options` is removed from `NodeServices`,
`BunServices` and `BrowserServices`, and their `layer` is a constant layer.

`Exchange.save` takes an `Exchange.SaveOptions`, the options of the compression and
of the hash used for the write. It records both algorithms in the metadata it writes.
`Exchange.load` reads a frame back in the algorithm of the metadata, not the
algorithm of the compression. A trajectory written in gzip, deflate or no frame at
all loads through a compression provided with no option.
