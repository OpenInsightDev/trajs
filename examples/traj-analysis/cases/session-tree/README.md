# Case: session-tree

## What it shows

A run read as the sessions it was forked into. Each session is read on its own first — the turns
it ran on, the tools it called, and what its requests were billed — and the run is then read
across them: what each inherited from the session it continues from, what its subtree came to, and
what of the run's input each was billed.

What makes the second reading possible is that a fork names a part rather than repeating what it
inherited: a session that continues another holds the parts of that one up to the part it was
forked at, and none of them twice. So a session forked off another is read as the context its model
actually saw, and the run's billing is summed over what each session produced — summing the
session streams would bill the inherited prefix again for every fork. What a forked session's
first request re-reads is then a figure of its own: the price of fanning out, which the flat log
has no place for.

## When you need it

- Reading a run that delegates: the tree the forks placed, how many turns each session ran on and
  how many of them it inherited, and what each came to with the sessions it forked off.
- Cost attribution: what the mainline spent against what it delegated, and what part of the
  delegated work was context it inherited rather than work it did.
- Auditing a sub-agent's context: the exact turns a forked session's model was given, without the
  producer having repeated them in the log.
- A run whose parts are too many to hold in memory: the same reading is `Session.toSessionsCached`,
  which serves them from a store the program provides rather than from the reading's own memory.
