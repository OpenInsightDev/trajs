---
"@trajs/core": minor
---

The codecs that read a trajectory as the messages of a model API are modules of
`@trajs/core`: `@trajs/extension-anthropic` and `@trajs/extension-openai-compat`
move to `packages/core/src/codec` and are imported as `@trajs/core/codec`, with each
codec reachable beside the barrel as a module of a package is —
`@trajs/core/codec/Anthropic` and `@trajs/core/codec/OpenAiCompat` — and the prompt
helpers they share under `@trajs/core/codec/internal`, which is not exported.

The barrel names each codec as a namespace, so what each states is read as
`Anthropic.*` and `OpenAiCompat.*`, and the operation that reads a trajectory as the
conversations of an API is `make` in both: `Anthropic.make` reads the conversations
of the Anthropic Messages API and `OpenAiCompat.make` those of a chat completions API
of an OpenAI-compatible client, which were `makeAnthropic` and `makeOpenAiCompat`. The
types each states are named for what they are within the namespace —
`Anthropic.Message`, `Anthropic.Conversation`, `Anthropic.Sessions`,
`OpenAiCompat.Message` and `OpenAiCompat.Sessions`, which were `AnthropicMessage`,
`AnthropicConversation`, `AnthropicSessions`, `OpenAiCompatMessage` and
`OpenAiCompatSessions`.

The two extension packages are removed, so a program that reads a trajectory this way
depends on `@trajs/core` alone.
