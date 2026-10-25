# core/otel

The OpenTelemetry GenAI and MCP semantic conventions, read as Effect schemas.
`README.md` states what the module offers; this file records how it maps onto the
registry and what it leaves out.

## Source

The module is read from `references/semantic-conventions-genai` at commit
`9ffc7e00c639be7712e544e3e54331e885dccf84` (2026-10-21). Its manifest states the
GenAI development schema URL `https://opentelemetry.io/schemas/gen-ai-dev/1.42.0-dev`
and the upstream dependency `https://opentelemetry.io/schemas/1.44.0`.

The registry files the module reads:

- `model/gen-ai/registry.yaml` for the `gen_ai.*` attributes and enumerations.
- `model/gen-ai/{spans,metrics,token-metrics,events,entities}.yaml` for the GenAI
  signals and their attribute groups. The groups are private to the signal files,
  so `internal/groups.ts` states each one as the fields a signal composes.
- `model/mcp/{registry,common,spans,metrics}.yaml` for the MCP attributes and
  signals.
- `model/openai/registry.yaml` and `model/aws-bedrock/registry.yaml` for the
  provider attributes.
- `model/gen-ai/*.json` for the shape of the content payloads `Content.ts` states.

## Layout

- `Attributes.ts` states `AttributeValue`, `Attributes`, `PromptVariables`, the
  `promptVariableKey` helper, and the open enumerations of the registry.
- `Content.ts` states the message, system instruction, tool, retrieval, and memory
  payloads.
- `Spans.ts` states the base spans and their refinements.
- `Metrics.ts` states the base metrics and their refinements.
- `Events.ts` states the events.
- `Entities.ts` states `gen_ai.main_agent`.
- `SemanticConventions.ts` states the registry version and schema URLs.
- `internal/enum.ts` states `openEnum`, and `internal/groups.ts` the attribute
  groups shared by signals.

## Attribute model

- Every enumerated attribute is open. `openEnum` accepts the listed values and any
  other string, which follows the registry rule that instrumentation may report a
  provider-specific value. The listed values are documentation, not a closed
  validation rule.
- A required attribute is a required struct field. Recommended, opt-in, and
  conditionally required attributes are optional fields. The condition itself is
  prose in the registry and is not enforced by the schema.
- `gen_ai.prompt.variable.<name>` is stated as a record whose key has that prefix.
  A signal that references `gen_ai.prompt.variable` composes the record with
  `withPromptVariables`, so named variables decode and unrelated attributes are
  dropped.
- Signal attribute structs accept only the attributes the convention names.
  Unknown attributes are dropped, as Effect structs drop excess properties.
- Content objects are different. They preserve unknown properties, because the
  registry lets a provider add fields to a message, part, tool definition, document,
  or memory record.
- A provider or tool refinement repeats the attributes of the signal it extends and
  adds the refinement's fields. `ref` states the extended signal type or name.

## Coverage

Done:

- 13 base spans: inference, embeddings, retrieval, fetch response, memory, create
  agent, invoke agent client, invoke agent internal, execute tool, invoke workflow,
  plan, MCP client, and MCP server.
- 7 span refinements: OpenAI inference, OpenAI fetch response, Azure AI Inference,
  AWS Bedrock inference, load skill, read skill resource, and command.
- 23 base metrics: 12 GenAI duration and agent metrics, 7 token metrics, and 4 MCP
  metrics.
- 9 OpenAI metric refinements.
- 3 events: inference operation details, evaluation result, and client operation
  exception.
- 1 entity: `gen_ai.main_agent`.
- The open enumerations of the GenAI, MCP, and OpenAI registries.

## Known gaps

- The Anthropic inference refinement adds no attributes. It changes notes and
  requirement levels only, so it has no schema distinct from `Spans.Inference`.
  The same applies to a refinement that only restates a note.
- Each refinement states the attributes it adds, but a condition that overrides a
  base requirement is still optional. For example, `gen_ai.request.model` is
  required by the OpenAI inference refinement and stated as required there, while
  `gen_ai.request.top_k` changes from conditionally required to recommended and
  stays optional.
- Span name formats are prose. The module states span types, not the template that
  builds a name from attributes.
- Event severity is prose. Instrumentations should record the inference details
  event at debug severity and the exception event at warn severity, but the module
  does not carry severity as a signal field.
- An upstream attribute outside the reference registries is stated by its
  upstream type. `azure.resource_provider.namespace`, `process.*`,
  `exception.*`, and the network and RPC attributes are strings, integers, or
  string arrays here.
- The registry's attribute groups are copied into `internal/groups.ts` and composed
  by the signal files. A group the registry adds must be added there before a signal
  can reference it.

## Updating

1. Read the manifest of `references/semantic-conventions-genai` and record the new
   schema URLs in `SemanticConventions.ts`.
2. Diff `model/gen-ai`, `model/mcp`, `model/openai`, and `model/aws-bedrock` against
   the previous commit.
3. Update `internal/groups.ts` first, then the signal files that compose the changed
   groups.
4. Update `Attributes.ts` and `Content.ts` when an attribute type, enumeration, or
   JSON payload changes.
5. Run `vp check` from `packages/core`. The module has no test suite of its own.
