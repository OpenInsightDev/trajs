import { expect, it } from "vite-plus/test";
import { Effect, Option, Predicate, Schema, Stream } from "effect";
import { Prompt, Tool, Toolkit } from "effect/ai";
import * as Extension from "#/Extension.ts";
import * as Extensionkit from "#/Extensionkit.ts";
import * as Trajectory from "#/Trajectory.ts";

const otel = Extension.make(
  "dev.observerw.otel",
  Extension.Metadata.make({ name: "OpenTelemetry" }),
  Extension.Versions.make(
    Schema.Struct({ version: Schema.Literal("1.0.0"), spanId: Schema.String }),
  ),
);

const timed = otel.pipe(
  Extension.upgrade(
    (fields) => ({ ...fields, version: Schema.Literal("1.1.0"), durationMs: Schema.Number }),
    { decode: (from) => ({ ...from, version: "1.1.0", durationMs: 0 }) },
  ),
);

const otelKit = Extensionkit.make(otel);

const timedKit = Extensionkit.make(timed);

const span = (extension: string, data: Extensionkit.AnyPart["data"]) =>
  Trajectory.AnyExtensionPart.make({ extension: { extension, data }, attach: Option.none() });

const recorded = (...parts: ReadonlyArray<Trajectory.AnyPart>) =>
  Trajectory.make(Stream.fromIterable(parts), Toolkit.empty, Extensionkit.empty);

const extensionOf = <Tools extends Record<string, Tool.Any>, Exts extends Extensionkit.Any>(
  part: Trajectory.Part<Tools, Exts>,
): Extensionkit.Part<Exts> | Extensionkit.AnyPart => {
  if (!Predicate.isTagged("Extension")(part)) {
    throw new Error(`expected an Extension part, got "${part._tag}"`);
  }

  return part.extension;
};

const payloadsOf = async <Tools extends Record<string, Tool.Any>, Exts extends Extensionkit.Any>(
  trajectory: Trajectory.Trajectory<Tools, Exts>,
): Promise<ReadonlyArray<Extensionkit.Part<Exts> | Extensionkit.AnyPart>> =>
  Array.from(await Effect.runPromise(Stream.runCollect(trajectory))).map(extensionOf);

it("reads data recorded for an extension the trajectory does not hold", async () => {
  const rebound = await Effect.runPromise(
    Extensionkit.extkits(otelKit)(
      recorded(span("dev.observerw.otel", { version: "1.0.0", spanId: "s1" })),
    ),
  );

  const [payload] = await payloadsOf(rebound);

  if (Extensionkit.isAnyPart(payload)) {
    throw new Error("expected the kit to read the span");
  }

  expect(payload.data.spanId).toBe("s1");
});

it("reads data recorded for an older version as the newest one", async () => {
  const rebound = await Effect.runPromise(
    Extensionkit.extkits(timedKit)(
      recorded(span("dev.observerw.otel", { version: "1.0.0", spanId: "s1" })),
    ),
  );

  const [payload] = await payloadsOf(rebound);

  if (Extensionkit.isAnyPart(payload)) {
    throw new Error("expected the kit to read the span");
  }

  expect(payload.data).toEqual({ version: "1.1.0", spanId: "s1", durationMs: 0 });
});

it("keeps data recorded for an extension no given kit holds", async () => {
  const rebound = await Effect.runPromise(
    Extensionkit.extkits(otelKit)(recorded(span("dev.observerw.other", { score: 0.5 }))),
  );

  const [payload] = await payloadsOf(rebound);

  expect(Extensionkit.isAnyPart(payload)).toBe(true);

  if (!Extensionkit.isAnyPart(payload)) {
    throw new Error("expected the datum to stay unrestricted");
  }

  expect(payload).toMatchObject({ extension: "dev.observerw.other", data: { score: 0.5 } });
});

it("keeps data no version of the extension accepts", async () => {
  const rebound = await Effect.runPromise(
    Extensionkit.extkits(otelKit)(recorded(span("dev.observerw.otel", { version: "1.0.0" }))),
  );

  const [payload] = await payloadsOf(rebound);

  expect(Extensionkit.isAnyPart(payload)).toBe(true);

  if (!Extensionkit.isAnyPart(payload)) {
    throw new Error("expected the datum to stay unrestricted");
  }

  expect(payload.data).toEqual({ version: "1.0.0" });
});

it("carries the toolkit, metadata and merged kit over", async () => {
  const source = Trajectory.make(
    Stream.make(Trajectory.promptPart(Prompt.make("Hello"))),
    Toolkit.empty,
    Extensionkit.empty,
    Trajectory.Metadata.make({ name: "greeting" }),
  );

  const rebound = await Effect.runPromise(Extensionkit.extkits(otelKit)(source));
  const parts = Array.from(await Effect.runPromise(Stream.runCollect(rebound)));

  expect(rebound.toolkit).toBe(source.toolkit);
  expect(rebound.metadata).toBe(source.metadata);
  expect(Object.keys(rebound.extkit)).toEqual(["dev.observerw.otel"]);
  expect(parts.map((part) => part._tag)).toEqual(["Prompt"]);

  // The rebound trajectory is put together from the parts and the kits alone, so
  // its fields are asserted against the ones `Trajectory.make` attaches.
  expect(Object.keys(rebound)).toEqual(
    Object.keys(Trajectory.make(Stream.empty, Toolkit.empty, Extensionkit.empty)),
  );
});

it("merges the given kits over the trajectory's own", async () => {
  const part = Trajectory.ExtensionPart(otelKit).make({
    extension: { extension: otel.id, data: { version: "1.0.0", spanId: "s1" } },
    attach: Option.none(),
  });

  const source = Trajectory.make(Stream.make(part), Toolkit.empty, otelKit);

  const rebound = await Effect.runPromise(Extensionkit.extkits(timedKit)(source));
  const [payload] = await payloadsOf(rebound);

  if (Extensionkit.isAnyPart(payload)) {
    throw new Error("expected the kit to read the span");
  }

  expect(payload.data).toEqual({ version: "1.1.0", spanId: "s1", durationMs: 0 });
  expect(rebound.extkit[otel.id]).toBe(timed.version);
});
