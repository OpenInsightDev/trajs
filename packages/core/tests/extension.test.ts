import { expect, it } from "vite-plus/test";
import { Effect, Schema, Stream } from "effect";
import { Prompt, Tool, Toolkit } from "effect/ai";
import * as Extension from "#/Extension.ts";
import * as Trajectory from "#/Trajectory.ts";
import * as TrajectoryToolkit from "#/Toolkit.ts";

const otel = Extension.make(
  "dev.trajs.otel",
  "1.0.0",
  Schema.Struct({ spanId: Schema.String, durationMs: Schema.Number }),
);

const span = (spanId: string, anchor?: string) =>
  Trajectory.anyExtensionPart({
    extension: "dev.trajs.otel",
    data: { spanId, durationMs: 12 },
    ...(anchor === undefined ? {} : { anchor }),
  });

it("defines an extension by id, version and schema", () => {
  expect(otel.id).toBe("dev.trajs.otel");
  expect(otel.version).toBe("1.0.0");
  expect(Extension.isExtension(otel)).toBe(true);
  expect(Extension.isExtension({ id: "x" })).toBe(false);
});

it("collects and merges definitions by id", () => {
  const judge = Extension.make("dev.trajs.judge", "0.1.0", Schema.Number);
  const defs = Extension.Extensions.make(otel, judge);

  expect(Object.keys(defs)).toEqual(["dev.trajs.otel", "dev.trajs.judge"]);
  expect(Extension.Extensions.merge(Extension.Extensions.empty, defs)).toEqual(defs);
  expect(Extension.Extensions.merge(defs, { "dev.trajs.otel": judge })["dev.trajs.otel"]).toBe(
    judge,
  );
});

it("selects the data of one extension, typed by its definition", async () => {
  const trajectory = Trajectory.make(
    Stream.fromIterable([
      Trajectory.anyExtensionPart({ extension: "dev.trajs.judge", data: 7 }),
      span("s1"),
      span("s2"),
    ]),
    Toolkit.empty,
  );

  const spans = Array.from(
    await Effect.runPromise(Stream.runCollect(Extension.select(otel)(trajectory))),
  );

  expect(spans.map((span) => span.spanId)).toEqual(["s1", "s2"]);
  expect(spans[0].durationMs).toBe(12);
});

it("reports data the definition does not describe", async () => {
  const strict = Extension.make(
    "dev.trajs.otel",
    "2.0.0",
    Schema.Struct({ spanId: Schema.String }),
  );
  const trajectory = Trajectory.make(
    Stream.make(Trajectory.anyExtensionPart({ extension: "dev.trajs.otel", data: { other: 1 } })),
    Toolkit.empty,
  );

  const result = await Effect.runPromise(
    Effect.exit(Stream.runCollect(Extension.select(strict)(trajectory))),
  );

  expect(result._tag).toBe("Failure");
});

it("reads every extension part, including ones no definition describes", async () => {
  const trajectory = Trajectory.make(Stream.make(span("s1")), Toolkit.empty);
  const parts = Array.from(await Effect.runPromise(Stream.runCollect(Extension.parts(trajectory))));

  expect(parts).toHaveLength(1);
  expect(parts[0].extension).toBe("dev.trajs.otel");
  expect(parts[0].data).toEqual({ spanId: "s1", durationMs: 12 });
});

it("pairs a message with the data anchored to it", async () => {
  const message = Trajectory.promptPart(Prompt.make("Hello"));

  const trajectory = Trajectory.make(
    Stream.fromIterable([span("s1", message.uuid), span("s2"), message]),
    Toolkit.empty,
  );

  const attached = Array.from(await Effect.runPromise(Extension.attach(otel)(trajectory)));

  expect(attached).toHaveLength(1);
  expect(attached[0].part.uuid).toBe(message.uuid);
  expect(attached[0].data.map((datum) => datum.spanId)).toEqual(["s1"]);
});

it("carries extension parts through toolkit rebinding", async () => {
  const weather = Toolkit.make(
    Tool.make("get_weather", { parameters: Schema.Struct({ city: Schema.String }) }),
  );
  const trajectory = Trajectory.make(
    Stream.make(span("s1")),
    Toolkit.empty,
    {},
    Extension.Extensions.make(otel),
  );

  const rebound = await Effect.runPromise(TrajectoryToolkit.toolkits(weather)(trajectory));
  const parts = Array.from(await Effect.runPromise(Stream.runCollect(Extension.parts(rebound))));

  expect(parts).toHaveLength(1);
  expect(rebound.extensions["dev.trajs.otel"]).toBe(otel);
});

it("decodes registered extension data by its definition", async () => {
  const schema = Trajectory.Part(Toolkit.empty, Extension.Extensions.make(otel));
  const part = Trajectory.anyExtensionPart({
    extension: "dev.trajs.otel",
    data: { spanId: "s1", durationMs: 3 },
  });

  const encoded = await Effect.runPromise(Schema.encodeEffect(schema)(part));
  const decoded = await Effect.runPromise(Schema.decodeEffect(schema)(encoded));

  if (decoded._tag !== "Extension") throw new Error("expected an extension part");
  expect(decoded.data).toEqual({ spanId: "s1", durationMs: 3 });
});

it("decodes extension data no definition describes, instead of failing", async () => {
  const schema = Trajectory.Part(Toolkit.empty, {});
  const part = Trajectory.anyExtensionPart({ extension: "dev.trajs.otel", data: { spanId: "s1" } });

  const encoded = await Effect.runPromise(Schema.encodeEffect(schema)(part));
  const decoded = await Effect.runPromise(Schema.decodeEffect(schema)(encoded));

  if (decoded._tag !== "Extension") throw new Error("expected an extension part");
  expect(decoded.data).toEqual({ spanId: "s1" });
});
