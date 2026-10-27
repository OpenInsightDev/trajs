# Caching a trajectory you can read once

A `Trajectory` is a `Stream`, and it is read from its start. Read the same one
twice and the source runs twice: twice the work, and nothing at all where the
source cannot run again — a live run, a handle already consumed.

Plenty of code wants the same trajectory more than once. `Session.main` scans a
run for session declarations, scans again to resolve the forks they name, and then
hands you per-session streams over the same parts. `Cache` reads the source once,
keeps what it read, and gives back a trajectory that can be read as often as you
like.

```ts
const main = Effect.gen(function* () {
  const cache = yield* Cache.Cache;

  const cached = yield* cache.cache(trajectory);

  const once = yield* Stream.runCollect(cached); // reads the source
  const again = yield* Stream.runCollect(cached); // the same parts, source not read again
});
```

The effect drains the source to its end before it returns, so what comes back is
a finite run of parts already in hand. `cached.length` is how many, `cached.at(3)`
is the fourth one (or `none`, past the end), and the trajectory itself replays all
of them in order. `Cached` is a `Trajectory` with those two fields added: same
`id`, same config, so it goes wherever a trajectory goes, including into
`Session.main` and `View.metricTrajectory`.

Where the parts that leave memory go is the layer's decision:

```ts
Effect.provide(Cache.layer({ capacity: 1_000 })); // in memory
Effect.provide(Cache.layerFsTemp("trajs-", { capacity: 1_000 })); // a temporary directory
Effect.provide(Cache.layerKVStore({ capacity: 1_000 })); // the ByteStore you provide
```

`Cache.layerFsTemp` makes a directory when the layer is built and removes it when
the layer's scope closes. `Cache.layerKVStore` uses the `ByteStore` in context,
so a program that already keeps its bytes somewhere hands that store over.
`Cache.make(store, options)` is the same thing with a store you hold yourself.

`cache.cache` fails with the source's own errors, with `CacheError` where the
store cannot read or write a part (it names the trajectory id, the part index,
and the direction), and with `TrajectoryError` where a part does not encode or
decode under the config.

## The window

`capacity` counts the newest parts kept in memory _as parts_, not bytes. Parts
older than that are encoded and written to the store. Omitted, `"unbounded"`, or
`NaN` keeps everything and writes nothing; a number is rounded down and clamped
at zero, so `0` spills every part and keeps none.

Parts leave the window as newer ones arrive, so the memory holds the end of the
run and the store holds its beginning. A replay reads the stored prefix through
the store, then emits the window.

## What one part costs

Each part is written as a sequence of its own, keyed `<id>/<index>`, holding that
part encoded with the trajectory's own schemas — the same bytes the exchange
format writes, before compression, with no header and no metadata around them.

