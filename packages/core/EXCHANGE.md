# RFC 1 — The `.trajs` container format

- **Status:** accepted. Normative for the `Exchange` rewrite of `@trajs/core`.
- **Supersedes:** the JSON header, the binary part frame, and the JSON metadata
  tail (`Exchange.Header` as a JSON record, `Exchange.Metadata`, the one-frame
  part region).
- **Audience:** implementers of `Exchange`, and every program that reads or
  writes a stored trajectory.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are used as in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). "Raw" means before
compression, and a fixed-width integer is unsigned and little-endian.

## 1. Conventions

A trajectory is written by one process on one machine, read by any number of
processes, and never modified in place except at its tail. Every rule below is
stated against that one fact.

Offsets are byte offsets from the start of the file. A field that is not stated
as a size in another field has a fixed size given in its table.

## 2. Goals

The format exists to satisfy these properties. Each one is a MUST, and section
18 records what was rejected to keep them.

1. **Append-only.** A writer never changes a byte it has already written; it may
   only drop bytes from the tail, which sections 11.2 and 11.3 state. A file is
   therefore readable at every chunk boundary, including while it is being
   written and after the writer was killed.
2. **Identity without decompression.** Which parts a trajectory holds, in which
   session, attached to what, and at what time MUST be readable without
   decompressing anything. This is what `Session` and `View` need before they
   decode a single body.
3. **Compression in large units.** The compressed unit MUST be far larger than
   a part, because most parts of a recorded run are a few hundred bytes and a
   per-part codec frame costs more than it saves.
4. **Arithmetic random access.** In a sealed file, locating part N MUST be
   arithmetic over a table, not a scan of the file.
5. **One file.** Everything a reader needs is inside the file, with no sidecar
   index and no second write that completes it.
6. **Portability.** A file written by any platform package MUST be readable by
   every other one, over the codecs those packages already provide.

Non-goals: several writers to one file, resynchronisation after a corrupt block,
rotation, eviction, compaction, semantic locality inside a compression unit,
forward compatibility with meta variants a reader does not know, and
byte-identical output across platforms or codec levels.

## 3. Terms

| Term                         | Meaning                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| **chunk**                    | One compressed unit: some frames' identities with their contents compressed as one piece.    |
| **meta**                     | What a reader reads without decompressing: the tag, the identifiers, the timestamps.         |
| **body**                     | The part of a frame that is not meta, compressed together with the bodies of the same chunk. |
| **meta region, body region** | The two byte regions of a chunk holding every meta and every body it carries.                |
| **frame**                    | The pairing of one meta segment with one body segment. A frame has no byte range of its own. |
| **stream**                   | A trajectory written so far, ending wherever the writer stopped.                             |
| **file**                     | A stream that was sealed: the same bytes, followed by a footer.                              |
| **segment**                  | One encoded value of a region: a length prefix followed by that many bytes.                  |

## 4. Layout

```
stream := Magic ‖ header chunk ‖ data chunk*
file   := Magic ‖ header chunk ‖ data chunk* ‖ footer chunk ‖ u32 footerLen ‖ Magic
```

| Part             | Size     | Meaning                            |
| ---------------- | -------- | ---------------------------------- |
| `Magic`          | 5        | UTF-8 `TRAJS`                      |
| header chunk     | variable | exactly one frame, tagged `Header` |
| data chunk       | variable | one or more frames, each a part    |
| footer chunk     | variable | exactly one frame, tagged `Footer` |
| `footerLen`      | 4        | size of the footer chunk in bytes  |
| trailing `Magic` | 5        | UTF-8 `TRAJS`                      |

A reader MUST verify the leading `Magic` and MUST NOT read anything else if it
does not match.

Chunks are contiguous: the header chunk starts at offset 5, and each following
chunk starts where the previous one ends. There is no padding and no gap.

The two structural frames are placed, not filled in: the first chunk of a
trajectory holds the `Header` frame and nothing else, and the last chunk of a
file holds the `Footer` frame and nothing else.

### 4.1 Telling a file from a stream

Reading the last 9 bytes is not enough, because any 4 bytes can precede a `TRAJS`
marker by accident. A reader MUST treat the last 9 bytes as a _candidate_ and
confirm it:

1. `footerLen` MUST be at least 17 (smallest possible chunk).
2. `footerStart = length − 9 − footerLen` MUST lie after the header chunk: the
   chunk header at offset 5 MUST state an extent that ends at or before
   `footerStart`.
