import { expect, it } from "vite-plus/test";
import { Effect, Option, Predicate, Schema, Stream } from "effect";
import { Prompt } from "effect/ai";
import { Extension, Extensionkit, Response, Trajectory } from "@trajs/core";
import * as Count from "#/Count.ts";
import {
  type EstimateTag,
  annotate,
  Estimate,
  extension,
  extensions,
  of,
  registry,
} from "#/Extension.ts";
import { Tokenizer } from "#/Tokenizer.ts";
import { png } from "./images.ts";
import { sample } from "./sample.ts";

/** The tokenizer the estimates are taken under. */
const tokenizer = await Effect.runPromise(
  Effect.gen(function* () {
    return yield* Tokenizer;
  }).pipe(Effect.provide(Tokenizer.layerFromEncoding(sample()))),
);

/** The datum an estimate part carries, read with the extension's own schema. */
const datumOf = (estimate: Trajectory.AnyExtensionPart): Estimate =>
  Schema.decodeUnknownSync(Estimate)(estimate.extension.data);

/** The tags of the parts a stream holds. */
const tagsOf = async <Part extends { readonly _tag: string }, E>(
  stream: Stream.Stream<Part, E>,
): Promise<Array<string>> =>
  Array.from(await Effect.runPromise(Stream.runCollect(stream))).map((part) => part._tag);

it("keys the registry by the version each entry reads and writes", () => {
  const defined = Object.entries(registry).filter(([version]) => version !== "latest");

  for (const [version, at] of defined) {
    expect(at.id).toBe(extension.id);
    expect(at.version.self.fields.version.literal).toBe(version);
    expect(
      Schema.decodeUnknownSync(at.version)({ version, tokens: 8, encoding: "sample" }),
    ).toEqual({ version, tokens: 8, encoding: "sample" });
  }
});

it("resolves `latest` to the newest version, which the package spells out here", () => {
  // A new version moves `latest`, so this fails until the move is made.
  expect(registry.latest).toBe(registry["0.1.1"]);
  expect(registry.latest.version.self.fields.version.literal).toBe("0.1.1");
  expect(extension).toBe(registry.latest);
  // The datum a caller builds is the newest shape, read off the line.
  expect(Estimate).toBe(registry.latest.version.self);
});

it("reads a datum recorded at `0.1.0` as `0.1.1`, without inventing what a rule priced", () => {
  const recorded = { version: "0.1.0", tokens: 1338, encoding: "sample", media: "anthropic" };
  const read = Schema.decodeUnknownSync(registry["0.1.1"].version)(recorded);

  expect(read).toEqual({
    version: "0.1.1",
    tokens: 1338,
    encoding: "sample",
    media: "anthropic",
  });
  // The field the older datum does not state stays absent rather than being guessed,
  // so absence means the datum predates it and not that nothing was priced.
  expect(Object.hasOwn(read, "mediaTokens")).toBe(false);
  // The newest shape alone reads the newest version, so an older datum is read
  // through the line rather than with the shape.
  expect(() => Schema.decodeUnknownSync(Estimate)(recorded)).toThrow();
});

it("rejects a datum of a later version at an entry that predates it", () => {
  const read = { version: "0.1.1", tokens: 8, encoding: "sample", mediaTokens: 0 };

  expect(() => Schema.decodeUnknownSync(registry["0.1.0"].version)(read)).toThrow();
});

it("reads a datum of any earlier version as the one a newer version declares", () => {
  // What adding a version looks like: the shape moves off the line, and a datum of
  // any version before it is mapped into it, so the shape is not written out twice.
  const timed = extension.pipe(
    Extension.upgrade(
      (fields) => ({ ...fields, version: Schema.Literal("0.1.2"), model: Schema.String }),
      { decode: (from) => ({ ...from, version: "0.1.2", model: "unknown" }) },
    ),
  );

  expect(
    Schema.decodeUnknownSync(timed.version)({ version: "0.1.0", tokens: 22, encoding: "sample" }),
  ).toEqual({ version: "0.1.2", tokens: 22, encoding: "sample", model: "unknown" });

  expect(
    Schema.decodeUnknownSync(timed.version)({
      version: "0.1.1",
      tokens: 22,
      encoding: "sample",
      mediaTokens: 0,
    }),
  ).toEqual({ version: "0.1.2", tokens: 22, encoding: "sample", mediaTokens: 0, model: "unknown" });
});

it("anchors the estimate of a prompt part to that part", async () => {
  const part = Trajectory.promptPart(Prompt.make("Hello"));
  const estimate = await Effect.runPromise(of(part, tokenizer));

  expect(estimate._tag).toBe("Extension");
  expect(estimate.extension.extension).toBe(extension.id);
  expect(estimate.attach).toEqual(Option.some([part.uuid]));
  // `user` (4) + `Hello` (H, e, ll, o = 4); nothing was priced by a rule
  expect(datumOf(estimate)).toEqual({
    version: "0.1.1",
    tokens: 8,
    encoding: "sample",
    mediaTokens: 0,
  });
});

