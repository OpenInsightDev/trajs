# @trajs/core/unstable/otel

OpenTelemetry GenAI semantic conventions as Effect schemas.

The module states the spans, metrics, events, and entity of the GenAI conventions
and the MCP spans and metrics that accompany them, together with the attribute
values those signals carry. Names, requirement levels, instruments, and units
follow the registry, so telemetry can be decoded against one definition rather than
against a copy of the tables in an instrumentation library.

## Usage

Each signal states its identity and an `attributes` schema. A span also states its
kind, and a metric its instrument and unit.

```ts
import { Schema } from "effect";
import { Spans } from "@trajs/core/unstable/otel";

const attributes = Schema.decodeUnknownSync(Spans.Inference.attributes)({
  "gen_ai.operation.name": "chat",
  "gen_ai.provider.name": "openai",
  "gen_ai.request.model": "gpt-4.1",
  "gen_ai.usage.input_tokens": 128,
  "gen_ai.input.messages": [
    {
      role: "user",
      parts: [{ type: "text", content: "Weather in Paris?" }],
    },
  ],
});

Spans.Inference.type; // => "gen_ai.client.inference"
Spans.Inference.kind; // => "client"
```

A signal a provider refines carries the attributes of the signal it extends:

```ts
import { Schema } from "effect";
import { Spans } from "@trajs/core/unstable/otel";

const attributes = Schema.decodeUnknownSync(Spans.OpenAiInference.attributes)({
  "gen_ai.operation.name": "chat",
  "gen_ai.provider.name": "openai",
  "gen_ai.request.model": "gpt-4.1",
  "openai.api.type": "responses",
});

Spans.OpenAiInference.ref; // => "gen_ai.client.inference"
```

A metric is read the same way:

```ts
import { Schema } from "effect";
import { Metrics } from "@trajs/core/unstable/otel";

const attributes = Schema.decodeUnknownSync(Metrics.McpClientOperationDuration.attributes)({
  "mcp.method.name": "tools/call",
  "gen_ai.tool.name": "get_weather",
});

Metrics.McpClientOperationDuration.instrument; // => "histogram"
Metrics.McpClientOperationDuration.unit; // => "s"
```

A prompt template variable is an attribute whose name has the variable appended:

```ts
import { Schema } from "effect";
import { Attributes, Spans } from "@trajs/core/unstable/otel";

const attributes = Schema.decodeUnknownSync(Spans.Inference.attributes)({
  "gen_ai.operation.name": "chat",
  "gen_ai.provider.name": "openai",
  [Attributes.promptVariableKey("user_name")]: "Alice",
});
```

## Content

`Content` states the payloads the registry types as `any`: messages, system
instructions, tool definitions, tool call arguments and results, retrieval
documents, and memory records. The objects accept and preserve properties the
registry does not model, so provider-specific fields survive a decode.

```ts
import { Schema } from "effect";
import { Content } from "@trajs/core/unstable/otel";

const part = Schema.decodeUnknownSync(Content.TextPart)({
  type: "text",
  content: "Hello",
  cache_control: { type: "ephemeral" },
});

part.cache_control; // => { type: "ephemeral" }
```

## What is modeled

- The 13 base spans of the GenAI and MCP registries, and 7 provider or tool
  refinements with the attributes they add.
- The 23 base metrics, and 9 OpenAI refinements.
- The 3 GenAI events and the `gen_ai.main_agent` entity.
- Attribute values, attribute maps, and the enumerations the registry states:
  provider, operation, output type, response status, token modality, MCP method,
  OpenAI service tier and API type, message role, attachment modality, and finish
  reason.

Enumerations are open. A decoder accepts every listed value and any other string,
because the registry lets instrumentation report a provider-specific value.
Enumerations whose values are not strings, such as a numeric HTTP status, are
stated by the schema of the attribute.

A required attribute is a required field. An attribute the registry recommends,
marks opt-in, or requires conditionally is an optional field, since the conditions
are stated in prose and not in the registry's types.

## Provenance

The module models the GenAI development registry
`https://opentelemetry.io/schemas/gen-ai-dev/1.42.0-dev`, read from
`references/semantic-conventions-genai` at commit
`9ffc7e00c639be7712e544e3e54331e885dccf84` (2026-10-21). The registry depends on
the upstream semantic conventions `https://opentelemetry.io/schemas/1.44.0`.
`SemanticConventions` exports both URLs and the registry version.

## Development

The module is part of `@trajs/core`, so it is developed and checked from
`packages/core`: `vp check` reads it and `vp pack` builds it with the package.
`AGENTS.md` records how the module maps onto the registry and what it leaves out.
