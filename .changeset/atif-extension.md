---
"@trajs/extension-atif": minor
---

Add `@trajs/extension-atif`, which models an ATIF system step as the
`org.js.tra.atif` extension: the operation the system initiated, its
`context_management` semantics and its observation. A system step runs no LLM
call and its payload is not a message, so the conversation parts of a trajectory
had no place for one. The package also outlines `Load`, which will turn an ATIF
document into a trajectory; the conversion itself is not implemented yet.
