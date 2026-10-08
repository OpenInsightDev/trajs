---
title: Vision and roadmap
description: Where trajs is going, and how it relates to the Agent Trajectory Interchange Format.
---

trajs exists to make recorded AI sessions **durable and analyzable**. A recording
should still load years later, without the schemas it was written with; the data
recorded around a conversation should be as first-class as the conversation; and
that data should support typed cross-extension queries instead of being JSON you
have to hand-parse.

## A superset of ATIF

trajs targets the same problem as [ATIF](https://github.com/harbor-framework/harbor/blob/main/rfcs/0001-trajectory-format.md),
the Agent Trajectory Interchange Format, and aims to be a strict superset. Where
ATIF scatters untyped `extra: {}` bags across the document, trajs makes extension
data a part of the trajectory with an identity, a version, a schema and an anchor.
The reasoning, in full, is in
[RFC 0001: Extension API for Trajectory](https://github.com/OpenInsightDev/trajs/blob/main/rfcs/0001-extension.md).

## What is settled

- **A trajectory is a stream of parts.** Extension data is one kind of part, not a
  side channel, so consumers that pattern-match parts cannot silently drop it.
- **Extensions are defined, not bagged.** An `Extension` is an identifier, a
  version and a Schema; definitions are collected like tools into a toolkit.
- **Versioning is per extension.** There is no whole-trajectory `schema_version`.
- **Loading tolerates missing definitions.** Recorded data whose tool or extension
  is not installed decodes to an unconstrained part instead of failing.
- **The record is JSONL with the header first.** Definitions precede the data they
  describe.

## What is still open

These are recorded in RFC 0001 as open questions and guide the roadmap:

1. **Registry key.** Key the collection by `id` (one definition per id, the
   latest), or by `id@major` so several incompatible majors coexist and data
   written years ago still decodes?
2. **Semver enforcement.** `version` is recorded, but what a reader does when a
   datum's major differs from the installed definition, and whether minor
   differences are tolerated, is undecided.
3. **ATIF interoperability.** Exporting a trajectory with its extensions to ATIF
   JSON, and loading ATIF back, is the clearest demonstration of the superset
   claim. It is blocked on a real modelling gap: an ATIF `step` is turn-grained
   (LLM call, tool calls and observation) while a `Part` is message-grained, and
   the mapping is not yet decided.
4. **Mid-stream registry growth.** Allowing the header to recur and merge, so a
   long-running producer can append definitions as it goes.

## Non-goals

- No whole-trajectory `schema_version`; versioning stays per extension.
- No `extra`-style untyped escape hatch in the extension envelope; a definition's
  own Effect Schema decides how permissive it is.
- No new stream element type: extension data is a `Part`.

## How to follow along

The library lives in `packages/core`, the design record in `rfcs/`, and the format
is versioned per extension rather than per file. Contributions and shape feedback
are welcome on [GitHub](https://github.com/OpenInsightDev/trajs).
