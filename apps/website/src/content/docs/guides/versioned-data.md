---
title: Versioned data
description: Record data with one version of a shape and read it back with a newer one.
---

Recorded data outlives the code that wrote it. A recording made a year ago still
has to load today, and today's code only knows today's shape of that data. The
usual answers are to keep every old shape around and branch on a version field, or
to write migrations as untyped functions over `unknown` and hope they agree with
the schema.

`Versions` puts the change into the schema itself. A version declares its own shape
and how to read the version before it, so the newest version accepts every earlier
recording and decodes it into its own value. Nothing outside that version mentions
an older shape.

## A line of versions

Token usage per model call, as it grew. `1.0.0` recorded the model and the output
tokens; `1.1.0` started recording input tokens, which older recordings do not
have; `1.2.0` split the model into a provider and a name.

```ts
import { Schema, SchemaGetter } from "effect";
import { Versions } from "@trajs/core/Extension";

const usage100 = Versions.make(
  Schema.Struct({
    version: Schema.Literal("1.0.0"),
    model: Schema.String,
    outputTokens: Schema.Number,
  }),
);

const usage110 = usage100.pipe(
  Versions.upgrade(
    (fields) => ({ ...fields, version: Schema.Literal("1.1.0"), inputTokens: Schema.Number }),
    {
      decode: SchemaGetter.transform((from) => ({
        ...from,
        version: "1.1.0" as const,
        inputTokens: 0,
      })),
    },
  ),
);

const usage120 = usage110.pipe(
  Versions.upgrade(
    (fields) => ({ ...fields, version: Schema.Literal("1.2.0"), provider: Schema.String }),
    {
      decode: SchemaGetter.transform(({ model, ...rest }) => {
        const [provider, name] = model.split("/");
        return { ...rest, version: "1.2.0" as const, provider, model: name };
      }),
    },
  ),
);
```

`fields` extends the fields of the version before it, so each version says only
what changed. `decode` turns a value of that version into the encoded form of the
new one — the form the new version's own schema then validates — so a change
cannot skip validation, and cannot describe a shape other than the one it
declared.

## One reader for the whole line

The newest version is the reader:

```ts
const read = Schema.decodeUnknownSync(usage120);

read({ version: "1.0.0", model: "openai/gpt-4o", outputTokens: 128 });
// { version: "1.2.0", model: "gpt-4o", outputTokens: 128, inputTokens: 0, provider: "openai" }

read({ version: "1.1.0", model: "openai/gpt-4o", inputTokens: 1024, outputTokens: 128 });
// { version: "1.2.0", model: "gpt-4o", outputTokens: 128, inputTokens: 1024, provider: "openai" }
```

A `1.0.0` recording comes back in `1.2.0` shape, with the input tokens it never
had filled in, and a `1.2.0` recording comes back as it was written.

Every hop is still validated on the way. A `1.0.0` recording that lost its
`outputTokens` is rejected at `1.0.0`'s own shape rather than arriving
half-migrated:

```ts
read({ version: "1.0.0", model: "openai/gpt-4o" });
// Missing key
//   at ["outputTokens"]
```

Encoding only goes forward. A writer produces the newest version, and an older
value is a failure rather than a re-encoded old recording:

```ts
Schema.encodeSync(usage120)({
  version: "1.2.0",
  provider: "openai",
  model: "gpt-4o",
  inputTokens: 1024,
  outputTokens: 128,
});
// { version: "1.2.0", model: "gpt-4o", outputTokens: 128, inputTokens: 1024, provider: "openai" }
```

## How it stays small

Every version after the oldest is built from the version before it and holds two
readers: its own shape, and one step from the version before it — a step whose
source is that version's whole reader. Adding a version adds one step, so a line of
N versions holds O(N) readers rather than one per pair of versions.

A version's own shape is also on its value, as `self`, for the cases where only one
version's fields are meant: it is the shape the next version extends, and the shape
its own value is encoded as.
