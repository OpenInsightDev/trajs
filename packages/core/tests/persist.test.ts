import { expect, it } from "vite-plus/test";
import { BSON } from "bson";
import { Effect, Exit, FileSystem, Schema, Sink, Stream } from "effect";
import { Prompt } from "effect/ai";
import * as Extension from "#/Extension.ts";
import * as Extensionkit from "#/Extensionkit.ts";
import * as Format from "#/Format.ts";
import * as Persist from "#/Persist.ts";
import * as Response from "#/Response.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

const trajectory = () =>
  Trajectory.make(
    Stream.fromIterable([
      Trajectory.promptPart(Prompt.make("Hello")),
      Trajectory.responsePart(
        Response.anyToolCallPart({ id: "c1", name: "read", params: {}, providerExecuted: false }),
      ),
    ]),
    Trajectory.Metadata.make({ name: "greeting" }),
  );

const recordsOf = <Exts extends Record<string, Extension.Any>>(
  trajectory: Trajectory.Trajectory<{}, Exts>,
) =>
  Effect.runPromise(Stream.runCollect(Persist.encode(trajectory))).then((records) =>
    Array.from(records),
  );

it("writes a header record followed by one record per part", async () => {
  const records = await recordsOf(trajectory());

  // SAFETY: `recordsOf` returns the encoded records; this names the header fields
  // the assertions read.
  const header = records[0] as {
    metadata: { version: string; name: string };
  };

  expect(header.metadata.version).toBe(Trajectory.version);
  expect(header.metadata.name).toBe("greeting");
  expect(header).not.toHaveProperty("version");
  expect(records).toHaveLength(3);
});

it("writes the encoded extension kit into the header", async () => {
  const otel = Extension.make(
    "dev.observerw.otel",
    Extension.Metadata.make({ name: "OpenTelemetry" }),
    Extension.Versions.make(
      Schema.Struct({ version: Schema.Literal("1.0.0"), spanId: Schema.String }),
    ),
  );

  const kit = Extensionkit.make(otel);
  const bound = Extensionkit.extkits(kit)(Trajectory.make(Stream.empty));
  const records = await recordsOf(bound);

  // SAFETY: `recordsOf` returns the encoded records; this names the header fields
  // the assertions read.
  const header = records[0] as { extkit: ReturnType<typeof Extensionkit.encode> };

  expect(header.extkit).toEqual(Extensionkit.encode(kit));
  expect(header.extkit[otel.id]).toMatchObject({
    name: "OpenTelemetry",
    schema: { dialect: "draft-07", schema: { anyOf: expect.any(Array) } },
  });
});

it("reads back metadata and parts, keeping the part tags", async () => {
  const records = await recordsOf(trajectory());

  const { metadata, parts } = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const decoded = yield* Persist.decode(Stream.fromIterable(records));

        return { metadata: decoded.metadata, parts: Array.from(yield* Stream.runCollect(decoded)) };
      }),
    ),
  );

  expect(metadata.name).toBe("greeting");
  expect(parts.map((part) => part._tag)).toEqual(["Prompt", "Response"]);
});

it("decodes the header without pulling the parts", async () => {
  const records = Stream.fromIterable([
    { metadata: { version: Trajectory.version, name: "greeting" } },
    // A part record that cannot decode, so reading the parts instead of peeling
    // off the header would fail.
    JSON.parse('{"_tag":"Prompt","messages":"not-an-array"}'),
  ]);

  const name = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const decoded = yield* Persist.decode(records);

        return decoded.metadata.name;
      }),
    ),
  );

  expect(name).toBe("greeting");
});

it("fails when the header is missing", async () => {
  const result = await Effect.runPromise(Effect.exit(Effect.scoped(Persist.decode(Stream.empty))));

  expect(Exit.isFailure(result)).toBe(true);
});

it("fails when the header does not state the specification version", async () => {
  const withoutVersion = await Effect.runPromise(
    Effect.exit(
      Effect.scoped(Persist.decode(Stream.fromIterable([{ metadata: { name: "greeting" } }]))),
    ),
  );

  const withoutMetadata = await Effect.runPromise(
    Effect.exit(Effect.scoped(Persist.decode(Stream.fromIterable([{ toolkit: {} }])))),
  );

  expect(Exit.isFailure(withoutVersion)).toBe(true);
  expect(Exit.isFailure(withoutMetadata)).toBe(true);
});

/**
 * A file system that holds the files written to it in memory, and serves each of
 * them back in chunks smaller than a record, so nothing is read in one piece.
 */
