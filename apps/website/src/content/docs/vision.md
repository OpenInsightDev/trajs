---
title: Vision and roadmap
description: Where trajs is going, and how it relates to the Agent Trajectory Interchange Format.
---

trajs exists to make recorded AI sessions **durable and analyzable**. A recording
should still load years later, without the schemas it was written with, and the
conversation it holds should be readable, replayable and inspectable.

## A superset of ATIF

trajs targets the same problem as [ATIF](https://github.com/harbor-framework/harbor/blob/main/rfcs/0001-trajectory-format.md),
the Agent Trajectory Interchange Format, and aims to be a strict superset. Where
ATIF models a run as a document, trajs models it as a stream of parts that stays
attached to the toolkit and metadata it was recorded with.

## What is settled

- **A trajectory is a stream of parts.** Prompt parts, response parts and session
  declarations share one total order, and a consumer that pattern-matches parts is
  forced to handle every kind.
- **Tools round-trip.** A toolkit serializes to draft-07 JSON Schema, and a
  recording made against an empty or older toolkit is decoded again against the
  tools it actually refers to.
- **Loading tolerates unknown tools.** A recorded tool call or result whose tool is
  not installed decodes to an unconstrained part instead of failing.
- **The record is a header first.** The non-stream fields precede the parts they
  describe, and the storage format the file names decides whether those records
  are lines of JSON or BSON documents.
- **Sessions derive.** A session records where it continues from, so forks,
  resumes and sub-agents can be reconstructed from the recording.

## What is still open

1. **ATIF interoperability.** Exporting a trajectory to ATIF JSON, and loading
   ATIF back, is the clearest demonstration of the superset claim. It is blocked
   on a real modelling gap: an ATIF `step` is turn-grained (LLM call, tool calls
   and observation) while a `Part` is message-grained, and the mapping is not yet
   decided.

## How to follow along

The library lives in `packages/core`, the design record in `rfcs/`, and the
format version is recorded in the trajectory header. Contributions and shape
feedback are welcome on [GitHub](https://github.com/OpenInsightDev/trajs).
