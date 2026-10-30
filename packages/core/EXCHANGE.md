# RFC 1 — The `.trajs` container format

- **Status:** accepted. Normative for the `Exchange` rewrite of `@trajs/core`.
- **Supersedes:** the JSON header, the binary part frame, and the JSON metadata
  tail — the one-frame part region, and the whole-file digest that every append
  recomputed by reading the file.
- **Audience:** implementers of `Exchange`, and every program that reads or writes
  a stored trajectory.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are used as in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). "Raw" means before
compression, and a fixed-width integer is unsigned and little-endian.

## 1. Conventions

A trajectory is written by one process on one machine, read by any number of
processes, and never modified in place except at its tail. Every rule below is
stated against that one fact.

Offsets are byte offsets from the start of the file. `H` is the digest algorithm
the trajectory's `Header` names (section 8), and every value it produces is 32
bytes. The chain value of a chunk (section 5.2) is the only value in the file
computed from bytes outside its own chunk.

## 2. Goals

The format exists to satisfy these properties. Each one is a MUST, and section 15
records what was rejected to keep them.

1. **Append-only.** A writer never changes a byte it has already written; it may
   only drop bytes from the tail. A file is therefore readable at every chunk
   boundary, including while it is being written and after the writer was killed.
2. **Identity without decompression.** Which parts a trajectory holds, in which
   session, attached to what, and at what time MUST be readable without
   decompressing anything.
3. **Compression in large units.** The compressed unit MUST be far larger than a
   part, because most parts of a recorded run are a few hundred bytes and a
   per-part compression frame costs more than it saves.
4. **Locating without a scan.** A sealed file MUST state the extent of every chunk
   and the length of every meta region, so that locating a frame is arithmetic
   over a table and a scan issues its reads at once.
5. **One file.** Everything a reader needs is inside the file, with no sidecar
   index and no second write that completes it.
6. **Portability.** A file written by any platform package MUST read on every
   other one, over the codecs those packages already provide.
7. **Append is local.** Continuing a trajectory MUST cost the tail, not the file:
   the state an append continues from sits at the point it appends to, and an
   append reads only that tail, whatever locates the append point, and the header
   chunk.

Non-goals: several writers to one file, resynchronisation after a corrupt block,
rotation, eviction, compaction, semantic locality inside a compression unit,
understanding a meta variant a reader does not know, byte-identical output across
platforms or codec levels, and authenticity — every integrity value here is
unkeyed, so the format detects accident and partial rewriting, never a forger who
recomputes every value behind the changed bytes.

## 3. Terms

| Term                  | Meaning                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **chunk**             | One compressed unit: frames' identities, their contents compressed as one piece, its checksums, and the chain value it ends with.        |
| **meta**              | What a reader reads without decompressing: the tag, the identifiers, the timestamps.                                                     |
| **body**              | The part of a frame that is not meta, compressed together with the bodies of its chunk.                                                  |
| **frame**             | One meta segment paired with one body segment. A frame has no byte range of its own.                                                     |
| **chain**             | The integrity of everything stored before a chunk ends, in that chunk's last 32 bytes (section 5.2).                                     |
| **frontier**          | The chain value an append or a seal continues from: the 32 bytes immediately before the point it appends at.                             |
| **stream**            | A trajectory written so far, ending wherever the writer stopped.                                                                         |
| **file**              | A stream that was sealed: the same bytes, followed by a footer chunk.                                                                    |
| **segment**           | One encoded value of a region, as the schema codec writes it (section 6): a varint length, an envelope byte, and the payload.            |
| **compression frame** | The one frame a chunk's body region is stored as: one value of the `compression` codec, holding every body of that chunk in frame order. |

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
does not match. Chunks are contiguous: the header chunk starts at offset 5, and
each following chunk starts where the previous one ends. There is no padding and no
gap.

The two structural frames are placed, not filled in: the first chunk of a
trajectory holds the `Header` frame and nothing else, and the last chunk of a file
holds the `Footer` frame and nothing else.

### 4.1 Telling a file from a stream

Reading the last 9 bytes is not enough, because any 4 bytes can precede a `TRAJS`
marker by accident. A reader MUST treat them as a candidate and confirm it:

1. `footerLen` MUST be at least 49, the bytes a chunk takes before its two regions.
2. `footerStart = length − 9 − footerLen` MUST lie after the header chunk: the
   chunk header at offset 5 MUST state an extent that ends at or before
   `footerStart`.