3. The bytes at `footerStart` MUST parse as a chunk whose extent ends exactly at
   `length − 9`, whose two checksums verify, and whose regions each hold exactly
   one segment — the meta one tagged `Footer`.

If any step fails, the trajectory is a **stream** and the last 9 bytes are part
of its tail. This confirmation is why a corrupted footer degrades to "a stream
that ends there" rather than to a forged index.

## 5. Chunk

```
off  size      field
 0    4        metaCrc
 4    4        bodyCrc
 8    4        bodyLen
12    4        metaLen
16    1        compression   0 none / 1 zstd / 2 gzip / 3 deflate
17   metaLen   meta region
..   bodyLen   body region
```

`chunkLen = 17 + metaLen + bodyLen`, so a chunk is self-delimiting.

- `metaCrc` covers bytes `[8, 17 + metaLen)`: `bodyLen`, `metaLen`, `compression`,
  and the meta region. A scan reads exactly those bytes, so a scan verifies every
  byte it uses.
- `bodyCrc` covers the body region, bytes `[17 + metaLen, chunkLen)`. Only a read
  that touches the body reads it.

Both are CRC-32, fixed by this format rather than declared in the file. A
declared algorithm would sit inside the chunk it protects, so it could not be
used to verify that chunk; a change of checksum is a change of format. Each
covers exactly the bytes in its row, so neither is a running checksum over a
file.

**Why two, and why at the start.** The two regions are read independently — that
is the whole point of separating them — so one checksum over the whole chunk
would force a `scan` to read the body region to verify what it just read. With
the split, a scan verifies every byte it uses and touches nothing else. Both
checksums precede the regions they cover so that a region never written reads as
invalid: an unwritten `metaCrc` is zero, and the CRC-32 of the bytes that follow
is not zero.

A chunk MUST hold at least one frame, and every frame's meta segment is at least
its tag.

A trajectory MUST hold at least its header chunk: `Magic` alone is not a
trajectory, and neither is one whose first chunk is not a header chunk.

A reader MUST check the extent (`chunkLen` against the bytes remaining) before
using `metaLen` or `bodyLen` for anything, because those fields are not trusted
until `metaCrc` verifies.

### 5.1 Compression

`compression` applies to the body region only, and is one value for the chunk:
the body region is a single compressed frame of that algorithm, holding the
bodies in frame order.

The meta region MUST NOT be compressed. It is the reason a reader can list parts
with no codec provided at all.

A writer MUST store the body region uncompressed (`compression = 0`) when
compressing it does not make it smaller. The body region is then the raw
concatenation of the body segments, and no codec is needed to read it.

A body region MUST be exactly one compressed frame. Concatenating frames MUST
NOT be written, and a reader MUST NOT feed the codec more than one frame. This is
not a stylistic rule: measured on the platforms this repository targets, at the
versions it pins, `node:zlib` decodes only the first frame of a concatenation and
reports success, `Bun.zstdDecompress` decodes all of them, and the browser codec
rejects anything that is not one frame. Relying on any of those behaviours would
make a file readable on one platform and silently short on another.

## 6. Frames and the two regions

A chunk holds `n` frames. Its meta region is the concatenation of their metas and
its body region (decompressed) the concatenation of their bodies, in the same
order:

```
meta region := meta₀ ‖ meta₁ ‖ … ‖ metaₙ₋₁
body region := body₀ ‖ body₁ ‖ … ‖ bodyₙ₋₁   (after decompression)
```

Each segment is an `effect` `SchemaBinary` encoding, which is self-delimiting by
its own length prefix — the same rule that `splitFrames` in
`internal/frames.ts` applies today. A reader MUST:

- split both regions by that prefix;
- require each region to be consumed exactly, with no trailing bytes and no
  segment running past the end;
- require the two regions to hold the same number of segments;
- pair segment `i` of one region with segment `i` of the other.

A frame is therefore not a byte range. What a frame has is a position: the `i`-th
meta segment and the `i`-th body segment of one chunk. Nothing about a frame is
stored twice, and no frame carries a header of its own.

Consequences, which are deliberate:

- Reading one frame decompresses its whole chunk.
- A truncated chunk loses every frame it holds, not the tail of them.
- A frame MUST NOT span two chunks.

## 7. Meta

`Meta` is the union of every frame's meta. The tag is the frame's identity: for a
part it is the part's `_tag`, and it decides both the shape of the meta and the
schema of the body.

