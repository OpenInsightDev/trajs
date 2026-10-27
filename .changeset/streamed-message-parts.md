---
"@trajs/core": minor
---

`Produce.MessageStream` accepts a response that is still arriving.
`Produce.MessageResponsePart` is a response part holding either a finished part
or one of the increments an answer arrives in, and `Produce.MessagePart` is one
part a message stream supplies. `Produce.fromSession` and `Produce.fromSessions`
fold the increments of an answer into the part the answer ends in, so a
trajectory holds the part the chunk ended in and none of the increments. A chunk
still open when the stream ends is not written. The types are declared in
`Produce`, and `Trajectory` is unchanged.
