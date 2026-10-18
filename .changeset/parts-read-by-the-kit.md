---
"@trajs/core": minor
---

A trajectory's metric and event parts are read as the kits in hand state them, and a part
no schema of the reading reads is stepped over rather than failing the read.

`Metric.MetricParts(kit)` is the parts of the metrics of a kit and nothing else, and
`Event.EventParts(kit)` the parts of its events and nothing else, so `AnyMetricPart`,
`isAnyMetricPart`, `MetricPartsView`, `AnyEventPart`, `isAnyEventPart` and
`EventPartsView` are gone: a part is read by the schema of the metric or event its tag
names, and one the kit does not name is not a part the reading reads at all.
`Exchange`'s `Loaded.read` therefore takes the config a trajectory is read with, which
is what says what its parts are; with no config every kit is empty, so every part is read
as far as those empty kits read it.

`Produce.ProduceSession.enqueueEvent` takes an `Event.EventParts` — an event at the tag
of an event of the kit, rather than any pair of a tag and some data — and
`Event.encode` reads an event part from the pair the trajectory holds, the tag it is at
and the data stated at it, carrying one over where its tag or its data is not one the
events given state.

The extra data of a part is held the same way: the kinds a kit declares of the part the
record is of and no others, so a kind it declares none of there — one it does not name,
or one it declares for another part alone — is not a field of the record, is not read as
data a part holds, and is not written beside the fields, and `ExtraRecord` is typed as
those kinds alone rather than as an open record. Reading a trajectory under kits that
name some of what it holds therefore writes back only what it read. A kind a kit declares
for a part that no version of its schema states still fails the part rather than being
dropped: a kit that states it knows a kind states how that kind is written, so data
matching no version of it is the kit's to answer for.

`Extra.stated(kit, part)` takes the extra data of a part as a kit declares it out of a
value that states more — what `Produce.ProduceSession.createSession` reads a session's
extra data from the `id`, the `fork` and the data of a kit's kinds declared beside them.

The reading cuts the body of a trajectory into frames itself rather than handing it to one
`SchemaBinary` parser, since where a frame ends is stated before what it carries is: a
frame no schema of the reading reads, and a frame whose bytes state no version of the
schema it names, is stepped over instead of ending the reading of the frames after it. A
body that ends in the middle of a frame still fails as a `TrajectoryError`.