| Tag        | Meta                                                    | Body                                                   |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------ |
| `Session`  | `uuid`, `type`                                          | `extra`                                                |
| `Prompt`   | `uuid`, `sessionId?`, `timestamp?`, `startTimestamp?`   | `messages`, `extra`                                    |
| `Response` | `uuid`, `sessionId?`, `timestamp`, `startTimestamp?`    | `response`, `extra`                                    |
| `Event`    | `uuid`, `sessionId?`, `timestamp`, `startTimestamp?`    | `event`                                                |
| `Metric`   | `metricTag`, `attach?`, `timestamp?`, `startTimestamp?` | `data`                                                 |
| `Header`   | the tag only                                            | `hash`, `toolkit`, `eventkit`, `metrickit`, `extrakit` |
| `Footer`   | the tag only                                            | `digest`, `chunks`                                     |

- `uuid` and `sessionId` are the canonical strings of the part, with no
  transformation, so a reader comparing them to a part it decoded compares like
  with like. `sessionId` absent means the main session.
- `type` of a `Session` is `{ _tag: "main" }` or `{ _tag: "sub", id, fork }`.
  The main session's id is the constant `"main"`, so it is not stored.
- `metricTag` is `part.metric._tag`. `attach` is the `metric.data.attach` list
  lifted out of the body: it names the parts and sessions a metric is attached
  to, which is what session membership is decided by, so it belongs with the
  identity. Encoding moves it from `data` into the meta and decoding puts it
  back; the part model, `Metric.Output`, `Metric.Failure`, and every consumer
  keep `attach` exactly where it is.
- `timestamp` and `startTimestamp` are epoch milliseconds as an integer, and
  decode to the part's `DateTime.Utc`. They are not the ISO strings the part
  schema encodes: this region is not compressed, an ISO timestamp costs 25 bytes
  there, and two of them would be the largest field of a small part's meta.
- `data` of a `Metric` is the `Output` or `Failure` report with `attach` removed.
  The report's own `timestamp` is payload and stays inside `data`.
- `Header` and `Footer` carry nothing in their meta beyond the tag. Their fields
  are what `inspect` reads, and it reads their whole chunk anyway, so promoting
  any of them would buy nothing.
- `PartMeta` is the five part variants of `Meta`. It is what a scan yields: the
  two structural frames are stated on `Loaded`, so a consumer matching a part
  meta never handles a case that cannot occur. The two are one schema and its
  subset, not two unions with two decoders.
- Every body is `Schema.omit(part, meta fields)`. The part schema stays the one
  source of truth for what a part holds; the split into meta and body is a view
  of it, not a second description.
- A tag a reader does not know MUST fail the read. New variants are added in
  lockstep with readers; this format does not negotiate versions.

A field belongs in the meta when, and only when, it is needed by one of:
skipping a frame without decompressing it, choosing the body's schema, reading a
structure with no config, or placing a frame on a timeline. Anything else is
body.

## 8. Header frame

Every trajectory begins with a chunk that holds exactly one frame and nothing
else, and that frame is tagged `Header`. Its body is a `Header` body:

| Field                                          | Meaning                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `hash`                                         | digest algorithm of the whole file (`StreamHash.Algorithm`)           |
| `toolkit`, `eventkit`, `metrickit`, `extrakit` | the stored kit descriptions, as today's `Exchange.Header` states them |

`hash` is the algorithm the footer's digest uses, so no read takes an algorithm
from its caller. A `Header` body is written once and never changes: an `append`
that would write a different one MUST fail instead (section 11.2).

Being alone in its chunk is what makes `inspect` cheap — reading the kits costs
one small chunk, not a data chunk — and what lets a reader hold the kits before
it decodes any body.

## 9. Footer frame

A `file` ends with a chunk that holds exactly one frame and nothing else, and that
frame is tagged `Footer`. Its body is a `Footer` body:

| Field    | Meaning                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------- |
| `digest` | lowercase hexadecimal digest over `[0, footerStart)`                                               |
| `chunks` | one entry per data chunk, in file order: `len` (chunk size in bytes) and `count` (frames it holds) |

Rules:

- `digest` covers the stored bytes of the whole file before the footer: `Magic`,
  the header chunk, and every data chunk. It does not cover the footer chunk or
  the trailing `footerLen ‖ Magic`, which the footer's own checksums cover.
- `chunks` MUST list data chunks only, MUST be in file order, and MUST satisfy
  `5 + headerChunkLen + Σ len = footerStart` and `Σ count = parts`.
- `chunks` is a derived cache. Every number in it can be recovered by walking the
  chunks, which is exactly what a stream reader does; a file carries it so a
  reader does not have to.

