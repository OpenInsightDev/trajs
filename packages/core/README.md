# @trajs/core

The trajectory model every other package reads and writes: the parts a run is
recorded as, the config that says which kits decode them, and the layers that
produce, cache, and exchange them.

A trajectory is one stream of parts — a session declaration, a prompt, the parts of
a response, an event, a metric report — and a `Config` says what those parts carry:
the tools they can call, the events they can state, the metrics derived from them,
and the extra fields a producer attaches. One config is shared by production,
storage, and every read, so a trajectory written by one program is read by another
without a conversion step.

## Modules

- `Trajectory` — the configured part schemas, the builders that make a part, and
  the named streams a trajectory is read as.
- `Produce` — live writers (`Produce.produce`), constructors over existing message
  streams (`Produce.fromSession`, `Produce.fromSessions`), and metric enrichment
  of a recorded trajectory (`Produce.produceMetrics`).
- `Session` — the validated session tree a trajectory holds: forks, inherited
  prefixes, and per-session streams.
- `View` — conversation-oriented reads: prompts, response parts, tool turns, and
  steps.
- `Cache` — a replayable reading of a trajectory, keeping the newest parts in
  memory and spilling the rest to a `ByteStore`; `Cache.layer` is the in-memory
  layer and `Cache.layerFsTemp` spills to a temporary directory.
- `Exchange` — the stored form: a JSON header, a compressed and hashed binary part
  frame, and a JSON metadata tail, inspected, loaded, and saved through `Storage`.
  `Loaded.validate` checks that frame and digest before the parts are read.
- `ExchangeIssue` — why a stored trajectory fails `Loaded.validate`: a frame that
  does not decompress or decode, a frame that ends early, or a digest that does
  not match the parts.
- `Config` — the kit record, the services a config needs to encode or decode, and
  the kits a trajectory declares.
- `Tool` and `Toolkit` — tool declarations, handlers, and the toolkit a trajectory
  names.
- `PackageMetadata` — what a `package.json` states about the package itself,
  which event, metric, and extra declarations state as their `packageMetadata`.
- `Event` and `EventKit` — versioned event declarations and their collections.
- `Metric` and `MetricKit` — metric reports, producers over trajectory parts, and
  their collections.
- `Extra` and `ExtraKit` — versioned extra fields for prompt, response, and session
  parts.
- `VersionedSchema` and `TrajectoryError` — versioned payload encoding and the
  structured failures reads raise.
- `@trajs/core/codec` — a trajectory read as the conversations the Anthropic
  Messages API and OpenAI-compatible chat APIs take.
- `@trajs/core/unstable/atif` — an ATIF document read as a trajectory, and a
  trajectory read back as ATIF steps.
- `@trajs/core/unstable/otel` — the OpenTelemetry GenAI and MCP semantic
  conventions as Effect schemas.
- `@trajs/core/unstable/Indexing` — experimental index declarations over
  configured trajectory parts.

The byte, storage, compression, and hashing services `Exchange` is built over are
re-exported from [`@trajs/utils`](../utils), so a program reads them from this
package.

## Usage

```ts
import {
  Cache,
  Config,
  EventKit,
  ExtraKit,
  MetricKit,
  Produce,
  Prompt,
  Session,
  Toolkit,
  Trajectory,
} from "@trajs/core";
import { Effect, Stream } from "effect";

const config = Config.config({
  toolkit: Toolkit.empty,
  eventkit: EventKit.empty,
  metrickit: MetricKit.toProducers(MetricKit.empty, {}),
  extrakit: ExtraKit.empty,
});

const parts = Trajectory.parts(config);
const trajectory = Stream.make(parts.prompt(Prompt.make("What is a trajectory?"))).pipe(
  Produce.fromSession(config),
);

const root = await Session.main(trajectory).pipe(Effect.provide(Cache.layer()), Effect.runPromise);
```

## Development

The package is developed from `packages/core`: `vp check` formats, lints, and type
checks it, `vp test` runs its tests, and `vp run build` writes `dist`.
