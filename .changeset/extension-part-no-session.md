---
"@trajs/core": minor
---

An extension part no longer carries a `session`. A session is made of the
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