The footer is alone in its chunk for the same reason the header is: `u32
footerLen` locates that chunk in one read. A footer sharing a chunk with parts
could only be found by scanning, which is what a file exists to avoid.

Why `len` and `count` and nothing else: `count` makes part index → chunk a prefix
sum in memory, `len` makes chunk → offset one too, and both are eight bytes per
chunk — a two-hundred-megabyte trajectory of two-megabyte chunks costs under a
kilobyte of table. An offset per chunk is not needed because the table is an
ordered list and offsets are its prefix sums.

## 10. Chunking policy

A writer decides chunk membership as frames arrive:

```
budget := chunkSize
pending := []
for each frame:
    raw := len(meta) + len(body)
    if pending is not empty and budget < raw:
        write chunk(pending); pending := []; budget := chunkSize
    pending.add(frame); budget := budget − raw
    if budget < 0:                       # a single frame larger than chunkSize
        write chunk(pending); pending := []; budget := chunkSize
```

- `chunkSize` is the budget over **raw** sizes: the sum of every meta segment's
  bytes and every body's bytes in the chunk, before compression. It defaults to
  2 MiB. It is not a limit on the stored size: an incompressible chunk is a
  little larger than raw, and a text-heavy one is several times smaller.
- The unit is raw because membership must be decided before the bodies are
  compressed, and because decompression cost follows raw bytes rather than stored
  bytes — so this one number bounds the decompression work per random access, the
  stored size, the visibility delay of a live recording, and what a crash loses.
- A single frame whose own `raw` exceeds `chunkSize` is alone in its chunk, with
  no upper limit. This is also the escape hatch for a body that does not compress
  (an embedded file, base64 media): alone, its chunk can be stored with
  `compression = 0` without dragging the text beside it out of compression.
- The `Header` and `Footer` frames are placed by section 4, not budgeted: each
  occupies its chunk alone, so neither takes part in a membership decision.
- Membership follows arrival order only. Nothing about a part — its session, its
  kind, its size beyond the budget — moves it to a different chunk, because a
  produced trajectory interleaves kinds by construction and no locality can be
  assumed.
- A frame MUST NOT be split across chunks.
- A writer MAY close a chunk early — on idle, or when a recording pauses. Chunk
  membership is not part of the format, so this needs no marker.
- A writer MUST NOT emit a chunk whose `metaLen` or `bodyLen` would not fit in
  four bytes.

## 11. Writing

Every write is a sequence of whole chunks: a chunk is assembled in memory
(at most `chunkSize` of raw bodies, plus its meta bytes) and written as one
contiguous run of bytes. A short write leaves a prefix of it — the torn chunk of
section 11.4 — and nothing else can be left behind.

A write call MUST leave the trajectory ending on a chunk boundary. That is what
lets `file` seal a stream by appending, and it means no chunk is half written when
a call returns.

### 11.1 `save`

Create the trajectory, write `Magic`, the header chunk, the data chunks, close
the last chunk, then the footer chunk and `u32 footerLen ‖ Magic`. The digest is
computed while writing, over the bytes as they are produced (`StreamHash.start`).
`Storage.write` is called with `mode: "create"`.

### 11.2 `append`

Continues an existing trajectory without changing its form:

1. The target MUST exist. Creating is `save`.
2. The stored `Header` MUST encode to the same bytes the call would write from
   its config; otherwise the call MUST fail. A trajectory holds one set of kits.
3. A torn tail chunk (section 11.4) MUST be truncated first.
4. If the target is a `file`, the footer chunk and the trailing
   `footerLen ‖ Magic` MUST be truncated, then data chunks appended, then a new
   footer written. If it is a `stream`, chunks are appended at its end.
5. The digest MUST be recomputed by reading `[0, footerStart)`; digest state MUST
   NOT be carried between calls.

Steps 3 and 4 rewrite nothing: they drop bytes from the tail. Appending at all
needs a write that continues a trajectory rather than replacing it, which is
`Storage.write` with `mode: "resume"` and the offset the append starts from; a
storage that does not declare `capabilities.resume` MUST fail the call as
`UnsupportedWrite` rather than writing the trajectory whole.

### 11.3 `file`

Seals a `stream`:

1. The target MUST be a `stream`. Sealing a `file` MUST fail, so no byte of a
   written footer is ever replaced by a second one.
2. A torn tail chunk MUST be truncated first.
3. The footer chunk and `u32 footerLen ‖ Magic` are appended, which is a
   `mode: "resume"` write at the trajectory's current length.
4. The digest is computed over `[0, footerStart)`, read back for the purpose.

