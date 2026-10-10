import { expect, it } from "vite-plus/test";
import { Effect, Option, Schema, Stream } from "effect";
import { Prompt, Toolkit } from "effect/ai";
import * as Response from "#/Response.ts";
import * as Trajectory from "#/Trajectory.ts";

const parts = Stream.make(Trajectory.promptPart(Prompt.make("Hello")));

const collect = (trajectory: Trajectory.Any) => Effect.runPromise(Stream.runCollect(trajectory));

it("attaches metadata to a stream of parts", async () => {
  const trajectory = Trajectory.make(parts, Trajectory.Metadata.make({ name: "greeting" }));

  expect(trajectory.metadata.name).toBe("greeting");
  expect(trajectory.metadata.version).toBe(Trajectory.version);
  expect(trajectory.toolkit).toBe(Toolkit.empty);
  expect(Array.from(await collect(trajectory))).toHaveLength(1);
});

it("binds a stream that was defined before the metadata", async () => {
  const trajectory = parts.pipe(Trajectory.make(Trajectory.Metadata.make({ name: "greeting" })));

  expect(trajectory.metadata.name).toBe("greeting");
  expect(trajectory.toolkit).toBe(Toolkit.empty);
  expect(Array.from(await collect(trajectory))).toHaveLength(1);
});

it("updates the metadata without touching the recording it was given", async () => {
  const trajectory = Trajectory.make(parts, Trajectory.Metadata.make({ name: "greeting" }));

  const renamed = trajectory.pipe(
    Trajectory.mapMetadata((metadata) =>
      Trajectory.Metadata.make({ version: metadata.version, name: "hello" }),
    ),
  );

  expect(renamed.metadata.name).toBe("hello");
  expect(renamed.metadata.version).toBe(Trajectory.version);
  expect(renamed.toolkit).toBe(trajectory.toolkit);
  expect(Array.from(await collect(renamed))).toHaveLength(1);
  expect(trajectory.metadata.name).toBe("greeting");
});

it("updates the metadata in data-first style", () => {
  const trajectory = Trajectory.make(parts, Trajectory.Metadata.make({ name: "greeting" }));

  const renamed = Trajectory.mapMetadata(trajectory, (metadata) =>
    Trajectory.Metadata.make({
      version: metadata.version,
      name: metadata.name,
      description: "A greeting",
    }),
  );

  expect(renamed.metadata.description).toBe("A greeting");
  expect(renamed.metadata.name).toBe("greeting");
});

it("gives each part its own identifier", () => {
  const first = Trajectory.promptPart(Prompt.make("Hello"));
  const second = Trajectory.promptPart(Prompt.make("Hello"));

  expect(first.uuid).not.toBe(second.uuid);
});

const extensionPart = () =>
  Trajectory.AnyExtensionPart.make({
    extension: { extension: "dev.observerw.otel", data: { spanId: "s1" } },
    attach: Option.none(),
  });

const encodePart = Schema.encodeSync(Trajectory.Part(Toolkit.empty, {}));

it("reads a recording's message parts without the data recorded for extensions", async () => {
  const trajectory = Trajectory.make(
    Stream.make(
      Trajectory.promptPart(Prompt.make("Hello")),
      Trajectory.sessionPart("a"),
      extensionPart(),
      Trajectory.responsePart(Response.makePart("text", { text: "Hi there" })),
    ),
  );

  const messages = await Effect.runPromise(Stream.runCollect(Trajectory.messages(trajectory)));

  expect(Array.from(messages, (part) => part._tag)).toEqual(["Prompt", "Session", "Response"]);
});

it("reads the parts of a recording as message parts or extension parts", () => {
  const read = Schema.decodeUnknownSync(Trajectory.Part(Toolkit.empty, {}));
  const readMessages = Schema.decodeUnknownSync(Trajectory.MessagePart(Toolkit.empty));

  const prompt = encodePart(Trajectory.promptPart(Prompt.make("Hello")));
  const extension = encodePart(extensionPart());

  expect(read(prompt)._tag).toBe("Prompt");
  expect(read(extension)._tag).toBe("Extension");
  expect(readMessages(prompt)._tag).toBe("Prompt");
  expect(() => readMessages(extension)).toThrow();
});
