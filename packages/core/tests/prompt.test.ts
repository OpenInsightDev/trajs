import { expect, it } from "vite-plus/test";
import { Effect, Stream } from "effect";
import { Prompt } from "effect/ai";
import * as Response from "#/Response.ts";
import * as Trajectory from "#/Trajectory.ts";
import { promptTurns } from "#/internal/prompt.ts";

const prompt = (text: string) => Trajectory.promptPart(Prompt.make(text));

const response = (text: string) => Trajectory.responsePart(Response.makePart("text", { text }));

const make = (...parts: ReadonlyArray<Trajectory.AnyPart>) =>
  Trajectory.make(Stream.fromIterable(parts));

const turnsOf = async (trajectory: Trajectory.Any) =>
  Array.from(await Effect.runPromise(Stream.runCollect(promptTurns(trajectory))));

const roles = (prompt: Prompt.Prompt) => prompt.content.map((message) => message.role);

it("groups each prompt with the responses produced for it", async () => {
  const trajectory = make(
    prompt("Hello"),
    response("Hi"),
    response("How can I help?"),
    prompt("What is 2 + 2?"),
    response("4"),
  );

  const turns = await turnsOf(trajectory);

  expect(turns).toHaveLength(2);
  expect(roles(turns[0].prompt)).toEqual(["user"]);
  expect(turns[0].response).toHaveLength(2);
  expect(turns[1].response).toHaveLength(1);
});

it("emits the last turn when the trajectory ends", async () => {
  const turns = await turnsOf(make(prompt("Hello"), response("Hi")));

  expect(turns).toHaveLength(1);
  expect(turns[0].response).toHaveLength(1);
});

it("emits a prompt that no response was recorded for", async () => {
  const turns = await turnsOf(make(prompt("Hello"), response("Hi"), prompt("Bye")));

  expect(turns).toHaveLength(2);
  expect(turns[1].response).toEqual([]);
});

it("skips response parts that no prompt precedes", async () => {
  const turns = await turnsOf(make(response("Hi"), prompt("Hello"), response("Hello there")));

  expect(turns).toHaveLength(1);
  expect(turns[0].response).toHaveLength(1);
});

it("skips parts that carry neither a prompt nor a response", async () => {
  const trajectory = make(Trajectory.sessionPart("a"), prompt("Hello"), response("Hi"));

  const turns = await turnsOf(trajectory);

  expect(turns).toHaveLength(1);
  expect(turns[0].response).toHaveLength(1);
});

it("folds the turns back into the prompt a model was given", async () => {
  const trajectory = make(prompt("Hello"), response("Hi"), prompt("Bye"), response("Goodbye"));

  const folded = await Effect.runPromise(Trajectory.prompt(trajectory));

  expect(roles(folded)).toEqual(["user", "assistant", "user", "assistant"]);
});
