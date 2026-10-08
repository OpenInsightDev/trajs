---
"@trajs/core": minor
---

Add sessions and session derivation. A `SessionPart` declares a session and,
optionally, the part of another session it continues from through `fork`, so a
recording can interleave several sessions and express a fork, a resumed session
or a spawned sub-agent. The new `Session` module reads them as streams:
`Session.of` streams a session together with what it inherited, `Session.select`
its own parts, and `Session.parent` and `Session.children` walk the derivation
edges.

Also give every part its own identifier: the default `uuid` was computed once at
module load, so parts that did not set one shared it.
