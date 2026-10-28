---
"@trajs/core": minor
---

`Exchange.Loaded` gains `validate`. It reads a stored part frame once and reports
why it is not a complete trajectory: a frame the recorded compression does not
decompress, a part the config does not decode, a frame that ends in the middle of
a part, or a digest that does not match the parts. Several reasons are reported
together as one issue.

The reasons are `ExchangeIssue.Issue`: `ExchangeIssue.CompressionFailure`,
`ExchangeIssue.UndecodablePart`, `ExchangeIssue.TruncatedFrame`,
`ExchangeIssue.DigestMismatch` and `ExchangeIssue.Composite`, each naming the
failure and rendering a message. The module is exported as
`@trajs/core/ExchangeIssue` and as the `ExchangeIssue` namespace of the package.

`Exchange.load` still reads header and metadata without verifying the part digest,
and its parts still skip a frame the config does not decode. `Loaded.validate` is
the check for both.
