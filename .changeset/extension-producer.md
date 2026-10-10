---
"@trajs/core": minor
---

`Extension.Producer` states what writes an extension's data, apart from the
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
