import { expect, it } from "vite-plus/test";
import { Effect, Stream } from "effect";
import { Prompt } from "effect/ai";
import * as Codec from "#/Codec.ts";
import * as Response from "#/Response.ts";
import * as Trajectory from "#/Trajectory.ts";

const prompt = (text: string, session?: string) =>
  session === undefined
    ? Trajectory.promptPart(Prompt.make(text))
    : Trajectory.PromptPart.make({ messages: Prompt.make(text).content, session });

const response = (part: Response.Part<any>, session?: string) =>
  session === undefined
    ? Trajectory.responsePart(part)
    : Trajectory.AnyResponsePart.make({ response: part, session });

const call = (id: string, name = "get_weather") =>
  Response.anyToolCallPart({ id, name, params: { city: "SF" }, providerExecuted: false });

const result = (id: string, name = "get_weather") =>
  Response.anyToolResultPart({
    id,
    name,
    isFailure: false,
    result: { temp: 22 },
    encodedResult: { temp: 22 },
    providerExecuted: false,
    preliminary: false,
  });

const make = (...parts: ReadonlyArray<Trajectory.AnyPart>) =>
  Trajectory.make(Stream.fromIterable(parts));

const sessionsOf = (trajectory: Trajectory.Any) =>
  Effect.runPromise(Codec.makeMessages(trajectory));

it("hoists a system message and writes the turns of a session", async () => {
  const trajectory = make(
    Trajectory.promptPart(
      Prompt.fromMessages([
        Prompt.systemMessage({ content: "Be brief" }),
        Prompt.userMessage({ content: [Prompt.makePart("text", { text: "Hello" })] }),
      ]),
    ),
  );

  const sessions = await sessionsOf(trajectory);

  expect(sessions).toEqual({
    "": {
      system: [{ type: "text", text: "Be brief" }],
      messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    },
  });
});

it("groups the parts of an interleaved recording by their session", async () => {
  const sessions = await sessionsOf(
    make(prompt("Hello", "a"), prompt("Hi", "b"), prompt("Continue", "a")),
  );

  expect(Object.keys(sessions)).toEqual(["a", "b"]);
  expect(sessions["a"].messages).toEqual([
    {
      role: "user",
      content: [
        { type: "text", text: "Hello" },
        { type: "text", text: "Continue" },
      ],
    },
  ]);
});

it("carries a tool result in the user turn that follows its call", async () => {
  const sessions = await sessionsOf(
    make(prompt("Weather?"), response(call("c1")), response(result("c1"))),
  );

  expect(sessions[""].messages).toEqual([
    { role: "user", content: [{ type: "text", text: "Weather?" }] },
    {
      role: "assistant",
      content: [{ type: "tool_use", id: "c1", name: "get_weather", input: { city: "SF" } }],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "c1",
          content: JSON.stringify({ temp: 22 }),
          is_error: false,
        },
      ],
    },
  ]);
});

it("writes an image file as a base64 source", async () => {
  const image = Prompt.fromMessages([
    Prompt.userMessage({
      content: [
        Prompt.makePart("text", { text: "Look" }),
        Prompt.makePart("file", { mediaType: "image/png", data: new Uint8Array([1, 2, 3]) }),
      ],
    }),
  ]);

  const sessions = await sessionsOf(make(Trajectory.promptPart(image)));

  expect(sessions[""].messages).toEqual([
    {
      role: "user",
      content: [
        { type: "text", text: "Look" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } },
      ],
    },
  ]);
});

it("strips the data URL prefix from an image carried as a string", async () => {
  const image = Prompt.fromMessages([
    Prompt.userMessage({
      content: [
        Prompt.makePart("file", { mediaType: "image/jpeg", data: "data:image/jpeg;base64,AQID" }),
      ],
    }),
  ]);

  const sessions = await sessionsOf(make(Trajectory.promptPart(image)));

  expect(sessions[""].messages).toEqual([
    {
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: "AQID" },
        },
      ],
    },
  ]);
});

it("writes a PDF file as a document block", async () => {
  const document = Prompt.fromMessages([
    Prompt.userMessage({
      content: [
        Prompt.makePart("file", {
          mediaType: "application/pdf",
          fileName: "doc.pdf",
          data: new Uint8Array([1, 2, 3]),
        }),
      ],
    }),
  ]);

  const sessions = await sessionsOf(make(Trajectory.promptPart(document)));

  expect(sessions[""].messages).toEqual([
    {
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: "AQID" },
          title: "doc.pdf",
        },
      ],
    },
  ]);
});

it("drops a file the Messages API cannot carry", async () => {
  const archive = Prompt.fromMessages([
    Prompt.userMessage({
      content: [
        Prompt.makePart("file", { mediaType: "application/zip", data: new Uint8Array([1, 2, 3]) }),
      ],
    }),
  ]);

  const sessions = await sessionsOf(make(Trajectory.promptPart(archive)));

  expect(sessions[""].messages).toEqual([{ role: "user", content: [] }]);
});

it("trims trailing whitespace from the last assistant text", async () => {
  const sessions = await sessionsOf(
    make(prompt("Hello"), response(Response.makePart("text", { text: "Hi there\n" }))),
  );

  expect(sessions[""].messages).toEqual([
    { role: "user", content: [{ type: "text", text: "Hello" }] },
    { role: "assistant", content: [{ type: "text", text: "Hi there" }] },
  ]);
});

it("skips session parts", async () => {
  const sessions = await sessionsOf(make(Trajectory.sessionPart("a"), prompt("Hello", "a")));

  expect(sessions).toEqual({
    a: { messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }] },
  });
});

it("returns an empty conversation for a session that recorded no messages", async () => {
  const sessions = await sessionsOf(make(Trajectory.sessionPart("a")));

  expect(sessions).toEqual({ a: { messages: [] } });
});
