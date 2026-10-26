# Fields the harness recorded beside a run

Not everything a run says is a message. Which model wrote an answer and at what
effort, which agent produced the run and which task it was given: the harness
knows that as it writes the parts, and the parts have no field for it. `Extra`
gives it one — a declaration of the shape those fields take on a part kind, read
and written under its own tag.

```ts
const stepExtra = new Extra.Extra({
  package: "tutorial",
  id: "Step",
  response: step, // versioned schema of what a response carries
});

const runExtra = new Extra.Extra({
  package: "tutorial",
  id: "Run",
  session: run,
});

const extrakit = ExtraKit.make(stepExtra, runExtra);
const config = Config.config({ stream: false, extrakit });
```

The tag is `package` and `id` joined — `tutorial/Step` — and it is the key the
fields sit under on the part: `part.extra["tutorial/Step"]`. Three part kinds
take extras: `prompt`, `response`, and `session`. A declaration states a schema
per kind it has fields for, and a kit is however many declarations the run
needs.

Every declared field is optional on a read, because a part may carry none of
them: `extra` decodes to `{}` when the part carries nothing. Reading a stored
part goes through `Extra.ExtraRecord(kit, "response")`, so a field the kit does
not declare for that kind is dropped rather than passed through.

Schemas are versioned, which is how a field keeps reading after it is renamed.
`VersionedSchema.make` starts the history and `VersionedSchema.upgrade` states
today's shape plus the migration from the previous one:

```ts
const step = stepAt1.pipe(
  VersionedSchema.upgrade(
    () => ({
      version: "2",
      model: Schema.String,
      effort: Schema.Literals(["low", "high"]),
    }),
    {
      decode: SchemaGetter.transform((old) => ({
        version: "2" as const,
        model: old.model_name,
        effort: old.effort,
      })),
    },
  ),
);
```

The migration runs where the record is decoded, so the rest of the program only
ever sees `model`. `Extra.stated(kit, part)` picks declared fields out of a
record without validating or migrating them, for a value being passed along
rather than used.

The run here recorded a model and an effort on each answer, and an agent and a
task on the session. One answer was written before `model_name` became `model`;
it decodes to the same shape as the other, so both read as today's fields:
`gpt-4.1-mini` at low effort calling `grep`, then `gpt-4.1` at high effort
calling no tool. The run was `cline@3.1.0` for task `t-204`.

```sh
vp test tutorials/extras
```