it("estimates a part the way Count estimates it", async () => {
  const part = Trajectory.promptPart(
    Prompt.fromMessages([
      Prompt.assistantMessage({
        content: [
          Prompt.toolCallPart({
            id: "call-1",
            name: "get_weather",
            params: { city: "SF" },
            providerExecuted: false,
          }),
        ],
      }),
    ]),
  );

  const [estimate, expected] = await Promise.all([
    Effect.runPromise(of(part, tokenizer)),
    Effect.runPromise(Count.promptPart(part, tokenizer)),
  ]);

  expect(datumOf(estimate).tokens).toBe(expected);
});

it("estimates a response part recorded for a tool the toolkit does not hold", async () => {
  const part = Trajectory.responsePart(
    Response.anyToolCallPart({
      id: "call-1",
      name: "get_weather",
      params: { city: "SF" },
      providerExecuted: false,
    }),
  );

  const estimate = await Effect.runPromise(of(part, tokenizer));

  // `get_weather` (11) + `{"city":"SF"}` (13)
  expect(datumOf(estimate).tokens).toBe(24);
});

it("records the family a payload that is not text was priced with", async () => {
  const part = Trajectory.promptPart(
    Prompt.fromMessages([
      Prompt.userMessage({
        content: [Prompt.filePart({ mediaType: "image/png", data: png(1000, 1000) })],
      }),
    ]),
  );

  const [described, named] = await Promise.all([
    Effect.runPromise(of(part, tokenizer)),
    Effect.runPromise(of(part, tokenizer, { media: "anthropic" })),
  ]);

  // `user` (4) + the 85-token placeholder
  expect(datumOf(described)).toEqual({
    version: "0.1.1",
    tokens: 89,
    encoding: "sample",
    mediaTokens: 85,
  });
  // `user` (4) + a token per 750 pixels of 1000 by 1000 (1334)
  expect(datumOf(named)).toEqual({
    version: "0.1.1",
    tokens: 1338,
    encoding: "sample",
    media: "anthropic",
    mediaTokens: 1334,
  });
});

it("annotates only the parts that carry a kind a call names, and carries the recording's context", async () => {
  const described = Trajectory.promptPart(Prompt.make("Hello"));

  const pictured = Trajectory.promptPart(
    Prompt.fromMessages([
      Prompt.userMessage({
        content: [Prompt.filePart({ mediaType: "image/png", data: png(1000, 1000) })],
      }),
    ]),
  );

  const response = Trajectory.responsePart(Response.makePart("text", { text: "Hi there" }));

  const trajectory = Trajectory.make(
    Stream.make(described, pictured, response),
    Trajectory.Metadata.make({ name: "turn" }),
  );

  // Only the part whose message holds an image carries a `file`.
  const named = annotate(trajectory, tokenizer, { tags: ["file"] });

  expect(await tagsOf(named)).toEqual(["Prompt", "Prompt", "Extension", "Response"]);
  expect(named.toolkit).toBe(trajectory.toolkit);
  expect(named.metadata).toBe(trajectory.metadata);
  expect(named.extkit[extension.id]).toBe(extension);
  // Every part a tokenizer can count, when no kind is named.
  expect(await tagsOf(annotate(trajectory, tokenizer))).toEqual([
    "Prompt",
    "Extension",
    "Prompt",
    "Extension",
    "Response",
    "Extension",
  ]);
});

it("counts a part whole however the kinds that selected it are named", async () => {
  const part = Trajectory.promptPart(
    Prompt.fromMessages([
      Prompt.userMessage({
        content: [Prompt.filePart({ mediaType: "image/png", data: png(1000, 1000) })],
      }),
    ]),
  );

  const annotated = annotate(Trajectory.make(Stream.make(part)), tokenizer, { tags: ["file"] });
  const [read, estimate] = Array.from(await Effect.runPromise(Stream.runCollect(annotated)));

  if (!Predicate.isTagged("Extension")(estimate)) throw new Error("expected an estimate");

  // `user` (4) + the 85-token placeholder: the part whole, not the named kind alone.
  expect(Schema.decodeUnknownSync(extension.version)(estimate.extension.data)).toEqual({
    version: "0.1.1",
    tokens: 89,
    encoding: "sample",
    mediaTokens: 85,
  });
  expect(read).toBe(part);
});

