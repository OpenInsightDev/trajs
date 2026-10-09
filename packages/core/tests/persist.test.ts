import { expect, it } from "vite-plus/test";
import { Effect, Exit, FileSystem, Sink, Stream } from "effect";
import { Prompt, Toolkit } from "effect/ai";
import * as Persist from "#/Persist.ts";
import * as Response from "#/Response.ts";
import * as Trajectory from "#/Trajectory.ts";

const trajectory = () =>
  Trajectory.make(
    Stream.fromIterable([
      Trajectory.promptPart(Prompt.make("Hello")),
      Trajectory.responsePart(
        Response.anyToolCallPart({ id: "c1", name: "read", params: {}, providerExecuted: false }),
      ),
    ]),
    Toolkit.empty,
    Trajectory.Metadata.make({ name: "greeting" }),
  );

const recordsOf = (trajectory: Trajectory.Any) =>
  Effect.runPromise(Stream.runCollect(Persist.encode(trajectory))).then((records) =>
    Array.from(records),
  );

it("writes a header record followed by one record per part", async () => {
  const records = await recordsOf(trajectory());

  // SAFETY: `recordsOf` returns the encoded JSON lines; this names the header
  // fields the assertions read.
  const header = records[0] as {
    metadata: { version: string; name: string };
  };

  expect(header.metadata.version).toBe(Trajectory.version);
  expect(header.metadata.name).toBe("greeting");
  expect(header).not.toHaveProperty("version");
  expect(records).toHaveLength(3);
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

it("writes and reads a trajectory through the stream services", async () => {
  const files = new Map<string, Uint8Array>();

  const fileSystem = FileSystem.layerNoop({
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
    stream: ((path: string) =>
      Stream.fromIterable(files.has(path) ? [files.get(path)!] : [])) as never,
  });

  const { metadata, parts } = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Persist.write(trajectory())("trajectory.trajs");
        const decoded = yield* Persist.read("trajectory.trajs");

        return { metadata: decoded.metadata, parts: Array.from(yield* Stream.runCollect(decoded)) };
      }).pipe(Effect.provide(fileSystem)),
    ),
  );

  expect(metadata.name).toBe("greeting");
  expect(parts.map((part) => part._tag)).toEqual(["Prompt", "Response"]);
});
