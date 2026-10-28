# @trajs/core

## 0.0.0-alpha.3

### Minor Changes

- [`8de6038`](https://github.com/trajs-ai/trajs/commit/8de60386eccdf99d6f78e5f1a4a050ea79213eba) Thanks [@observerw](https://github.com/observerw)! - A compression and a hash no longer state the algorithm they carry or digest with.
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

- [`3e3e067`](https://github.com/trajs-ai/trajs/commit/3e3e067f32cefa803c1319f19a8a6950602bdb10) Thanks [@observerw](https://github.com/observerw)! - A trajectory carries finished response parts and nothing else, so a config no longer
  states a response variant. `Config.stream`, the `Stream` type parameter of `Config`,
  `Config.NonStreamConfig` and `Config.UnknownConfig` are removed; `Config.anyConfig`
  no longer carries `stream: true`, and `Config.MergedConfig` no longer unions a
  variant.
  
  `Trajectory.ResponsePart` loses its third type parameter and is the finished
  `Response.Part` of the toolkit for every config. `Trajectory.Parts.response` takes
  such a part, `Trajectory.Part` reads one back, and `Trajectory.ResponsePartOf` is
  `ResponsePart<C["toolkit"], C["extrakit"]>`.
  
  `Response.PartView` is the view of a part a trajectory holds. `Response.AllPartsView`
  stays the view of the parts a response arrives in, which production folds.
  
  `Produce.MessageStream` carries finished parts, and `Produce.ProducingConfig` is the
  one config a production run states — the `stream: true` a run used to emit is gone
  with the flag.
  
  `Produce.ProduceSession.enqueueResponse` takes the parts a response arrives in and
  folds an answer that is still being written into the chunk it builds, so the
  trajectory holds the part that chunk ended in. It answers with the part it wrote,
  which is `Option.none` while the answer is still arriving. A chunk still open when the
  run ends is not written.
  
  `View.steps` no longer folds response increments, and `Metric` producers read
  finished parts directly rather than through a fold.

- [`12d903e`](https://github.com/trajs-ai/trajs/commit/12d903e5530ecbe3f82d88e7c727f4154683effd) Thanks [@observerw](https://github.com/observerw)! - `Exchange.Loaded` gains `validate`. It reads a stored part frame once and reports
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

- [`588a346`](https://github.com/trajs-ai/trajs/commit/588a346a760d1223dab6a806946d8deb2244dc11) Thanks [@observerw](https://github.com/observerw)! - `Event.EventSchema`, `Event.EventKitSchema`, `Metric.MetricSchema`,
  `Metric.MetricKitSchema`, `Extra.ExtraSchema`, and `Extra.ExtraKitSchema` state a
  declaration as a trajectory's header stores it: its metadata, the package it is
  in, and the JSON Schema documents of the schemas it declares. `Event.encode`,
  `Metric.encode`, and `Extra.encode` build those records from a kit, as
  `Toolkit.encode` already did.
  
  `Toolkit.JsonSchemaDocument`, `Toolkit.ToolSchema`, and `Toolkit.ToolkitSchema`
  are schemas as well as types, so a stored JSON Schema document is read as a
  `JsonSchemaDocument` rather than as unknown JSON.
  
  `Exchange.Header` states all four kits as those records. A header written by an
  earlier version states no schema documents for its events, metrics, and extras,
  so it no longer decodes.

- [`84d8f95`](https://github.com/trajs-ai/trajs/commit/84d8f9520baa5f6bc4772a69d41958367b412ad4) Thanks [@observerw](https://github.com/observerw)! - `PackageMetadata` states what a package says of itself in its `package.json`: the
  `version`, `description`, `keywords`, `homepage`, `license`, `author` and
  `repository` that identify the package and the repository it lives in. The other
  fields of the file are left out, the package's `name` among them, since a
  declaration already states it. `author` and `repository` accept the string form a
  `package.json` permits.
  
  An event, a metric, and an extra declaration accept that as their optional
  `packageMetadata`, beside the metadata each already states of itself, so what a
  trajectory states of a declaration names the release and the repository of the
  package that declared its data. A stored header records both for event, metric,
  and extra entries.
  
  The `package` field of an event, a metric, and an extra declaration is now
  `packageName`, since the package's own metadata sits beside it. `tag` still joins
  it with `id`.
  
  A declaration is written in the package whose `package.json` it states, so the
  fields are attached from that file rather than restated:
  `@trajs/extension-tokenize` states `packageMetadata: pkg` of the `package.json` it
  imports. `packageName` is written out as a literal rather than as `pkg.name`, so
  the tag keeps its literal type.

- [`aeb37a1`](https://github.com/trajs-ai/trajs/commit/aeb37a1f3aef831494199b135f1dc1084829b9b3) Thanks [@observerw](https://github.com/observerw)! - `Produce.MessageStream` accepts a response that is still arriving.
  `Produce.MessageResponsePart` is a response part holding either a finished part
  or one of the increments an answer arrives in, and `Produce.MessagePart` is one
  part a message stream supplies. `Produce.fromSession` and `Produce.fromSessions`
  fold the increments of an answer into the part the answer ends in, so a
  trajectory holds the part the chunk ended in and none of the increments. A chunk
  still open when the stream ends is not written. The types are declared in
  `Produce`, and `Trajectory` is unchanged.

- [`588a346`](https://github.com/trajs-ai/trajs/commit/588a346a760d1223dab6a806946d8deb2244dc11) Thanks [@observerw](https://github.com/observerw)! - `Toolkit.ToolEncoded` and `Toolkit.ToolkitEncoded` are `Toolkit.ToolSchema` and
  `Toolkit.ToolkitSchema`. Both state draft-07 JSON Schema documents, so the name
  follows the shape rather than `Toolkit.encode` producing it.
  
  `Toolkit.encode` still builds a `ToolkitSchema` from a toolkit.

### Patch Changes

- Updated dependencies [[`8de6038`](https://github.com/trajs-ai/trajs/commit/8de60386eccdf99d6f78e5f1a4a050ea79213eba)]:
  - @trajs/utils@0.0.0-alpha.3

## 0.0.0-alpha.2

### Minor Changes

- [`6c8f6cb`](https://github.com/trajs-ai/trajs/commit/6c8f6cb6aa7f65dd70f8fdeb09bfb103ec82c679) Thanks [@observerw](https://github.com/observerw)! - `View.metricTrajectory` reads its trajectory into `Cache.Cache` and hands every part the
  reports that name it, keyed by metric tag, rather than a stream per part. A part's
  `metrics` is now a `View.AttachedMetrics` record from a metric's tag to that metric's
  reports of the part, in trajectory order, so one metric's reports are read as
  `part.metrics[tag]` and their payloads narrow to that metric. A report may name a part
  that appears after it, and a part is consumed once with all of its reports.
  
  The function takes a `Trajectory` rather than a bare stream, because the cache reads it
  by id, returns an `Effect` of the view rather than the view, and requires `Cache.Cache`.
  Reading a trajectory now completes before the first part is emitted, so an infinite
  trajectory never emits.
  
  `Config.SchemaServices` states the requirement of an operation that both reads and
  writes parts: the union of `DecodingServices` and `EncodingServices`, where it was their
  intersection and dropped a side that was `never`. `Session.main` and
  `View.metricTrajectory` require it.

### Patch Changes

- Updated dependencies []:
  - @trajs/utils@0.0.0-alpha.2

## 0.0.0-alpha.1

### Patch Changes

- [`eb0faec`](https://github.com/trajs-ai/trajs/commit/eb0faec9944c344eabe9e32f19a7507b821e53ad) Thanks [@observerw](https://github.com/observerw)! - Release the core libraries under `packages/` as `0.0.0-alpha.1`. They are one
  Changesets `fixed` group and share that version: `@trajs/core`, `@trajs/olap`,
  `@trajs/platform-browser`, `@trajs/platform-bun`, `@trajs/platform-node` and
  `@trajs/utils`.
- Updated dependencies [[`eb0faec`](https://github.com/trajs-ai/trajs/commit/eb0faec9944c344eabe9e32f19a7507b821e53ad)]:
  - @trajs/utils@0.0.0-alpha.1
