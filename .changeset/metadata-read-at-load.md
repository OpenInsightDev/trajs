---
"@trajs/core": minor
---

`Loaded.metadata` is the metadata a trajectory ends with, read while the trajectory
is loaded, rather than an effect that reads it off the tail when run — so it sits
beside `Loaded.header`, which a load reads off the head the same way. A load
therefore reads what a trajectory states of itself at either end of its bytes and
still never reads the frame the parts are carried in.

Bytes that do not end with the metadata now fail the load itself rather than the
operation that asked for the metadata, as bytes whose head is not a header already
did.
