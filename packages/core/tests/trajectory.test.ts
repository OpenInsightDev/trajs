import { expect, it } from "vite-plus/test";
import { Effect, Option, Predicate, Schema, Stream } from "effect";
import { Prompt, Tool, Toolkit } from "effect/ai";
import * as Response from "#/Response.ts";
import * as Trajectory from "#/Trajectory.ts";
import * as View from "#/View.ts";

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

it("creates a trajectory that holds no parts", async () => {
  const trajectory = Trajectory.empty();

  expect(trajectory.metadata.version).toBe(Trajectory.version);
  expect(trajectory.toolkit).toBe(Toolkit.empty);
  expect(Object.keys(trajectory.extkit)).toHaveLength(0);
  expect(Array.from(await collect(trajectory))).toHaveLength(0);
});

it("carries the metadata of an empty trajectory it was given", async () => {
  const trajectory = Trajectory.empty(Trajectory.Metadata.make({ name: "greeting" }));

  expect(trajectory.metadata.name).toBe("greeting");
  expect(trajectory.metadata.version).toBe(Trajectory.version);
  expect(Array.from(await collect(trajectory))).toHaveLength(0);
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

const streamed = (part: Response.AllParts<any>, session?: string) =>
  Trajectory.AnyStreamResponsePart.make({ response: part, session });

const foldAll = async (parts: ReadonlyArray<Trajectory.AnyStreamPart>) => {
  const trajectory = Trajectory.makeStream(Stream.fromIterable(parts));

  return Array.from(await Effect.runPromise(Stream.runCollect(Trajectory.fold(trajectory))));
};

const responsePartsOf = (parts: ReadonlyArray<Trajectory.AnyPart>) =>
  parts.flatMap((part) => (Predicate.isTagged("Response")(part) ? [part] : []));

const responsesOf = (parts: ReadonlyArray<Trajectory.AnyPart>) =>
  responsePartsOf(parts).map((part) => part.response);

it("records a response part as the increment it streamed", () => {
  const part = Trajectory.streamResponsePart(
    Response.makePart("text-delta", { id: "0", delta: "Hel" }),
  );

  expect(part._tag).toBe("Response");
  expect(part.response.type).toBe("text-delta");
});

it("folds a streamed chunk into the text it accumulated", async () => {
  const folded = await foldAll([
    streamed(Response.makePart("text-start", { id: "0" })),
    streamed(Response.makePart("text-delta", { id: "0", delta: "Hello" })),
    streamed(Response.makePart("text-delta", { id: "0", delta: " world" })),
    streamed(Response.makePart("text-end", { id: "0" })),
  ]);

  expect(folded).toHaveLength(1);
  expect(responsesOf(folded)).toEqual([Response.makePart("text", { text: "Hello world" })]);
});

it("merges the metadata the parts of a chunk carried", async () => {
  const folded = await foldAll([
    streamed(Response.makePart("text-start", { id: "0", metadata: { openai: { itemId: "m1" } } })),
    streamed(
      Response.makePart("text-delta", {
        id: "0",
        delta: "Hello",
        metadata: { dev: { chunk: "c1" } },
      }),
    ),
    streamed(Response.makePart("text-end", { id: "0", metadata: { openai: { itemId: "m3" } } })),
  ]);

  expect(responsesOf(folded)).toEqual([
    Response.makePart("text", {
      text: "Hello",
      metadata: { openai: { itemId: "m3" }, dev: { chunk: "c1" } },
    }),
  ]);
});

it("folds a streamed reasoning chunk into the reasoning it accumulated", async () => {
  const folded = await foldAll([
    streamed(Response.makePart("reasoning-start", { id: "1" })),
    streamed(Response.makePart("reasoning-delta", { id: "1", delta: "Think" })),
    streamed(Response.makePart("reasoning-end", { id: "1" })),
  ]);

  expect(responsesOf(folded)).toEqual([Response.makePart("reasoning", { text: "Think" })]);
});

it("folds the chunks of interleaved sessions apart", async () => {
  const folded = await foldAll([
    streamed(Response.makePart("text-start", { id: "0" }), "a"),
    streamed(Response.makePart("text-delta", { id: "0", delta: "Al" }), "a"),
    streamed(Response.makePart("text-start", { id: "0" }), "b"),
    streamed(Response.makePart("text-delta", { id: "0", delta: "Bo" }), "b"),
    streamed(Response.makePart("text-delta", { id: "0", delta: "ice" }), "a"),
    streamed(Response.makePart("text-delta", { id: "0", delta: "b" }), "b"),
    streamed(Response.makePart("text-end", { id: "0" }), "a"),
    streamed(Response.makePart("text-end", { id: "0" }), "b"),
  ]);

  expect(responsesOf(folded)).toEqual([
    Response.makePart("text", { text: "Alice" }),
    Response.makePart("text", { text: "Bob" }),
  ]);
  expect(Array.from(folded, (part) => part.session)).toEqual(["a", "b"]);
});

it("keeps the envelope of the part the chunk ended with", async () => {
  const end = streamed(Response.makePart("text-end", { id: "0" }), "a");

  const folded = await foldAll([
    streamed(Response.makePart("text-start", { id: "0" }), "a"),
    streamed(Response.makePart("text-delta", { id: "0", delta: "Hi" }), "a"),
    end,
  ]);

  expect(folded).toHaveLength(1);

  const [part] = responsePartsOf(folded);

  expect(part.uuid).toBe(end.uuid);
  expect(part.timestamp).toBe(end.timestamp);
  expect(part.session).toBe("a");
});

it("carries the parts it cannot fold over unchanged", async () => {
  const call = streamed(
    Response.anyToolCallPart({
      id: "c1",
      name: "search",
      params: { q: "trajs" },
      providerExecuted: false,
    }),
    "a",
  );

  const folded = await foldAll([
    Trajectory.promptPart(Prompt.make("Hello")),
    Trajectory.sessionPart("a"),
    extensionPart(),
    call,
  ]);

  expect(Array.from(folded, (part) => part._tag)).toEqual([
    "Prompt",
    "Session",
    "Extension",
    "Response",
  ]);
  expect(responsesOf(folded)).toEqual([call.response]);
});

it("records nothing for the parts of a tool call's parameters or a model's error", async () => {
  const folded = await foldAll([
    streamed(
      Response.makePart("tool-params-start", { id: "c1", name: "search", providerExecuted: false }),
    ),
    streamed(Response.makePart("tool-params-delta", { id: "c1", delta: '{"q":' })),
    streamed(Response.makePart("tool-params-end", { id: "c1" })),
    streamed(Response.makePart("error", { error: new Error("boom") })),
  ]);

  expect(folded).toEqual([]);
});

it("records nothing for a chunk the stream never ends", async () => {
  const folded = await foldAll([
    streamed(Response.makePart("text-start", { id: "0" })),
    streamed(Response.makePart("text-delta", { id: "0", delta: "Hello" })),
  ]);

  expect(folded).toEqual([]);
});

it("records nothing for an increment of no chunk", async () => {
  const folded = await foldAll([
    streamed(Response.makePart("text-delta", { id: "0", delta: "Hello" })),
    streamed(Response.makePart("text-end", { id: "0" })),
  ]);

  expect(folded).toEqual([]);
});

it("replaces a chunk a start opens over one that is still open", async () => {
  const folded = await foldAll([
    streamed(Response.makePart("text-start", { id: "0" })),
    streamed(Response.makePart("text-delta", { id: "0", delta: "Hel" })),
    streamed(Response.makePart("text-start", { id: "0" })),
    streamed(Response.makePart("text-delta", { id: "0", delta: "Lo" })),
    streamed(Response.makePart("text-end", { id: "0" })),
  ]);

  expect(responsesOf(folded)).toEqual([Response.makePart("text", { text: "Lo" })]);
});

it("folds a streamed response into a trajectory its readers read", async () => {
  const trajectory = Trajectory.makeStream(
    Stream.make(
      Trajectory.promptPart(Prompt.make("Hello")),
      streamed(Response.makePart("text-start", { id: "0" })),
      streamed(Response.makePart("text-delta", { id: "0", delta: "Hi there" })),
      streamed(Response.makePart("text-end", { id: "0" })),
    ),
  );

  const prompt = await Effect.runPromise(View.prompt(Trajectory.fold(trajectory)));

  expect(prompt.content.map((message) => message.role)).toEqual(["user", "assistant"]);
});

it("folds a stream trajectory bound to its toolkit", async () => {
  const weather = Toolkit.make(
    Tool.make("get_weather", { parameters: Schema.Struct({ city: Schema.String }) }),
  );

  const Streamed = Trajectory.StreamResponsePart(weather);

  const call = Streamed.make({
    response: Response.makePart("tool-call", {
      id: "c1",
      name: "get_weather",
      params: { city: "SF" },
      providerExecuted: false,
    }),
  });

  const trajectory = Object.assign(Stream.make(call), {
    toolkit: weather,
    metadata: Trajectory.Metadata.make({}),
    extkit: {},
  });

  const folded = Trajectory.fold(trajectory);
  const parts = Array.from(await Effect.runPromise(Stream.runCollect(folded)));

  expect(folded.toolkit).toBe(weather);
  expect(responsesOf(parts)).toEqual([call.response]);
});

it("keeps the metadata, toolkit and extension kit of the trajectory it was given", async () => {
  const trajectory = Stream.empty.pipe(
    Trajectory.makeStream(Trajectory.Metadata.make({ name: "greeting" })),
  );

  const folded = Trajectory.fold(trajectory);

  expect(folded.metadata.name).toBe("greeting");
  expect(folded.toolkit).toBe(Toolkit.empty);
  expect(folded.extkit).toEqual(trajectory.extkit);
  expect(Array.from(await Effect.runPromise(Stream.runCollect(folded)))).toEqual([]);
});