const memoryFileSystem = (files: Map<string, Uint8Array>) =>
  FileSystem.layerNoop({
    // SAFETY: `layerNoop` describes FileSystem's full member signatures; this stub
    // only needs to capture what `Persist.write` sends.
    sink: ((path: string) =>
      Sink.fold<Array<Uint8Array>, Uint8Array>(
        () => [],
        () => true,
        (chunks, chunk) => Effect.succeed([...chunks, chunk]),
      ).pipe(
        Sink.mapEffect((chunks) =>
          Effect.sync(() => {
            const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
            const bytes = new Uint8Array(size);
            let offset = 0;

            for (const chunk of chunks) {
              bytes.set(chunk, offset);
              offset += chunk.length;
            }

            files.set(path, bytes);
          }),
        ),
      )) as never,
    // SAFETY: `layerNoop` describes FileSystem's full member signatures; this stub
    // only needs to serve the bytes the sink captured.
    stream: ((path: string) => Stream.fromIterable(chunksOf(files.get(path)))) as never,
  });

/** The bytes of a file, in chunks of seven, and none at all for a file that is absent. */
const chunksOf = (bytes: Uint8Array | undefined, size = 7): ReadonlyArray<Uint8Array> => {
  if (bytes === undefined) {
    return [];
  }

  const chunks: Array<Uint8Array> = [];

  for (let offset = 0; offset < bytes.length; offset += size) {
    chunks.push(bytes.subarray(offset, offset + size));
  }

  return chunks;
};

/** The first BSON document of a file, read with BSON itself. */
const firstDocument = (bytes: Uint8Array): BSON.Document =>
  BSON.deserialize(
    bytes.subarray(0, new DataView(bytes.buffer, bytes.byteOffset, 4).getInt32(0, true)),
  );

it("writes and reads a trajectory through the stream services", async () => {
  const files = new Map<string, Uint8Array>();

  const { metadata, parts } = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Persist.write(trajectory())("trajectory.trajs");
        const decoded = yield* Persist.read("trajectory.trajs");

        return { metadata: decoded.metadata, parts: Array.from(yield* Stream.runCollect(decoded)) };
      }).pipe(Effect.provide(memoryFileSystem(files))),
    ),
  );

  expect(metadata.name).toBe("greeting");
  expect(parts.map((part) => part._tag)).toEqual(["Prompt", "Response"]);
});

it("writes and reads a trajectory in the format the key names", async () => {
  const files = new Map<string, Uint8Array>();

  const read = (key: string) =>
    Effect.gen(function* () {
      const decoded = yield* Persist.read(key);

      return { metadata: decoded.metadata, parts: Array.from(yield* Stream.runCollect(decoded)) };
    });

  const { jsonl, bson } = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Persist.write(trajectory())("trajectory.trajs");
        yield* Persist.write(trajectory())("trajectory.trajs.bson");

        return {
          jsonl: yield* read("trajectory.trajs"),
          bson: yield* read("trajectory.trajs.bson"),
        };
      }).pipe(Effect.provide(memoryFileSystem(files))),
    ),
  );

  expect(jsonl.metadata.name).toBe("greeting");
  expect(bson.metadata.name).toBe("greeting");
  expect(jsonl.parts.map((part) => part._tag)).toEqual(["Prompt", "Response"]);
  expect(bson.parts.map((part) => part._tag)).toEqual(["Prompt", "Response"]);

  // The plain file is JSON text, and the BSON one is the documents of the same
  // recording, starting with the header.
  expect(files.get("trajectory.trajs")![0]).toBe(0x7b);
  expect(firstDocument(files.get("trajectory.trajs.bson")!).metadata).toMatchObject({
    name: "greeting",
  });
});

it("reads and writes with the format the caller passes", async () => {
  const files = new Map<string, Uint8Array>();

  const parts = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Persist.write(trajectory())("trajectory.bin", { format: Format.bson });
        const decoded = yield* Persist.read("trajectory.bin", { format: Format.bson });

        return Array.from(yield* Stream.runCollect(decoded));
      }).pipe(Effect.provide(memoryFileSystem(files))),
    ),
  );

  expect(parts.map((part) => part._tag)).toEqual(["Prompt", "Response"]);
  expect(firstDocument(files.get("trajectory.bin")!).metadata).toMatchObject({ name: "greeting" });
});

it("fails when the key names no storage format", async () => {
  const error = await Effect.runPromise(
    Effect.flip(
      Effect.scoped(
        Persist.read("trajectory.txt").pipe(Effect.provide(memoryFileSystem(new Map()))),
      ),
    ),
  );

  expect(error).toBeInstanceOf(TrajectoryError);
});