it("selects a system message as text and a response part by its own kind", async () => {
  const instruction = Trajectory.promptPart(
    Prompt.fromMessages([Prompt.systemMessage({ content: "Be terse" })]),
  );

  const call = Trajectory.responsePart(
    Response.anyToolCallPart({
      id: "call-1",
      name: "get_weather",
      params: { city: "SF" },
      providerExecuted: false,
    }),
  );

  const trajectory = Trajectory.make(Stream.make(instruction, call));

  // A system message holds its content as text rather than as message parts.
  expect(await tagsOf(annotate(trajectory, tokenizer, { tags: ["text"] }))).toEqual([
    "Prompt",
    "Extension",
    "Response",
  ]);
  // A response part is one message part itself, so it carries its own kind.
  expect(await tagsOf(annotate(trajectory, tokenizer, { tags: ["tool-call"] }))).toEqual([
    "Prompt",
    "Response",
    "Extension",
  ]);
  // A kind neither one carries.
  expect(await tagsOf(annotate(trajectory, tokenizer, { tags: ["file"] }))).toEqual([
    "Prompt",
    "Response",
  ]);
});

/** Every kind of message part a prompt message or a recorded response part declares. */
type AnyTag = Prompt.Part["type"] | Trajectory.AnyResponsePart["response"]["type"];

/** The kinds of message part that carry meta information rather than content. */
type MetaTag =
  | "tool-approval-request"
  | "tool-approval-response"
  | "source"
  | "response-metadata"
  | "finish";

it("names the kinds of message part a count can be taken from", () => {
  // The tags are effect/ai's own message-part kinds, and only the kinds that carry
  // content: every kind is either a tag or one of the meta kinds below, and no
  // meta kind is a tag. A kind that is neither fails to compile on these lines.
  const tags: ReadonlyArray<EstimateTag> = [
    "text",
    "reasoning",
    "tool-call",
    "tool-result",
    "file",
  ];

  const unclassified: Record<Exclude<AnyTag, EstimateTag | MetaTag>, true> = {};
  const meta: Record<MetaTag & EstimateTag, true> = {};

  expect(tags).toHaveLength(5);
  expect(unclassified).toEqual({});
  expect(meta).toEqual({});
});

it("anchors every estimate to the part it counts", async () => {
  const prompt = Trajectory.promptPart(Prompt.make("Hello"));
  const response = Trajectory.responsePart(Response.makePart("text", { text: "Hi there" }));
  const annotated = annotate(Trajectory.make(Stream.make(prompt, response)), tokenizer);

  const attached = Array.from(await Effect.runPromise(Stream.runCollect(annotated))).map((part) =>
    Predicate.isTagged("Extension")(part) ? Option.getOrThrow(part.attach) : undefined,
  );

  expect(attached).toEqual([undefined, [prompt.uuid], undefined, [response.uuid]]);
});

it("reads an estimate back with the extension installed", async () => {
  const part = Trajectory.promptPart(Prompt.make("Hello"));
  const estimate = await Effect.runPromise(of(part, tokenizer));

  // The estimate is recorded by a trajectory that does not hold the extension, so
  // the datum is carried as JSON until the recording is rebound to it.
  const recorded = Trajectory.make(Stream.make(estimate));
  const rebound = Extensionkit.extkits(extensions)(recorded);
  const [read] = Array.from(await Effect.runPromise(Stream.runCollect(rebound)));

  if (!Predicate.isTagged("Extension")(read) || Extensionkit.isAnyPart(read.extension)) {
    throw new Error("expected the kit to read the estimate");
  }

  expect(read.extension.data).toEqual({
    version: "0.1.1",
    tokens: 8,
    encoding: "sample",
    mediaTokens: 0,
  });
});

it("reads a recording written at an earlier data version as the newest one", async () => {
  // What a recording made before this version holds: the 0.1.0 shape, with no
  // `mediaTokens` in it to be recovered.
  const stale = Trajectory.AnyExtensionPart.make({
    extension: {
      extension: extension.id,
      data: { version: "0.1.0", tokens: 12, encoding: "sample" },
    },
    attach: Option.none(),
  });

  const rebound = Extensionkit.extkits(extensions)(Trajectory.make(Stream.make(stale)));
  const [read] = Array.from(await Effect.runPromise(Stream.runCollect(rebound)));

  if (!Predicate.isTagged("Extension")(read) || Extensionkit.isAnyPart(read.extension)) {
    throw new Error("expected the kit to read the estimate");
  }

  expect(read.extension.data).toEqual({ version: "0.1.1", tokens: 12, encoding: "sample" });
});

it("fails on a text holding a special token the tokenizer does not allow", async () => {
  const part = Trajectory.responsePart(Response.makePart("text", { text: "<|fim|>" }));

  const failure = await Effect.runPromise(Effect.flip(of(part, tokenizer)));

  expect(failure.token).toBe("<|fim|>");
});