### 11.4 Interrupted tails

A chunk that declares an extent past the end of the file is **torn**: the writer
stopped inside a write. A reader stops before it (section 12) and a writer
truncates it before appending (sections 11.2, 11.3). Truncation MUST be reported
with the number of bytes dropped, because parts recorded there are lost.

A torn chunk is the only state in which bytes of a trajectory are unreadable, and
it can only be the last chunk of a stream: a `file` is written with every chunk
complete, and any reader or writer that meets a torn chunk in the middle of a
trajectory has met corruption, not a crash (section 13).

## 12. Reading

### 12.1 `inspect`

Reads `Magic`, the header chunk, and — after confirming it as in section 4.1 —
the footer chunk. It reads no data chunk and decodes no part. It yields the
`Header` and, when the trajectory is a `file`, the `Footer`; the presence of the
footer is also the answer to "which form is this".

### 12.2 Scanning identities

Walks the chunks, and per chunk reads only the 17-byte chunk header and the meta
region: two reads, no decompression, no codec, no `bodyLen` bytes read. It yields
the part metas in order; the two structural frames are stated on `Loaded` rather
than yielded, because a caller has them before it scans.

This is the operation `Session`, `View`, and a viewer's session tree are built on:
the tag, the uuid, the session, the attachment list, and the timestamps of every
part, without decompressing one byte of body.

### 12.3 Reading parts

Walks the chunks, and per chunk reads it whole, verifies both checksums,
decompresses the body region, splits both regions, and decodes each pair. Parts
are yielded in file order. Memory holds one chunk at a time: whole-chunk
buffering, not whole-file.

In a `stream`, the walk stops silently at a torn chunk — that is the normal shape
of a trajectory whose writer is still running or was killed, and it is not an
error. In a `file`, the chunk table and the footer's count say how much there
should be, so a short file, a failed checksum, or a failed digest is an error.

### 12.4 Reading a range

In a `file`, locate with the footer table alone: prefix sums over `count` give the
chunk holding part N, prefix sums over `len` give that chunk's offset, and the
meta region of that chunk is walked to the frame. Then read only the chunks
covering `[from, from + count)`. No other chunk is read, and no other meta region
is read.

In a `stream` there is no table, so a range is a scan that discards until `from`.

### 12.5 `validate`

Checks the whole trajectory and reports every issue it finds:

- each chunk's extent, `metaCrc`, and `bodyCrc`;
- each body region decompresses (`CompressionFailure`);
- each meta decodes (`UndecodableMeta`), each body decodes (`UndecodablePart`);
- the two regions hold the same number of segments and are consumed exactly
  (`MalformedChunk`);
- in a `file`: the chunk table against the chunks on disk, the frame count, and
  the digest (`DigestMismatch`).

A torn chunk is reported as `TruncatedChunk` in a `stream` and never occurs in a
`file`. Several issues are reported together as `Composite`, in the order found.

### 12.6 Cost

| Operation    | Reads                         | Decompression    |
| ------------ | ----------------------------- | ---------------- |
| `inspect`    | header chunk, footer chunk    | two small chunks |
| scan         | two reads per chunk           | none             |
| read all     | one pass                      | every chunk      |
| range (file) | the chunks covering the range | those chunks     |
| validate     | one pass                      | every chunk      |

Reading one part costs one chunk, not one part: that is the price of a compression
unit that shares its window across thousands of parts, and it is the correct
trade for this format's readers, which either want one identity (scan, no
decompression) or want many bodies (read, range over a span).

## 13. Integrity and failures

Four situations are distinguished by what a reader can prove:

| Situation       | Test                                             | Stream                   | File               |
| --------------- | ------------------------------------------------ | ------------------------ | ------------------ |
| torn            | declared extent runs past the end of the file    | stop, not an issue       | corruption         |
| wrong bytes     | checksum mismatch inside a complete chunk        | `ChecksumMismatch`, stop | `ChecksumMismatch` |
| shapeless       | regions do not split evenly, or leave bytes over | `MalformedChunk`, stop   | `MalformedChunk`   |
| not what it was | digest mismatch                                  | —                        | `DigestMismatch`   |

The distinction between torn and corrupt is structural: a torn chunk is one whose
extent does not fit, not one whose decompression failed. This is why the format
does not need to interpret a codec's error to tell a killed writer from a damaged
file — the two are different shapes of bytes.

A chunk checksum is not an identity: two different chunks can share one CRC-32,
and one chunk edited while keeping its checksum is not detectable chunk-locally.
That is the digest's job, and the reason the digest covers stored bytes rather
than decoded parts: it can be checked without decompressing anything.

