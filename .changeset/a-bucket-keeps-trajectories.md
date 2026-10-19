---
"@trajs/utils": minor
---

Keep trajectories in a bucket: `Storage.layerS3` states a storage over an `S3Client`
of the AWS SDK, so a program that keeps its trajectories in S3 — or in a store that
speaks it — provides the same `Storage` service the file system storage provides.
A key is read as a range of the object it names, and a trajectory is written in
parts as it arrives rather than held whole, put as one object where it is short
enough to be one. `overwrite: false` is stated to the bucket, so an id another
writer reached first fails the write rather than being written over.

`@trajs/utils` now depends on `@aws-sdk/client-s3`. Its commands are read where
`layerS3` is built rather than where `@trajs/utils/Storage` is imported, so a
program that keeps its trajectories elsewhere carries no part of the SDK.
