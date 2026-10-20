/**
 * A trajectory kept as a file and read back, end to end.
 *
 * A trajectory is written by the exchange `@trajs/core` ships, through the frame
 * the codecs of `@trajs/platform-node` state, into the storage `@trajs/utils`
 * provides, and read back the same way — so what is exercised is the seam between
 * the packages over a file a program would keep, rather than any one of them.
 */
import { NodeServices as PlatformNodeServices } from "@effect/platform-node";
import { Event, Extra, Metric, Prompt, Response, Toolkit, Trajectory } from "@trajs/core";
import { Exchange } from "@trajs/core/Exchange";
import core from "@trajs/core/package.json" with { type: "json" };
import { NodeServices } from "@trajs/platform-node";
import { Algorithm as CompressionAlgorithm } from "@trajs/utils/Compression";
import { layerFileSystem } from "@trajs/utils/Storage";
import { Effect, FileSystem, Layer, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

/** The session the trajectory runs in. */
const session = "01890a5d-ac96-774b-bcce-b302099a8057";

/** What the model was asked. */
const question = "what is the weather in SF";

/** No extra data is declared, since none of it is stated of the parts below. */
const extrakit = Extra.makeKit();

/**
 * The kits the trajectory is built and read with: no tools, no events, no metrics,
 * and a response part stated whole rather than as the increments of a stream.
 */
const config = {
  stream: false as const,
  toolkit: Toolkit.empty,
  eventkit: Event.makeKit(),
  metrickit: Metric.makeKit(),
  extrakit,
};

/** The parts of the trajectory, in the one order a trajectory carries them in. */
const parts = [
  Trajectory.sessionPart(extrakit)(session),
  Trajectory.promptPart(extrakit)(Prompt.make(question), { sessionId: session }),
  Trajectory.responsePart({ toolkit: Toolkit.empty, extrakit, stream: false })(
    Response.makePart("text", { text: "let me look that up" }),
    { sessionId: session },
  ),
];

/**
 * The trajectory the parts make, as an exchange is given one: the parts as a
 * stream, carrying the kits they are read under.
 */
const trajectory = Object.assign(Stream.fromIterable(parts), config);

/** The file system a Node program reads and writes through, under the layer that states it. */
const nodeFileSystem = Layer.merge(NodeServices.layer(), layerFileSystem);

/**
 * What a program on Node is made of: the file system and the terminal the platform
 * package states, beside the exchange of `@trajs/core` reading and writing through
 * the codecs of `@trajs/platform-node` and the file storage of `@trajs/utils`.
 */
const Nodes = Layer.merge(
  PlatformNodeServices.layer,
  Exchange.layer.pipe(Layer.provide(nodeFileSystem), Layer.provide(PlatformNodeServices.layer)),
);

/**
 * Saves the trajectory into a file of its own, reads it back, and says what was
 * read: what it states of itself, what it states at its end, and its parts.
 */
const roundTrip = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const exchange = yield* Exchange;

  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "trajs-e2e-" });
  const id = `${directory}/trajectory.trajs`;

  yield* exchange.save(trajectory)(id);

  const loaded = yield* exchange.load(id);

  return {
    header: loaded.header,
    metadata: loaded.metadata,
    read: Array.from(yield* loaded.read(config).pipe(Stream.runCollect)),
  };
}).pipe(Effect.scoped, Effect.provide(Nodes));

describe("a trajectory kept as a file", () => {
  it("reads back the parts it was written with, in the order they were written", async () => {
    const { read } = await roundTrip.pipe(Effect.runPromise);

    expect(read.map((part) => part._tag)).toEqual(parts.map((part) => part._tag));

    const prompt = read[1];

    expect(prompt._tag).toBe("Prompt");

    if (prompt._tag === "Prompt") {
      expect(prompt.sessionId).toBe(session);
      expect(prompt.messages).toEqual(Prompt.make(question).content);
    }
  });

  it("states what wrote it and what names it, at the end of its bytes", async () => {
    const { header, metadata } = await roundTrip.pipe(Effect.runPromise);

    // What it states of itself is the kits it was made with, and none were named.
    expect(header.toolkit).toEqual(Toolkit.encode(Toolkit.empty));
    expect(header.eventkit).toEqual({});

    expect(metadata.version).toBe(core.version);
    expect(metadata.compression).toBe(CompressionAlgorithm.enums.Zstd);
    expect(metadata.digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