A failed `metaCrc` makes the rest of a stream unfindable, because `metaLen` is
what locates the next chunk; a reader MUST stop. In a `file` the footer table is
independent of the chunk headers, so a reader MAY continue at the next table
entry and report the failed chunk — which is what lets `validate` report several
issues at once.

## 14. Limits

| Quantity                       | Bound                          |
| ------------------------------ | ------------------------------ |
| meta, body region of one chunk | 4 GiB − 17 (two `u32` fields)  |
| footer chunk                   | 4 GiB (`footerLen`)            |
| frames of one chunk            | the meta region's 4 GiB        |
| data chunks of a file          | 2³² − 1 (the table's indexing) |
| file size                      | not bounded by the format      |

The footer's `count` states one chunk's frames as a `u32`, so a chunk holding
more than that is one a file cannot describe. Offset arithmetic is done in
`bigint` at the storage seam, so a trajectory may be larger than any 32-bit
count.

A writer SHOULD refuse a part whose meta or body alone exceeds what a chunk can
state, rather than writing a chunk no reader can read back.

## 15. Public surface

The format decides what `Exchange` must be able to answer. Names below are the
minimum surface; anything else is the implementation's to shape.

```ts
export const Magic: Uint8Array; // "TRAJS"

export const Header; /* = Schema */ // section 8
export interface Footer {
  // section 9
  readonly digest: string;
  readonly chunks: ReadonlyArray<{ readonly len: number; readonly count: number }>;
}

export interface Inspected {
  readonly header: Header;
  readonly footer?: Footer; // present ⇔ file
}

export interface Loaded<Config> {
  readonly header: Header;
  readonly footer?: Footer;
  readonly scan: () => Stream.Stream<PartMeta>; // identities only
  readonly read: (config?: Config) => Trajectory; // whole trajectory
  readonly range: (range: Range, config?: Config) => Stream.Stream<Trajectory.Part<Config>>;
  readonly validate: (config?: Config) => Effect.Effect<void, Issue>;
}

export interface Range {
  readonly from?: number; // default 0
  readonly count?: number; // default to the end
}

export interface SaveOptions {
  readonly compression?: Compression.Options; // algorithm and level
  readonly hash?: StreamHash.Options;
  readonly chunkSize?: number; // raw bytes, default 2 MiB
}

export interface AppendOptions {
  readonly compression?: Compression.Options;
  readonly chunkSize?: number;
}

interface Service {
  readonly inspect: (id: string) => Effect<Inspected, TrajectoryError | StorageError>;
  readonly load: (config) => (id: string) => Effect<Loaded, TrajectoryError | StorageError>;
  readonly save: (trajectory, options?: SaveOptions) => (id: string) => Effect<void>;
  readonly append: (trajectory, options?: AppendOptions) => (id: string) => Effect<void>;
  readonly file: (id: string) => Effect<void, TrajectoryError | StorageError>;
}
```

Exported by `Exchange`: `Magic`, `Header`, `Footer`, `Inspected`, `Loaded`,
`Range`, `SaveOptions`, `AppendOptions`, `Meta`, `PartMeta`, `Exchange`, `layer`.

`Meta` is the seven-variant union of section 7 and `PartMeta` its five part
variants: one schema, and the subset a scan yields. `Header` no longer states a
checksum algorithm, because the chunk checksum is fixed (section 5).

Removed: `Metadata`, `Version`, `Part` (the stored part schema),
`Inspected.metadata`, `Loaded.metadata`.

`ExchangeIssue` after the change:

| Issue                                                   | Raised when                                              |
| ------------------------------------------------------- | -------------------------------------------------------- |
| `TruncatedChunk { offset, remaining }`                  | declared extent runs past the end                        |
| `ChecksumMismatch { offset, region, expected, actual }` | `region` is `"meta"` or `"body"`                         |
| `CompressionFailure { offset, cause }`                  | the body region does not decompress                      |
| `UndecodableMeta { index, offset, cause }`              | a meta segment does not decode, including an unknown tag |
| `UndecodablePart { index, offset, cause }`              | a body segment does not decode                           |
| `MalformedChunk { offset, reason }`                     | the chunk, or the table, does not hold together          |
| `DigestMismatch { algorithm, expected, actual }`        | unchanged                                                |
| `Composite { issues }`                                  | unchanged                                                |

`TruncatedFrame` is removed: a frame is not a byte range any more, so nothing
but a chunk can be truncated.

The `reason` of a `MalformedChunk` names which way it failed to hold together:
`segments` (the two regions do not split into equal counts, or do not consume
exactly), `extent` (a chunk following a complete one does not begin where it
ended), or `table` (the footer table disagrees with the chunks on disk).

Two service changes are part of the format rather than of the API:

- `Compression.Options` gains `level` (zstd 1–22, gzip and deflate 1–9, ignored
  where a platform states none). It is not recorded in the file, since a reader
  does not need it.
- `Exchange.layer` requires `Checksum`, for the two chunk checksums.

## 16. Conformance

The implementation is conformant when each of these holds. Each is a test, not an
intention.

1. **Round trip.** A trajectory holding every part kind, every kit, an attached
   metric, a fork, and timestamps saves and loads to equal parts, across `save`,
   `inspect`, `read`, `scan`, and `range`, and reads back the same after sealing
   and after appending.
2. **No body read while scanning.** Over a counting `Byte`, a scan of a
   two-hundred-megabyte trajectory reads no byte of any body region, and two
   reads per chunk.
3. **Identity without a codec.** A scan completes with no `Compression` layer
   provided, for a trajectory whose chunks are compressed.
4. **Timestamps are identities.** A scan yields every part's `timestamp` and
   `startTimestamp` without reading a body region.
5. **Random access is arithmetic.** In a file of at least five data chunks,
   reading part N reads only the chunk holding it and no other meta region.
6. **One frame per chunk.** Every chunk a writer emits decodes as exactly one
   codec frame, and the codec reports having consumed the whole region.
7. **Torn tail.** A stream truncated at every offset inside its last chunk yields
   the parts of the chunks before it and nothing from the torn one; `validate`
   reports `TruncatedChunk` at that chunk's offset; `append` truncates it and
   reports the bytes dropped.
8. **Oversized part.** A part whose meta plus body exceeds `chunkSize` is alone
   in its chunk and round-trips.
9. **Uncompressible part.** A body region that does not shrink is stored with
   `compression = 0` and round-trips, and the text beside it still compresses.
10. **Checksum locality.** Flipping a byte in a meta region yields
    `ChecksumMismatch` with `region: "meta"`; in a body region, `region: "body"`.
11. **Digest.** Rewriting a body region and its `bodyCrc` consistently is caught
    by `validate` as `DigestMismatch`, and not by a chunk-local check.
12. **Form detection.** A stream whose last 9 bytes happen to be a plausible
    `u32 ‖ TRAJS` is read as a stream, because the candidate footer chunk does not
    verify.
13. **Append keeps the form.** Appending to a file leaves a file whose parts are
    in order, whose table grew by the new chunks, and whose digest matches;
    appending to a stream leaves a stream.
14. **Seal.** `file` on a stream yields the same parts and a footer; `file` on a
    file fails.
15. **Empty trajectory.** A trajectory with no parts has no data chunks, a footer
    with an empty table, and a digest over `Magic` and the header chunk.
16. **Unknown variant.** A meta tag the reader does not know fails as
    `UndecodableMeta`, rather than being skipped.
17. **Region accounting.** A body region one byte short, one byte long, or with
    one segment fewer than the meta region fails as `MalformedChunk`.
18. **Cross-platform.** A file written by any platform package reads on the other
    two, for each algorithm the three provide.
19. **Placement.** A trajectory whose first chunk holds a part, whose `Header`
    shares a chunk with another frame, or whose `Footer` is not alone in the last
    chunk of a file, is rejected.

## 17. Migrating the implementation

| Current                                                                            | After                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------- |
| `Header` as a JSON record after the magic                                          | `Header` body in the header chunk           |
| `Metadata` (version, compression, hash, digest) at the tail                        | `Footer` body; digest algorithm in `Header` |
| one compressed frame holding every encoded part                                    | two regions per chunk                       |
| `exchange.ts`: `frameOf`, `headerOf`, `metadataOf`, `encodeMetadata`, `checkParts` | replaced by `internal/chunk.ts`             |
| `frames.ts`: `splitFrames`, `readFrames`, `joined`                                 | kept as the segment reader and writer       |
| `exchange.ts`: `encodePart`, `decodePart`, `ExchangePart`                          | split by `Schema.omit` into meta and body   |
| `exchange.ts`: `trajectoryOf`                                                      | pairs a chunk's segments                    |

Suggested module split: `internal/chunk.ts` (header, extent, checksums, regions),
`internal/meta.ts` (the union, the five meta/body pairs, the `attach` promotion,
the millisecond timestamps), `internal/footer.ts` (table and digest) — with
`Exchange.ts` keeping only the service.

Consumers to move, each of which states something about the format today:

| File                                                 | What it states                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/cli/src/inspect.ts`                            | prints the header and the metadata record                              |
| `ui/viewer/src/lib/trajectory.ts`                    | reads a stored trajectory to draw a session tree, which becomes a scan |
| `ui/website/src/components/landing/landing-page.tsx` | saves and loads a sample                                               |
| `packages/olap/src/Parts.ts`                         | reads a stored trajectory as table rows                                |
| `examples/traj-analysis/cases/*`                     | read and write fixtures                                                |
| `tests/e2e/tests/roundtrip.test.ts`                  | asserts on `metadata`                                                  |
| `ui/viewer/public/sample.trajs`                      | a stored sample, to be regenerated                                     |

Old files are not readable. They share the `Magic` and will fail structurally
rather than reporting a version; the format states no version byte on purpose
(section 18), and a trajectory written before this change is a different format,
not an older one.

## 18. Rejected alternatives

Each was considered and dropped for the reason given, so the reason is not
re-litigated later.

- **One compressed frame per part** (the format this replaces). A part of a
  recorded run is a few hundred bytes; a codec frame header, a rebuilt entropy
  table, and a reset window cost more than the redundancy a per-part unit can
  find. It also makes a full read the slowest possible path, which is the path
  every consumer takes.
- **Bodies inline in each frame, one chunk spanning scattered fragments** (the
  first draft of this change). Skipping a frame then needs that frame's
  _compressed_ fragment length, which only a streaming compressor can report; the
  materialized-buffer codecs (`Bun.zstdCompress`, and every platform's one-shot
  entry) cannot, and flushing per frame to force a boundary would destroy the
  window the change exists to share. It also forces a copy of up to `chunkSize`
  before a one-shot decompressor can be called.
- **The zstd seekable format.** Its index must be the last thing in the file and
  its offsets start at byte zero, so it cannot wrap a file that also carries a
  header chunk and a footer chunk; nesting it would write the same index twice.
  See the investigation in `@trajs/utils`.
- **Several codec frames per chunk, so an append can continue one.** Platform
  decoders disagree about concatenated frames (section 5.1). Resumability at a
  frame level is not worth a file that reads short on one platform.
- **A frame count or a frame index in each chunk header.** The meta region
  already walks; a count would save nothing and an index would duplicate the
  footer's table for streams that never random-access.
- **Compressing the meta region.** It would make scanning need a codec, which is
  the property the whole split exists to keep.
- **A version byte.** The `Magic` names the format and the fields are fixed; a
  version that is never negotiated is a field a reader would have to branch on
  for no case that exists.
- **A per-frame checksum.** After this change a frame owns no bytes, so the
  checksum's coverage would have to be invented. Two checksums per chunk cover
  exactly what a reader reads in two pieces.
- **Raw 16-byte uuids in meta.** It would save 21 bytes per frame over the
  canonical string, but it would give a uuid two representations in one program —
  one of them used only by the storage layer to compare identities it does not
  own. Revisit only if measurement says the bytes matter.
- **A second container primitive for the structural frames** (`record := crc ‖
len ‖ compression ‖ body`, laid out as `Magic ‖ header record ‖ chunk* ‖ footer
record ‖ u32 ‖ Magic`). It would keep every frame of one shape, at the price of
  two container primitives, two encodings of the same three fields, and losing "a
  trajectory is a string of chunks". A tag costs two bytes and removes the same
  special cases.
- **A checksum algorithm declared in the file.** The declaration would sit inside
  the chunk it protects, so verifying that chunk would need what it is verifying.
  CRC-32 is fixed instead.
- **Fixed-size blocks with resync records, sequence numbers, and checksum
  chains** (the WAL-shaped design). There is one writer, one append point, and no
  need to resume reading after a corrupt block; all of that machinery would exist
  to solve a problem this format does not have.

## 19. Decisions not yet measured

Stated so the numbers are not mistaken for findings.

- `chunkSize = 2 MiB` is chosen by reasoning (section 10), not by a measurement
  over a real trajectory. The ratio and the latency it describes should be
  checked against a recording of a real run, and the default changed if the
  measurement disagrees.
- The default compression level (zstd 12) is the level at which a 2 MiB chunk is
  projected to cost a few tens of milliseconds. The projection is throughput
  arithmetic, not a benchmark.
- Epoch-millisecond timestamps in meta assume no reader needs finer than a
  millisecond, which neither the format nor the part model asks for.
