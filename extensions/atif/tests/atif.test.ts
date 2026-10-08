import { expect, it } from "vite-plus/test";
import { Effect, JsonSchema, Schema, Stream } from "effect";
import { Prompt, Toolkit } from "effect/ai";
import { Extension, Persist, Trajectory } from "@trajs/core";
import * as Atif from "#/Atif.ts";

const compaction: Atif.SystemStep = {
  operation: "context-management",
  contextManagement: { type: "compaction", boundary: "replace" },
  observation: {
    results: [
      {
        content: "Summary: prior conversation covered topic X",
        subagentTrajectoryRef: [{ trajectoryId: "compact-001" }],
      },
    ],
  },
};

const prompt = Trajectory.promptPart(Prompt.make("Context compaction performed"));

const trajectory = Trajectory.make(
  Stream.make(
    Trajectory.sessionPart({ session: "s1" }),
    prompt,
    Atif.part(compaction, { anchor: prompt.uuid, session: "s1" }),
  ),
  Toolkit.empty,
  Trajectory.Metadata.make({ name: "compaction" }),
  Atif.extensions,
);

const recordsOf = () =>
  Effect.runPromise(Stream.runCollect(Persist.encode(trajectory))).then((records) =>
    Array.from(records),
  );

const partsOf = (extensions: Extension.Extensions, records: ReadonlyArray<unknown>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const decoded = yield* Persist.decode(extensions)(Stream.fromIterable(records));

        return Array.from(yield* Stream.runCollect(decoded));
      }),
    ),
  );

it("defines the ATIF extension under its identifier", () => {
  expect(Atif.extension.id).toBe("org.js.tra.atif");
  expect(Atif.extension.version).toBe("1.0.0");
  expect(Extension.isExtension(Atif.extension)).toBe(true);
  expect(Object.keys(Atif.extensions)).toEqual(["org.js.tra.atif"]);
});

it("annotates every data model with the ATIF version it mirrors", () => {
  const versions = Object.fromEntries(
    Object.entries({
      ContextManagement: Atif.ContextManagement,
      SubagentRef: Atif.SubagentRef,
      ObservationResult: Atif.ObservationResult,
      Observation: Atif.Observation,
      SystemStep: Atif.SystemStep,
    }).map(([model, schema]) => [model, Schema.resolveAnnotations(schema)?.atifVersion]),
  );

  expect(versions).toEqual({
    ContextManagement: [1, 7],
    SubagentRef: [1, 7],
    ObservationResult: [1, 2],
    Observation: [1, 2],
    SystemStep: [1, 7],
  });
});

it("constructs a datum that carries the extension identifier and its anchor", () => {
  const datum = Atif.part(compaction, { anchor: prompt.uuid });

  expect(datum._tag).toBe("Extension");
  expect(datum.extension).toBe("org.js.tra.atif");
  expect(datum.anchor).toBe(prompt.uuid);
  expect(datum.data).toEqual(compaction);
});

it("encodes a system step as an extension record", async () => {
  const records = await recordsOf();

  // SAFETY: `recordsOf` returns the encoded JSON lines; this names the header
  // fields the assertions read.
  const header = records[0] as {
    extensions: Record<
      string,
      {
        version: string;
        schema: {
          dialect: string;
          schema: { properties: Record<string, JsonSchema.JsonSchema> };
        };
      }
    >;
  };

  // SAFETY: `recordsOf` returns the encoded JSON lines; this names the last
  // record, the extension part `part` appended.
  const datum = records[records.length - 1] as { _tag: string; data: Atif.SystemStep };
  const definition = header.extensions["org.js.tra.atif"];

  expect(definition.version).toBe("1.0.0");
  expect(definition.schema.dialect).toBe("draft-07");
  expect(Object.keys(definition.schema.schema.properties)).toEqual([
    "operation",
    "contextManagement",
    "observation",
  ]);
  expect(datum._tag).toBe("Extension");
  expect(datum.data).toEqual(compaction);
});

it("reads a system step back, typed by the definition", async () => {
  const parts = await partsOf(Atif.extensions, await recordsOf());

  const trajectoryParts = Trajectory.make(
    Stream.fromIterable(parts),
    Toolkit.empty,
    Trajectory.Metadata.make({}),
    Atif.extensions,
  );

  const steps = Array.from(
    await Effect.runPromise(Stream.runCollect(Extension.select(Atif.extension)(trajectoryParts))),
  );

  expect(steps).toEqual([compaction]);
});

it("reads a system step without its definition as an unconstrained part", async () => {
  const parts = await partsOf(Extension.Extensions.empty, await recordsOf());
  const datum = parts.find(Trajectory.isExtensionPart);

  expect(datum).toBeDefined();
  expect(datum?.extension).toBe("org.js.tra.atif");
  expect(datum?.data).toEqual(compaction);
});
