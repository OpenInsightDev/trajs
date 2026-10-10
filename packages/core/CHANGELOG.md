# @trajs/core

## 0.1.0

### Minor Changes

- [`c2f3442`](https://github.com/OpenInsightDev/trajs/commit/c2f344248f219f33111314ba65c67d9ce9e2062a) Thanks [@observerw](https://github.com/observerw)! - Add `Codec`, which also writes a recording as the conversations of Anthropic's
  Messages API. `Codec.makeMessages` runs the trajectory, groups its parts by the
  `session` they carry exactly as `Codec.makeChatCompletion` does, and then writes
  each session in the request shape of `@effect/ai-anthropic`: the system messages
  are hoisted into the top-level `system` field, consecutive turns of a role are
  merged, and a tool result is carried in the user turn that follows its call. The
  result is keyed by session and typed as `AnthropicSessions`, so a recording can
  be replayed or evaluated with an Anthropic model. The conversion mirrors the
  request building of the SDK's Anthropic language model and is lossy where the
  Messages API has no equivalent, so reasoning, a provider-executed tool call or
  result, a tool approval part, and a file that is neither an image nor a PDF or
  plain text are dropped.
  
  `@effect/ai-anthropic` is added to the workspace catalog and to the dependencies
  of `@trajs/core`.

- [`ada5c9a`](https://github.com/OpenInsightDev/trajs/commit/ada5c9aebe0871cf8251b64d5bfe25ebe680aa28) Thanks [@observerw](https://github.com/observerw)! - Add `Codec`, which writes a recording as the messages a chat completions endpoint
  accepts. `Codec.makeChatCompletion` runs the trajectory, groups its parts by the
  `session` they carry, and folds each group with `Trajectory.prompt`, so a prompt
  contributes the messages the model was given and the responses that follow it
  contribute the messages it returned; parts with no `session` are grouped under
  the empty string. The result is keyed by session and typed as the chat
  completions request messages of `@effect/ai-openai-compat`, so a recording can be
  replayed or evaluated with any OpenAI-compatible model. The conversion is lossy
  where chat completions has no equivalent: reasoning, non-image file and tool
  approval parts are dropped, and a provider-executed tool result is written as its
  own `tool` message.

- [`b478d8f`](https://github.com/OpenInsightDev/trajs/commit/b478d8f5086cfc0b3c75e82e6e14e28d26d2108a) Thanks [@observerw](https://github.com/observerw)! - Add the extension API: an extension is an identifier, descriptive metadata and a
  line of versions of its data. `Extension.make` declares the oldest version,
  `Extension.upgrade` derives the next one, and `Extensionkit` collects extensions
  into the identifier to extension map a recording is read with. A trajectory
  carries that map as its `extkit` field, typed the way `toolkit` is, and
  `Trajectory.ExtensionPart` reads the data of each extension through the
  extension's own line of versions, so data recorded against an older version is
  read as the newest one.
  
  `Trajectory.make` and `Trajectory.Part` take the kit, so they are called as
  `Trajectory.make(parts, toolkit, extkit, metadata?)` and `Part(toolkit, extkit)`.
  `Persist.encode` writes extension parts with the trajectory's own kit.
  
  `Trajectory.Uuid` and `Trajectory.Timestamp` are no longer exported, and
  `Versions.upTo` is gone: a version reads its whole line and encodes its own
  value, so no separate reader has to be asked for.
  
  Data recorded for an extension the kit does not hold, or whose shape no version
  of its line accepts, is carried as `Extensionkit.AnyPart` instead of failing the
  recording: `Extensionkit.PartView` reads both kinds, and
  `Extensionkit.isAnyPart` tells them apart.

- [`9b59157`](https://github.com/OpenInsightDev/trajs/commit/9b59157449827c40990a15ad44dcaba9f58001e6) Thanks [@observerw](https://github.com/observerw)! - An extension part no longer carries a `session`. A session is made of the
  trajectory data of a recording, so `session` is a field of the message parts:
  `PromptPart`, `ResponsePart` and `StreamResponsePart` carry the optional session
  they were recorded under, and `SessionPart` the one it declares. `attach` already
  anchors what an extension records to the parts it is about, so the session an
  extension part belongs to is read from them: `Trajectory.PartMetadata` is left
  with the fields every part carries, its `uuid` and optional `extra`, and a
  recording that gave an extension part a session of its own reads it as carrying
  none.
  
  `Session.select` and `Session.of` therefore read the session each part belongs
  to — the `session` a message part carries, or the session of the parts an
  extension part is attached to — so the data an extension recorded about a
  session's parts is selected and streamed with them. The grouping of
  `Codec.makeChatCompletion` and `Codec.makeMessages` follows the message parts
  instead, because extension data carries no messages: a recording that holds
  extension data alone is written with no session rather than with an empty one.

- [`3e3bf0e`](https://github.com/OpenInsightDev/trajs/commit/3e3bf0ef984b6e27f71c9782369dd7c203342446) Thanks [@observerw](https://github.com/observerw)! - `Extension.Producer` states what writes an extension's data, apart from the
  extension itself. A producer reads the messages of a trajectory as a stream and
  writes a stream of `Extension.ProducerOutput` — the value of the extension's
  newest version, anchored to the parts it is about — so data that is derived from a
  recording has somewhere to be written without becoming a field of the format it
  is recorded as. The services a producer takes are the requirements its extension
  declares, so what producing the data needs travels with the format rather than
  with every caller of a producer, and the failures it raises are its own.
  
  `Extensionkit.withProducers` attaches one producer to every extension of a set,
  keyed by the identifier of the extension, and returns a `ProducedKit`: a set whose
  every extension is paired with its producer, each pair a `Produced`. A producer that
  is missing, one given for an identifier the set does not hold, one written for
  another extension's data, and one that takes a service its extension does not
  declare are rejected where the set is built rather than once a recording is read.
  Nothing is checked at runtime, as nothing about the requirements of an extension
  is.
  
  Running the producers of a set over a trajectory, and recording what they write,
  is not part of this change: `Producer` is the contract and `withProducers` the
  pairing, and the step between them is still to come.

- [`770e141`](https://github.com/OpenInsightDev/trajs/commit/770e141e4772ad0efc34325fdd5bf89f93c65c20) Thanks [@observerw](https://github.com/observerw)! - `Extension` now declares the services a producer of its data needs, the way `Tool`
  declares the services its handler needs. `Extension.make` takes a `dependencies`
  option, `Extension.Requirements<Ext>` reads what an extension declares, and
  `extension.addDependency(tag)` adds one more service to it.
  
  The requirements are phantom: no field of an extension depends on them and
  nothing reads them at runtime, so an extension is still the identifier, metadata
  and line of versions it was built from, and data already recorded for it is
  unaffected. They are covariant, so an extension that declares none is usable
  where one that declares some is expected.
  
  `Extension.upgrade` carries the declared services into the derived version, and
  `Extension.Any` reads them as unknown, so any extension is one.

- [`6d94f2f`](https://github.com/OpenInsightDev/trajs/commit/6d94f2f02dea8cce71f1d1dcd805403b4e6fa36e) Thanks [@observerw](https://github.com/observerw)! - `Extensionkit` now collects the extensions themselves, keyed by identifier, the
  way a toolkit collects its tools: an entry is the `Extension`, not its line of
  versions, so a set names the extension a datum came from and carries its
  descriptive metadata. The generic parameter of `Extensionkit`, `Trajectory`,
  `Trajectory.Part`, `Trajectory.PartStream` and the functions that take them is
  the record of extensions rather than the kit type, so
  `Exts extends Record<string, Extension.Any>` parallels
  `Tools extends Record<string, Tool.Any>`; it is no longer defaulted to the
  unknown set.
  
  `Toolkit.toolkits` now preserves the trajectory's extension kit: it takes
  `Trajectory<Tools, Exts, E, R>` and returns the merged tools with the same
  `Exts`, instead of erasing the extensions to the unknown set. Like
  `Extensionkit.extkits`, it rebuilds only the parts its own collection describes
  and carries the parts of every other kind over unchanged.
  
  `Toolkit.toolkits` and `Extensionkit.extkits` are no longer effectful: they take
  a trajectory and return the bound one, so a recording is rebound with
  `toolkits(weather)(recorded)` instead of
  `yield* toolkits(weather)(recorded)`. A schema failure is still reported as a
  `TrajectoryError`, from the returned trajectory's stream.
  
  `TrajectoryError`'s schema failures are named after the collection they come
  from: `TrajectoryError.encode` and `TrajectoryError.decode` are now
  `TrajectoryError.encodeTool` and `TrajectoryError.decodeTool`, next to
  `encodeExtension` and `decodeExtension`.

- [`2ae404a`](https://github.com/OpenInsightDev/trajs/commit/2ae404af9309a3d06e9d47eecdc0097287d1d200) Thanks [@observerw](https://github.com/observerw)! - Add `Extensionkit.encode`, which serializes an extension kit the way `Toolkit.encode`
  serializes a toolkit: each extension contributes the draft-07 JSON Schema document
  of its line of versions and its descriptive name and description, keyed by its
  identifier, so the data formats a recording
  carries can be stored or described without the Effect Schemas the lines were built
  from. The document describes the whole line, so data recorded against an older
  version is described too.
  
  `Persist.encode` writes that kit into the `.trajs` header as its `extkit` field,
  next to the serialized `toolkit`. Like the toolkit, the header's kit is accepted
  but not held by the decoded trajectory, so extension parts are read unconstrained
  until they are bound with `Extensionkit.extkits`.

- [`f7a4412`](https://github.com/OpenInsightDev/trajs/commit/f7a441228eb341df8f867f293c904319bba36e09) Thanks [@observerw](https://github.com/observerw)! - Add `Extensionkit.extkits`, which binds a recorded trajectory to the extension
  kits it is read with: every extension part is encoded with the trajectory's own
  kit and decoded again with the merged one, so data recorded for an extension that
  was unknown, or for an older version of it, regains the types of the extension's
  newest version. Data no extension matches stays `Extensionkit.AnyPart`, the parts
  of other kinds, the toolkit and the metadata are carried over, and a schema
  failure is reported as a `TrajectoryError` carrying the kit it happened with.
  
  `Extensionkit.Merged` now keeps the identifiers of every kit it is given rather
  than only the ones they share, so `Extensionkit.merge` and `extkits` type the set
  they produce by all of its identifiers.
  
  `TrajectoryError`'s schema failures are renamed to say which collection they come
  from: `EncodeError` and `DecodeError` are now `ToolEncodeError` and
  `ToolDecodeError`, and `ExtensionEncodeError` and `ExtensionDecodeError` join them
  for extension kits.

- [`41489e3`](https://github.com/OpenInsightDev/trajs/commit/41489e3dfa8b3484a877a92cfdd08957bb2e6f51) Thanks [@observerw](https://github.com/observerw)! - Make `Trajectory.make` construct an unbound trajectory. It no longer takes a
  toolkit and an extension kit: it attaches the metadata to the parts and leaves
  the toolkit empty and the extension kit unheld, so the returned trajectory takes
  the parts in their tolerant form. Bind the recording to the tools and extensions
  it refers to with `Toolkit.toolkits` and `Extensionkit.extkits` when its parts
  should carry their types.

- [`7d7d0b7`](https://github.com/OpenInsightDev/trajs/commit/7d7d0b7d97d8978b7d200855ef113840a907bef5) Thanks [@observerw](https://github.com/observerw)! - Split the trajectory part model into message parts and extension parts. A part is
  either the trajectory data of a recording — `Trajectory.MessagePart(toolkit)`,
  the prompt part, the session part and the response parts the toolkit describes —
  or the data recorded for an extension about it
  (`Trajectory.ExtensionPart(extkit)`), so `Trajectory.Part(toolkit, extkit)` and
  the types it yields are composed of the two: `Trajectory.Part<Tools, Exts>` is
  now `MessagePart<Tools> | ExtensionPart<Exts>` and `Trajectory.AnyPart` is
  `AnyMessagePart | AnyExtensionPart`.
  
  `Trajectory.MessageStream` and `Trajectory.AnyMessageStream` are the streams of
  those message parts and `Trajectory.MessagePartEncoded` their encoded form.
  `Trajectory.messages` streams the message parts of a recording in the order they
  were recorded, dropping the extension data recorded alongside them.

- [`0da2ad8`](https://github.com/OpenInsightDev/trajs/commit/0da2ad8c4172e03d5461a2f07cd1b030b3e983e1) Thanks [@observerw](https://github.com/observerw)! - Add `Trajectory.mapMetadata`, which updates the metadata of a trajectory by
  applying a function to it. The function receives the trajectory's `Metadata` and
  returns the metadata the new trajectory carries, so a field it does not carry
  over is dropped rather than merged. The parts, the toolkit and the extension kit
  are shared with the trajectory it was given, which is left unchanged, and the
  update is available both directly and piped.

- [`0f6cb44`](https://github.com/OpenInsightDev/trajs/commit/0f6cb44ff1c6a5eacb33611a3634fcaa2eaf1acb) Thanks [@observerw](https://github.com/observerw)! - Move the specification version into the trajectory metadata. `Metadata` loses its
  `id` (a trajectory identity the model never gave uniqueness or resolution
  semantics) and gains a required `version`: the version of `@trajs/core` that wrote
  the recording, read from the package manifest as the new `Trajectory.version`
  constant and defaulted to it when a trajectory is constructed. A `.trajs` header
  no longer carries a `version` field of its own, and its `metadata` is required, so
  `Persist` refuses to decode a recording that does not state the version it was
  written against.

- [`9a8548a`](https://github.com/OpenInsightDev/trajs/commit/9a8548ad4eeac51f3c70df8142d41956b4f5219b) Thanks [@observerw](https://github.com/observerw)! - Remove the extension API: the `Extension` and `Extensionkit` modules, the
  `ExtensionPart` and `AnyExtensionPart` trajectory parts, the `extensions` field on
  a trajectory and in the `.trajs` header, the extension errors, and the `extensions`
  parameter of `Trajectory.Part` and `Trajectory.make`. `Persist.decode` and
  `Persist.read` no longer take extension definitions, so `Persist.decode(records)`
  and `Persist.read(key)` read a stream or a key directly.

- [`aed956c`](https://github.com/OpenInsightDev/trajs/commit/aed956c8eea2587740b376d3c4e7e6f30085b152) Thanks [@observerw](https://github.com/observerw)! - Add `Session.all`, which reads every session a recording holds as a trajectory of
  its own. The whole recording is consumed once and returned as a record keyed by
  the session identifiers, each entry holding the session together with what it
  inherited — the parts of each ancestor up to the part the next session is forked
  from, then the session's own, as `Session.of` streams them — so a session shares
  what it read with the one it forked from. An entry is bound to the recording it
  was read from — it carries the toolkit, the metadata and the extension kit of that
  trajectory, and its parts are held in memory — so a session can be consumed more
  than once.

- [`a2640d7`](https://github.com/OpenInsightDev/trajs/commit/a2640d71a81f00c30dd5da85396fbdae0aa996de) Thanks [@observerw](https://github.com/observerw)! - Add sessions and session derivation. A `SessionPart` declares a session and,
  optionally, the part of another session it continues from through `fork`, so a
  recording can interleave several sessions and express a fork, a resumed session
  or a spawned sub-agent. The new `Session` module reads them as streams:
  `Session.of` streams a session together with what it inherited, `Session.select`
  its own parts, and `Session.parent` and `Session.children` walk the derivation
  edges.
  
  Also give every part its own identifier: the default `uuid` was computed once at
  module load, so parts that did not set one shared it.

- [`e913c0a`](https://github.com/OpenInsightDev/trajs/commit/e913c0ab92e590e5da126b434daadd4cb33633e2) Thanks [@observerw](https://github.com/observerw)! - Add a stream trajectory, which records a response as the increments a model
  streamed it in, and `Trajectory.fold`, which collapses one into the trajectory
  `Trajectory.ResponsePart` records.
  
  `Trajectory.StreamResponsePart(toolkit)` is the response part of a recording of
  streamed parts: it carries one part of `Response.AllParts` — the start, a delta
  or the end of a chunk of text or reasoning, a tool call or its result — as
  `Response.AllPartsView`, so it tolerates tools outside the toolkit exactly as
  `Trajectory.ResponsePart` does. `StreamMessagePart`, `StreamPart`,
  `StreamResponsePartEncoded` and the tolerant `AnyStreamResponsePart`,
  `AnyStreamMessagePart`, `AnyStreamPart` and `AnyStreamTrajectory` are the rest of
  the part model at that granularity, and `Trajectory.makeStream` attaches the
  metadata, toolkit and extension kit to a stream of those parts as
  `Trajectory.make` does for a folded recording.
  
  `Trajectory.fold` converges the increments of a chunk by the identifier the part
  protocol gives them and by the session they were recorded under, so the chunks of
  interleaved sessions stay apart, and emits one `text` or `reasoning` part per
  chunk when it ends, with the metadata of its parts merged. The part it emits
  keeps the envelope — session, timestamp and identifier — of the part that ended
  the chunk. A part of a tool call's parameters or a model-reported error is
  dropped, because neither has a folded form to be recorded in, and a chunk the
  stream never ends is not emitted.

- [`4515f85`](https://github.com/OpenInsightDev/trajs/commit/4515f85fa9603a3104fafb2ecad83f037ab16748) Thanks [@observerw](https://github.com/observerw)! - Add `Trajectory.empty`, which constructs a trajectory that holds no parts. It is
  the trajectory `Trajectory.make` returns for an empty stream: it carries the
  metadata it is given, defaulting to `Metadata` with no name and no description,
  and holds no toolkit and no extension kit, so it is bound with
  `Toolkit.toolkits` and `Extensionkit.extkits` like any other recording.

- [`2edd6a0`](https://github.com/OpenInsightDev/trajs/commit/2edd6a05e1e00b6122cee93332f9c7183a1d3353) Thanks [@observerw](https://github.com/observerw)! - Add `Trajectory.prompt`, which folds a recording back into the prompt its model
  was given: the messages of every turn, concatenated with the response parts
  recorded for them, in order. A prompt part opens a turn and the response parts
  that follow it belong to it; session parts are skipped, and response parts that
  no prompt precedes are dropped. Parts are not attributed to a
  session, so a recording that interleaves several is selected with `Session.of` or
  `Session.select` before it is folded.

- [`4a8d1a9`](https://github.com/OpenInsightDev/trajs/commit/4a8d1a99b0c61e810f6a8adfdbb16275ecdc6a5f) Thanks [@observerw](https://github.com/observerw)! - Move the trajectory prompt views into a new `View` module. `Trajectory.prompt`
  becomes `View.prompt`, and the turn view it is folded from is exported as
  `View.promptTurns`, returning `View.PromptTurn`. `Trajectory` now holds the part
  model only.

### Patch Changes

- [`798a3bd`](https://github.com/OpenInsightDev/trajs/commit/798a3bd8017986233a2c97369659b0eac0710161) Thanks [@observerw](https://github.com/observerw)! - Build a line of versions recursively. `Versions.upgrade` wrapped every member of the
  version before it, so a version held one reader per version below it and a line of
  N versions held N(N+1)/2 readers; it now wraps the whole reader of the version
  before it in one step, so a version holds two readers and a line of N versions
  holds O(N). Reading every version up to the newest into the newest value, and
  encoding only the newest, are unchanged, and `Versions.across` still reads two
  lines at once.
  
  The `Upgrade` type is replaced by `Step`. A document whose `version` matches no
  version of the line is now reported against the innermost versions rather than all
  of them, because `Schema.Union` cannot see through the nested step when it picks
  candidates.