3. The bytes at `footerStart` MUST parse as a chunk whose extent ends exactly at
   `length − 9`, whose two checksums verify, and whose regions each hold exactly
   one segment — the meta one tagged `Footer`.

Confirmation reads no data chunk and checks no chain value. Validation (section 12)
compares the table with the chunks on disk and the footer chunk's chain value with
the bytes it covers.

If any step fails, the trajectory is a **stream**: a walk from offset 5 (section 12)
stops at the chunk holding the `Footer` frame, which carries no part and whose
trailing bytes belong to no chunk. A file whose tail is damaged therefore reads as
the parts before its footer, never as a forged index.

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
..   32        chain
```

`chunkLen = 49 + metaLen + bodyLen`, so a chunk is self-delimiting.

- `metaCrc` covers bytes `[8, 17 + metaLen)`: `bodyLen`, `metaLen`, `compression`,
  and the meta region. A scan reads exactly those bytes, so it verifies every byte
  it uses.
- `bodyCrc` covers the body region alone. Only a read that touches the body reads
  it, and the chain value is outside it on purpose (section 5.2).

Both are CRC-32, fixed by this format rather than declared in the file: a declared
algorithm would sit inside the chunk it protects, and a change of checksum is a
change of format. Each covers exactly the bytes in its row, so neither is a running
checksum over a file.

Both precede the regions they cover, so a region never written reads as invalid: an
unwritten `metaCrc` is zero, and the CRC-32 of the bytes that follow is not.

A chunk MUST hold at least one frame, and every frame's meta segment states its
tag (section 7), so the codec's own frame bytes sit on top of the 49 above rather
than inside them. A trajectory MUST hold at least its header chunk: `Magic` alone is
not a trajectory, and neither is one whose first chunk is not a header chunk. A
reader MUST check the extent before using `metaLen` or `bodyLen` for anything,
because those fields are not trusted until `metaCrc` verifies.

### 5.1 Compression

`compression` applies to the body region only and is one value for the chunk: the
body region is a single compression frame holding the bodies in frame order. The
meta region MUST NOT be compressed — that is the reason a reader can list parts with
no compression codec provided at all.

A writer MUST store the body region uncompressed when compressing it does not make
it smaller.

A body region MUST be exactly one compression frame, and a reader MUST NOT feed the
codec more than one. This is not stylistic: measured on the platforms this
repository targets, at the versions it pins, `node:zlib` decodes only the first frame
of a concatenation and reports success, `Bun.zstdDecompress` decodes all of them, and
the browser codec rejects anything that is not one frame.

### 5.2 Chain

Every chunk ends with a 32-byte chain value, which extends the digest over the chunk
before it:

```
chain(−1)      = H(Magic)
chain(chunk i) = H(chain(chunk i − 1) ‖ bytes(chunk i)[0, chunkLen − 32))
```

`chain(c)` is the integrity of every stored byte up to the end of chunk `c`, folded
chunk by chunk rather than hashed once over the whole prefix, which is what lets it
be extended without re-reading that prefix. The digest of a file is the chain value
of its footer chunk (section 9).

- **A chunk is verified against its predecessor, not against the file.** A chunk and
  the 32 bytes before it are enough to check that the two were written in that
  order.
- **An append reads 32 bytes.** The frontier is the 32 bytes immediately before the
  append point, so continuing a trajectory costs the tail (goal 7).
- **A break has a location.** The chunk whose value does not extend the one before it
  is the chunk a reader reports (section 13).
- **A prefix stands on its own.** A reader that has checked chunks `0 … k` and
  recorded `chain(k)` checks what was appended after it without re-reading what it
  already verified.

The value is 32 bytes because every algorithm `Header.hash` can name produces 32
bytes. It is not covered by `bodyCrc`: a corrupted chain value is a `ChainMismatch`,
which is the check it is, rather than a checksum failure; and because the next chunk
extends it, tampering is caught one chunk later. The last chunk of a stream is
therefore the one chunk nothing checks until a seal extends it.

The chain is a prefix, not a tree: any change to a chunk changes every value after
it, and no reader can distinguish a rewrite that recomputes them all from the
trajectory as written.

## 6. Frames

A chunk holds `n` frames: its meta region is the concatenation of their metas, its
body region (decompressed) the concatenation of their bodies, in the same order.

A segment is one value as the schema codec (`SchemaBinary`) writes it: a varint
length, an envelope byte, and the payload that length covers. The container states no
framing of its own — it writes no length, no envelope and no trailer — so a region is
a region only because the codec's frames tile it. A writer joins a region by taking
the bytes the codec wrote for each value, and a reader MUST split both regions by
walking those lengths, require each region to be consumed exactly, require the two
regions to hold the same number of segments, and pair segment `i` of one region with
segment `i` of the other. The walk is the only part of the framing the container owns,
and it owns it because the codec decodes one frame at a time and states no offsets: a
region that does not tile exactly with whole frames is `MalformedChunk` (section 13),
not a value read short.

A frame stands alone, and the codec's wire mode is what makes that true: a value
decodes from the bytes of its own segment and from nothing before it. The container
therefore fixes the codec's default mode, which evolves by field, and MUST NOT use the
codec's shared dictionary or its fingerprint mode — the first makes a frame decode
only through the frames written before it, and the second requires both ends to state
an identical layout. Either would take away what section 7 reads without a body,
section 12 ranges over, and section 11 appends after.

A frame is therefore not a byte range but a position, and nothing about a frame is
stored twice.

A frame index counts frames, not parts a program can decode: a frame whose meta does
not decode, or whose body the reader's kits cannot decode, is still a frame and
still holds its index. Reading one frame decompresses its whole chunk, a truncated
chunk loses every frame it holds, and a frame MUST NOT span two chunks.

## 7. Meta

`Meta` is the union of every frame's meta. The tag is the frame's identity: for a
part it is the part's `_tag`, and it decides both the shape of the meta and the
schema of the body.

The tag is not stored as the name it has. The codec states a union member's tag as
the member selector of its frame — four bytes, derived from the fields the member
pins to a literal — so the tag costs four bytes and reads only with the schema that
states it, and the `_tag` string is a name the decoder puts back. A meta is therefore
read as one union of every tag, never with a single member's own codec, whose frame
is different bytes: a union's member frame selects, a member's own frame carries its
`_tag` as a field. A release may add a tag to `Meta` and MUST NOT rename one, for the
same reason no field name of a meta or a body may change: the codec derives each
field's wire id from the field's name, so a rename is a layout change and reads as a
field no reader states.

| Tag        | Meta                                                    | Body                                                              |
| ---------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| `Session`  | `uuid`, `type`                                          | `extra`                                                           |
| `Prompt`   | `uuid`, `sessionId?`, `timestamp?`, `startTimestamp?`   | `messages`, `extra`                                               |
| `Response` | `uuid`, `sessionId?`, `timestamp`, `startTimestamp?`    | `response`, `extra`                                               |
| `Event`    | `uuid`, `sessionId?`, `timestamp`, `startTimestamp?`    | `event`                                                           |
| `Metric`   | `metricTag`, `attach?`, `timestamp?`, `startTimestamp?` | `data`                                                            |
| `Header`   | the tag only                                            | `version`, `hash`, `toolkit`, `eventkit`, `metrickit`, `extrakit` |
| `Footer`   | the tag only                                            | `chunks`                                                          |

- A uuid is stored as its 16 bytes rather than its 36-character string: the part's
  `uuid`, the `fork` of a sub session's `type`, and each `attach` entry. A
  session id is whatever string its producer chose, stored as that string; a
  `sessionId`
  absent means the main session. A decoder yields the canonical string of every
  identifier it decodes, so a reader compares like with like.
- `type` of a `Session` is `{ _tag: "main" }` or `{ _tag: "sub", id, fork }`. The
  main session's id is the constant `"main"`, so it is not stored.
- `metricTag` is `part.metric._tag`. `attach` is the `metric.data.attach` list
  lifted out of the body: it names the parts a metric is attached to, by uuid.
  A metric part states no session of its own: it belongs to the session of every
  part it names, which is what session membership is decided by. Encoding moves
  it into the meta and decoding puts it back, so the part model keeps it where it
  is.
- `timestamp` and `startTimestamp` are epoch milliseconds as an integer, and decode
  to the part's `DateTime.Utc`. They are not the ISO strings the part schema
  encodes: this region is not compressed, an ISO timestamp costs 25 bytes there, and
  two of them would be the largest field of a small part's meta.
- Every body is the part schema without the meta fields. The part schema stays the
  one source of truth for what a part holds; the split into meta and body is a view
  of it, not a second description. The two halves are written as their own frames, so
  a reader holds two layouts rather than one, and neither reads the other's bytes.

A field belongs in the meta when, and only when, it is needed by one of: skipping a
frame without decompressing it, choosing the body's schema, reading a structure with
no config, or placing a frame on a timeline. Anything else is body.

A meta decodes with no config, and one that does not decode is stepped over: a tag
no member of `Meta` states, or bytes that do not decode, leave the frame in place —
it keeps its index and its regions are consumed by their own lengths. A body the
reader's kits cannot decode is stepped over for the same kind of reason: what a body
holds is the kits' business. Failing the read instead would make one new variant unreadable to
every older reader for a whole trajectory, rather than for the frames it does not
know.

## 8. Header frame

Every trajectory begins with a chunk that holds exactly one frame, tagged `Header`.
Its body states:

| Field                                          | Meaning                                                   |
| ---------------------------------------------- | --------------------------------------------------------- |
| `version`                                      | the `@trajs/core` release that wrote the trajectory       |
| `hash`                                         | digest algorithm of every chain value                     |
| `toolkit`, `eventkit`, `metrickit`, `extrakit` | the stored kit descriptions, by name and by stored schema |

`hash` is the algorithm the chain values are computed with (section 5.2), so a reader
takes no algorithm from outside the file.

`version` is the release that wrote the trajectory, and the format revision is
whatever that release states. Releases compare as semver, a pre-release before its
release, and reading only ever goes one way: a reader MUST read a trajectory whose
`version` is its own or any earlier one, and MUST fail as `UnsupportedVersion` when
it is newer, because a later release may write a variant this one does not know.

The body is written once and never changes: an append that would write a different
one MUST fail, so a trajectory is appended by the release that created it and read by
every release after it. Moving one forward is a migration, not an append (section
16).

Being alone in its chunk is what makes the header cheap to read — the kits cost one
small chunk — and what lets a reader hold them before it decodes any body.

## 9. Footer frame

A file ends with a chunk that holds exactly one frame, tagged `Footer`. Its body
holds the chunk table:

| Field    | Meaning                                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `chunks` | one entry per data chunk, in file order: `len` (chunk size in bytes), `metaLen` (its meta region), and `count` (its frames) |

- The **digest of the file** is the chain value of the footer chunk, which covers
  `Magic`, the header chunk, and every data chunk. It is not stored a second time: a
  reader that reads the footer chunk has already read its last 32 bytes.
- `chunks` MUST list data chunks only, MUST be in file order, MUST restate each
  chunk's `metaLen` as that chunk's header states it, and MUST satisfy
  `5 + headerChunkLen + Σ len = footerStart` and `Σ count = frames`.
- `chunks` is a derived cache: every number in it can be recovered by walking the
  chunks, which is exactly what a stream reader does.

`count` makes frame index → chunk a prefix sum in memory, `len` makes chunk → offset
one too, and `metaLen` is what lets a scan read a chunk's header and meta region as
one read instead of asking the header how long the meta region is. Offsets are the
prefix sums of `len`, so every read a scan issues is stated before the first of them.

Each structural frame is alone in its chunk so that one length locates it:
`footerLen` for the footer, the fixed offset 5 for the header. A footer sharing a
chunk with parts could only be found by scanning, which is what a file exists to
avoid.

## 10. Chunking policy

A writer decides chunk membership as frames arrive: it adds each frame while the
chunk's raw size — the sum of every meta segment's bytes and every body's bytes,
before compression, where a segment's bytes are the codec's frame for that value
rather than an estimate of it — stays within `chunkSize`, and closes the chunk
before the frame that would exceed it. `chunkSize` defaults to 2 MiB and is not a
limit on the stored size: an incompressible chunk is a little larger than raw, and a
text-heavy one is several times smaller.

- The unit is raw because membership must be decided before the bodies are
  compressed, and because decompression cost follows raw bytes rather than stored
  bytes — so this one number bounds the work per random access, the stored size, the
  visibility delay of a live recording, and what a crash loses.
- A frame whose own raw size exceeds `chunkSize` is alone in its chunk, with no upper
  limit. This is also the escape hatch for a body that does not compress: alone, its
  chunk can be stored with `compression = 0` without dragging the text beside it out
  of compression.
- Membership follows arrival order only. Nothing about a part — its session, its
  kind, its size beyond the budget — moves it to a different chunk, because a
  produced trajectory interleaves kinds by construction.
- A frame MUST NOT be split across chunks. A writer MAY close a chunk early — on
  idle, or when a recording pauses; membership is not part of the format, so this
  needs no marker.
- `chunkSize` also bounds how much of a live recording a reader cannot see yet, and
  how much a crash loses, so a writer that records in real time SHOULD close a chunk
  on idle or on a time budget rather than on size alone.

## 11. Writing

A write is a sequence of whole chunks: a chunk is assembled in memory (at most
`chunkSize` of raw frames, plus its 49 bytes of header and chain) and written as one
contiguous run of bytes. A write that returns leaves the trajectory ending on a chunk
boundary, so no chunk is half written; a sink that fails or is interrupted leaves a
prefix of the chunk it was writing, and nothing else can be left behind.

The chain value of a chunk is computed while it is assembled, from the chunk's own
bytes and the value before it, so a writer holds one chunk and one 32-byte value
rather than state over the file.

The segments of a region are encoded in one pass where the writer can: the codec's
batch encoder joins the frames of the values it is given in a single buffer, so a
chunk costs one allocation per region rather than one per frame. A frame the codec
hands back for a single value is a view of a buffer it reuses, so a writer that keeps
frames from separate calls MUST copy them before it joins them.

**Writing a new trajectory.** Write `Magic`, the header chunk, the data chunks,
close the last chunk, then the footer chunk and `u32 footerLen ‖ Magic`.

**Appending.** A trajectory is continued without changing its form:

1. The target MUST exist. Creating is writing a new trajectory.
2. The stored `Header` MUST encode to the same bytes the append would write;
   otherwise it MUST fail. A trajectory holds one set of kits and one release.
3. A torn tail chunk (below) MUST be truncated first.
4. The append point is the end of the last whole chunk of a stream, which a walk of
   chunk headers and metas locates. For a file it is `footerStart`, which `footerLen`
   locates in one read: the trajectory MUST be truncated there, dropping the footer
   chunk, `footerLen` and the trailing `Magic`, and data chunks and a new footer MUST
   be written in their place.
5. The **frontier** is the 32 bytes immediately before the append point, and it is
   the only state the append carries over. It MUST read it, MUST NOT read any data
   chunk's body region, and MUST NOT fold the bytes before it into a digest. It
   MAY verify the frontier by reading the chunk that ends at the append point and the
   32 bytes before that chunk, and it MUST fail rather than continue the chain if the
   value it computes differs.
6. No digest is recomputed by reading anything: the chain continues from the frontier,
   chunk by chunk, and a file is left ending in a footer whose chain value is the
   digest of everything it now holds.

Steps 3 and 4 rewrite nothing: they drop bytes from the tail. Appending at all needs a
storage that continues a trajectory rather than replacing it, and a storage that
cannot MUST fail the append rather than write the trajectory whole.

**Sealing.** A file is produced from a stream by appending the footer chunk and
`u32 footerLen ‖ Magic` at the trajectory's current length. Sealing a file MUST fail,
so no byte of a written footer is ever replaced by a second one. The footer chunk's
chain value extends the frontier, so it is computed from that value and the footer
chunk alone.

**Torn tails.** A chunk is torn when the bytes from its offset do not hold a whole
one: the tail is shorter than the 49 bytes the smallest chunk takes, or the chunk it
starts declares an extent that runs past the end of the file. Both are the writer
stopping inside a write. A reader stops before it and a writer truncates it before
appending; truncation MUST be reported, because parts recorded there are lost. A torn
chunk can only be the last chunk of a stream, and a reader or writer that meets one in
what confirms as a file has met corruption, not a crash.

**Durability.** A write that returns states that the bytes it wrote are in the
trajectory — a reader that reads the id afterwards yields them — and nothing about the
medium behind it: a bucket holds what its upload acknowledged, and a file system may
still hold the last chunks in a page cache. A writer MAY be asked to flush what it
wrote before returning, and a storage that cannot MUST fail that request rather than
return as though it had. What a power loss takes without a flush is a tail: the parts
before the last chunk that reached the medium, which is the shape of a killed writer,
not of a damaged file.

**A write that fails** leaves a stream: the whole chunks it wrote and no footer, which
reads as those parts and holds no form to confirm. Nothing seals it and the id stays
taken, so writing the trajectory again replaces what it holds.

## 12. Reading

A reader chooses how much to read, and each choice touches nothing else:

- **The header.** `Magic` and the header chunk: one small chunk holding the kits and
  the version, which is what lets a reader hold them before it decodes any body.
- **The footer.** After confirming it (section 4.1), the footer chunk, whose last 32
  bytes are the file's digest and whose table locates everything else. No data chunk
  is read, no part is decoded, no chain value is checked.
- **The identities.** Per chunk, its chunk header and its meta region as one read,
  whose offset and length the table states: no decompression, no compression codec,
  no `bodyLen` bytes read. This is what a session tree is built on — declarations,
  forks, session membership, attachment lists and timestamps all live in metas, so a
  tree is drawn before a single body is decoded.
- **The frames of a chunk.** Read it whole, verify both checksums, decompress the body
  region, split both regions, and decode each pair, stepping over a frame whose meta
  or body does not decode (section 7). Memory holds one chunk at a time.
- **A range of frames.** Prefix sums over `count` give the chunk holding frame N, over
  `len` its offset, and the meta region is walked to the frame. Only the chunks
  covering the range are read.
- **Everything.** Every chunk's checksums and extents, every region's decode, each
  chain value against its predecessor, and in a file the table against the chunks on
  disk and the footer's chain value. This is the only read that proves the trajectory
  is what its writer wrote.

In a file the table makes the reads of a scan independent: every offset and length is
a prefix sum of the table, so a scan issues its reads at once instead of paying one
round trip per chunk.

In a stream there is no table: a walk reads chunk headers and meta regions, stops
silently at a torn chunk — the normal shape of a trajectory whose writer is still
running or was killed — and stops at the `Footer` frame. In a file the table says how
much there should be, so a short file or a failed checksum is an error.

Reading one part costs one chunk, not one part: that is the price of a compression
unit that shares its window across thousands of parts, and it is the right trade for
readers that either want one identity (no decompression) or many bodies (a range over
a span).

## 13. Integrity and failures

Four situations are distinguished by what a reader can prove:

| Situation    | Test                                             | Stream                                                 | File                                                                     |
| ------------ | ------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| torn         | a tail that does not hold a whole chunk          | stop, not an issue                                     | cannot occur: the table accounts for every byte, so it is a broken table |
| wrong bytes  | a checksum mismatch inside a complete chunk      | `ChecksumMismatch`, stop                               | `ChecksumMismatch`, and the table locates the next chunk                 |
| shapeless    | regions do not split evenly, or leave bytes over | `MalformedChunk`, stop                                 | `MalformedChunk`                                                         |
| out of order | a chain value does not extend the one before it  | `ChainMismatch`; the extents still locate what follows | `ChainMismatch` at every chunk whose value fails                         |

The distinction between torn and corrupt is structural: a torn chunk is one the file
ends inside — its extent does not fit, or its header does not even fit — not one whose
decompression failed. That is why the format never has to interpret a codec's error to
tell a killed writer from a damaged file.

A chunk checksum is not an identity: two different chunks can share one CRC-32, and
one chunk edited while keeping its checksum is not detectable chunk-locally. That is
what the chain value is for, and it covers stored bytes rather than decoded parts, so
it is checked without decompressing anything.

A failed `metaCrc` makes the rest of a stream unfindable, because `metaLen` is what
locates the next chunk; a reader MUST stop. In a file the table is independent of the
chunk headers, so a reader MAY continue at the next entry and report the failed chunk,
which is what lets validation report several issues at once.

A `ChainMismatch` names the chunk whose value failed and says nothing about what
changed in it or before it: the chain proves order and content, not cause. It does not
make the rest of a stream unfindable — a chunk's own extent and checksum still locate
the next one.

## 14. Limits

| Quantity    | Bound                                                     |
| ----------- | --------------------------------------------------------- |
| `chunkLen`  | 2³² − 1; a writer MUST NOT emit a larger one (section 10) |
| `footerLen` | 2³² − 1                                                   |
| file size   | not bounded by the format                                 |
| offsets     | computed in 64-bit arithmetic                             |

A writer SHOULD refuse a part whose meta or body alone exceeds what a chunk can state,
rather than writing a chunk no reader can read back.

## 15. Rejected alternatives

Each was considered and dropped for the reason given, so the reason is not
re-litigated later.

- **Avro OCF, Arrow IPC, Parquet, ORC, Zip.** Each answers part of section 2 and none
  answers all of it: an appendable block format with no index (Avro), a footer of
  offsets whose identity sits inside compressed buffers (Arrow, Parquet, ORC), or a
  compression unit of one entry whose directory every append rewrites (Zip). Bending
  any of them into this shape means writing these structures inside it and depending
  on it too.
- **SQLite.** A table beside a table satisfies goals 2, 3, 4 and 5, but pages are
  written in place (goal 1), so a reader may not read a file being written, and there
  is no way to range-read an object in a bucket (goal 6).
- **NDJSON, compressed or not.** Uncompressed, identity needs no decompression but
  nothing compresses (goal 2 against goal 3); compressed, identity needs the codec and
  there is no index without a sidecar (goal 5).
- **The zstd seekable format.** Its index must be the last thing in the file and its
  offsets start at byte zero, so it cannot wrap a file that also carries a header chunk
  and a footer chunk.
- **ATIF and OpenTelemetry.** Both are interchange — what a run means, to a program
  that did not record it — with no compression unit, no chunk, no index and no append.
  They are produced from a trajectory, or read into one, rather than stored in place of
  one.
- **One compression frame per part** (the format this replaces). A part is a few
  hundred bytes; a frame header, a rebuilt entropy table and a reset window cost more
  than the redundancy a per-part unit finds. It also makes a full read the slowest
  path, which is the path every consumer takes.
- **Bodies inline in each frame, one chunk spanning scattered fragments.** Skipping a
  frame would need that frame's compressed fragment length, which only a streaming
  compressor can report, and flushing per frame to force a boundary would destroy the
  window the change exists to share.
- **A whole-file digest recomputed at every append** (the tail this replaces). Append
  would read the file it appends to, and one digest at the tail localises nothing.
- **Several compression frames per chunk, so an append can continue one.** Platform
  decoders disagree about concatenated frames (section 5.1); resumability at a frame
  level is not worth a file that reads short on one platform.
- **Compressing the meta region.** It would make scanning need a codec, which is the
  property the whole split exists to keep.
- **A version byte in the container, a frame count in each chunk header, or a
  per-frame checksum.** Each states something the header, the table or the meta region
  already states, and a per-frame checksum would have nothing to cover, because a
  frame owns no bytes.
- **Fixed-size blocks with resync records and sequence numbers.** They exist to resume
  reading after a corrupt block, and there is one writer, one append point and no such
  need. What remains of that family — a digest chained from unit to unit — is kept
  (section 5.2), because it is integrity rather than availability, and it is what makes
  an append cost the tail instead of the file.
- **A length prefix of the container's own.** Writing one would produce the bytes the
  schema codec's frame already states, and leave a second encoder to keep in step with
  the codec for nothing: the prefix, the envelope byte and the tag's selector are the
  codec's, and section 6 states what the container checks over them instead.
- **One schema codec frame per region — an array of metas and an array of bodies.**
  The codec's array form is the smallest of the options: it states a row's shape once
  and back-references strings a later row repeats. It is dropped because a frame
  decodes wholly or not at all, and section 7 requires one unknown tag to cost the
  frame it is in rather than the chunk around it.
- **The codec's shared dictionary.** It turns a frame into a value that decodes only
  through the frames written before it, which is the opposite of reading one frame by
  its own bytes (section 7) and of ranging over frames a table locates (section 12).
- **The codec's fingerprint mode.** Smaller frames, at the price of an identical
  encoded layout on both ends — which no release boundary can promise, and which
  section 8's version gate and section 7's stepped-over frames both exist to avoid.

## 16. Open

- **Migrating a trajectory written by an earlier release.** A release appends only to a
  trajectory it created and reads every trajectory older than itself. Upgrading an
  existing trajectory is an operation of the library rather than a rule of this format,
  and it is not specified here.
- **Sizes.** `chunkSize` (2 MiB), the default compression level, and the share of a
  file its meta regions take are reasoned, not measured over a real recording.
- **The codec's envelope version.** Every frame states the codec's wire mode in its
  envelope byte, and a reader decodes with the mode of its own release. A codec release
  that moved that byte would make a trajectory every release could otherwise read
  unreadable, which section 8's version gate does not cover: that gate compares the
  writer's release, and this is the codec's.
