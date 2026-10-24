# Case: sessions

## What it shows

A run read as the sessions it declares. Each session is read on its own first — the turns it ran
on, the tools it called, and what its requests were billed — and the run is then read across them:
what the mainline was billed against what it delegated, and how much of the delegated billing was
context read again rather than work done.

What makes the second reading possible is that a fork names a part rather than repeating what it
inherited: a session continues another at the part it was forked at, and its own stream holds only
what it produced. So what it inherited is read with `Session.stream`, which splices the parts from
the main session down to the fork, while the run's billing is summed over what each session produced
— summing the spliced streams instead would bill the prefix again for every fork. What a forked
session's first request re-reads is then a figure of its own: the price of fanning out, which the
flat log has no place for.

## When you need it

- Reading a run that delegates: how many turns each session ran on, how many of them it inherited,
  and what each was billed.
- Cost attribution: what the mainline spent against what it delegated, and what part of the
  delegated work was context it inherited rather than work it did.
- Auditing a sub-agent's context: the exact turns a forked session's model was given, without the
  producer having repeated them in the log.
- A run whose parts are too many to hold in memory: the same reading is `Session.main`, whose parts
  are served from the `Cache` the program provides rather than from the reading's own memory.
