---
"@trajs/core": minor
---

Add `Codec`, which writes a recording as the messages a chat completions endpoint
accepts. `Codec.makeChatCompletion` runs the trajectory, groups its parts by the
`session` they carry, and folds each group with `Trajectory.prompt`, so a prompt
contributes the messages the model was given and the responses that follow it
contribute the messages it returned; parts with no `session` are grouped under
the empty string. The result is keyed by session and typed as the chat
completions request messages of `@effect/ai-openai-compat`, so a recording can be
replayed or evaluated with any OpenAI-compatible model. The conversion is lossy
where chat completions has no equivalent: reasoning, non-image file and tool
approval parts are dropped, and a provider-executed tool result is written as its
own `tool` message.
