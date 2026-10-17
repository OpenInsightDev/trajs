---
"@trajs/extension-atif": minor
---

`Encode.encode` reads what an ATIF document states beside its conversation: the media
a step states by a path, as a `file` part of the step, read through the file system
the reading runs on under the directory `Options.cwd` names; the tools the document
says its agent was given, as the toolkit the trajectory names; and what the document
states of a run and of its steps, as the extra data this package's kit carries, with
the moment a step happened as the `timestamp` of its part.

`Encode.fromFile` reads a `trajectory.json` from a path, decoding it before the
reading, since the tools a document states are the toolkit the trajectory is read
with.

`Document` states the `parameters` of a tool definition as the JSON object the format
carries, so a document whose schema is not one is refused where it is decoded.
