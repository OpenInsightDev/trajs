---
"@trajs/core": minor
---

Add `Codec`, which also writes a recording as the conversations of Anthropic's
Messages API. `Codec.makeMessages` runs the trajectory, groups its parts by the
`session` they carry exactly as `Codec.makeChatCompletion` does, and then writes
each session in the request shape of `@effect/ai-anthropic`: the system messages
are hoisted into the top-level `system` field, consecutive turns of a role are
merged, and a tool result is carried in the user turn that follows its call. The
result is keyed by session and typed as `AnthropicSessions`, so a recording can
be replayed or evaluated with an Anthropic model. The conversion mirrors the
request building of the SDK's Anthropic language model and is lossy where the
Messages API has no equivalent, so reasoning, a provider-executed tool call or
result, a tool approval part, and a file that is neither an image nor a PDF or
plain text are dropped.

`@effect/ai-anthropic` is added to the workspace catalog and to the dependencies
of `@trajs/core`.
