---
"@trajs/core": minor
---

A cache fails with its own `CacheError` where its byte store could not read or write a
part, rather than exposing the `ByteStoreError` of `@trajs/utils` as part of its public
type. `CacheError` names the trajectory, the part's index and whether the part was being
read or written, and keeps what the store failed with as its cause.