- **In the store**: one key per part (plus the store's own record beside it), so
  a run of ten thousand parts is twenty thousand keys, not one blob. A `ByteStore`
  clears an id before writing it, so spilling a fresh part is a record read, a
  probe for chunks already there, the chunk write, and the record write. On a store
  over a file system that is two file reads and two file writes per part.
- **In memory**: the window holds the parts themselves, the plain objects a reading
  uses. The store holds encoded bytes, and a replay decodes them back.
- **On the clock**: one pass over the source, and after that a store read plus a
  decode for every spilled part on every replay. A part in the window replays with
  neither, and a part read on its own through `at` costs that one read rather than
  the rest of the run. `capacity` is the dial between memory held and work redone.

Nothing is evicted. Entries stay until the store goes away — with
`Cache.layerFsTemp`, until the layer's scope closes — so a pool grows with every
trajectory put in it, and a long-lived `layerKVStore` over a database needs
cleaning up by the program that owns it.

`Cache.layer()` alone saves less than it looks like it does. A finite capacity
moves older parts out of the decoded array and into encoded chunks held by the
in-memory key/value store, which is still this process's memory. To keep a run
from sitting in RAM at all, the store has to be off-process: `layerFsTemp`, or a
store you provide.

## One id, one trajectory

The pool is a map from id to reading, and the id is all it looks at. Asking for
`cache.cache(x)` where `x.id` is already in the pool returns the earlier reading:
`x` is not read, and its parts are never compared with the ones held. That is
what makes repeated calls cheap, and it is also where the two obligations on the
caller come from — both of which fail silently when you miss them:

- **An id must always name the same parts.** Two different runs under `"run-1"`
  raise nothing; the second is answered with the first, so you read the wrong run,
  labelled with the id you asked for.
- **An id must always be read with the same config.** What is stored was encoded
  with one `toolkit`, `eventkit`, `metrickit`, and `extrakit`, and what comes back
  is decoded with the same four. A second trajectory sharing the id but swapping
  the toolkit is still answered with the first trajectory's parts, and the type
  says otherwise.

So an id is a promise, and the safest id is one you cannot repeat:
`Trajectory.make(config)` assigns a fresh uuid. Use `Trajectory.make(id, config)`
when a run already has an id, and make sure that id names that run alone. A
`Cache` service instance is one pool — a `layer` given to a program is shared by
everything in it.

The rest of the contract:

- a reading that fails is dropped from the pool, so the next call reads the
  source again rather than replaying the failure;
- an infinite source never returns a cached trajectory;
- replaying a spilled part reads the store, so the store has to outlive the
  reading;
- `at` takes an integer; a negative index or one past the end is `none`.

## Why it takes a trajectory, not a stream

`cache.cache` takes a `Trajectory`, not a `TrajectoryStream` — the same stream of
parts before an id and the config's fields are attached to the value — and both
of those attachments are the reason:

- **the id is the key.** Parts are stored under `<id>/<index>` and a repeated
  call is looked up by id. A bare stream names nothing, so there would be nothing
  to store under and nothing to find again.
- **the config is the codec.** What gets written is the part schema of the
  trajectory's kits, and what gets replayed is decoded with that same schema. A
  stream of parts does not say what those parts are, so there is no schema to write
  them with or read them back with.

Both attachments come from binding first: `Trajectory.make(id, config)(stream)`,
then cache the result. `TrajectoryStream` is what you have before that, and it is
what the cache cannot take.

## When one pass is not enough

`Session.main` cannot be written without a cache. It reads the trajectory to find
the session declarations, reads it a second time to resolve the forks they name,
and every stream it returns filters the same parts — and those streams are
consumed after it has returned, some of them several times over as a session
replay walks its inherited prefixes. That is already more readings than a source
that can be read once has to give. It is why `Session.main` carries `Cache.Cache`
in its environment: `Cache.layer()` is the smallest thing you can provide for it.

`View.metricTrajectory` is the second case in this package. A report arrives
after the part it names, so the view has to read the run to its end before it can
emit the first part annotated with that report.

The general shape is an analysis that answers several questions from one run and
stays a stream — usage per session, calls per tool, characters per metric. Each
question is a pass, and passes read the same parts. The alternative is a single
fold that answers all of them at once, which couples the questions to each other
and to the order they happen to be asked in. If one pass really does answer your
question, one pass is cheaper: a cache reads everything before its first part
comes out, so a long or still-running source gives you nothing for a while.

## The case

Two turns of weather questions, four parts: prompt, reply, prompt, reply. `main`
caches the run with a window of two, reads the whole thing twice, asks for the
fourth part by index and for one past the end, and then puts a second trajectory
under the same id.

- `length` is 4, and the source emits 4 parts: read twice, pulled once. The same
  two readings of an uncached source pull it twice, and where the source is
  one-shot the second reading does not exist.
- both readings replay `Prompt, Response, Prompt, Response` — the same parts in
  the same order, both times.
- `at(3)` is `"It is raining."`, the second reply; `at(4)` holds nothing, because
  the run has four parts.
- with a window of 2, the first two parts live in the store and the last two in
  memory, so both readings read and decode the head and replay the tail.
- the second trajectory emits 0 parts and comes back as the first 4-part reading.
  It is not read at all: the id was taken, and the pool answered with what it
  already had.

```sh
vp test cache
```
