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
  Effect.runPromise(Codec.makeChatCompletion(trajectory));

it("folds a recording into the messages of its session", async () => {
  const sessions = await sessionsOf(
    make(prompt("Hello"), response(Response.makePart("text", { text: "Hi" }))),
  );

  expect(sessions).toEqual({
    "": [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ],
  });
});

it("groups the parts of an interleaved recording by their session", async () => {
  const sessions = await sessionsOf(
    make(prompt("Hello", "a"), prompt("Hi", "b"), prompt("Continue", "a")),
  );

  expect(Object.keys(sessions)).toEqual(["a", "b"]);
  expect(sessions["a"]).toEqual([
    { role: "user", content: "Hello" },
    { role: "user", content: "Continue" },
  ]);
});

it("writes a tool call and its result as chat completion messages", async () => {
  const sessions = await sessionsOf(
    make(prompt("Weather?"), response(call("c1")), response(result("c1"))),
  );

  expect(sessions[""]).toEqual([
    { role: "user", content: "Weather?" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "c1",
          type: "function",
          function: { name: "get_weather", arguments: JSON.stringify({ city: "SF" }) },
        },
      ],
    },
    { role: "tool", tool_call_id: "c1", content: JSON.stringify({ temp: 22 }) },
  ]);
});

it("carries an image as a content part", async () => {
  const image = Prompt.fromMessages([
    Prompt.userMessage({
      content: [
        Prompt.makePart("text", { text: "Look" }),
        Prompt.makePart("file", { mediaType: "image/png", data: new Uint8Array([1, 2, 3]) }),
      ],
    }),
  ]);

  const sessions = await sessionsOf(make(Trajectory.promptPart(image)));

  expect(sessions[""]).toEqual([
    {
      role: "user",
      content: [
        { type: "text", text: "Look" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
      ],
    },
  ]);
});

it("skips session parts", async () => {
  const sessions = await sessionsOf(make(Trajectory.sessionPart("a"), prompt("Hello", "a")));

  expect(sessions).toEqual({ a: [{ role: "user", content: "Hello" }] });
});

it("returns an empty array for a session that recorded no messages", async () => {
  const sessions = await sessionsOf(make(Trajectory.sessionPart("a")));

  expect(sessions).toEqual({ a: [] });
});
