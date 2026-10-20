/**
 * A short conversation, read as the turns it was produced in and summarised.
 *
 * The trajectory is read as the turns it was produced in — every prompt, with the response
 * that answered it — and each turn is counted into the summary: the messages it was asked
 * and answered with, the characters of the text it holds, and the tools it called.
 *
 * The trajectory is built here rather than read from a `.trajs` file so the case stands on
 * its own; a real analysis reads the same parts with `Exchange`.
 */

import { Extra, Prompt, Response, Toolkit, Trajectory, View } from "@trajs/core";
import { Effect, Stream } from "effect";
import { expect, it } from "vite-plus/test";

const toolkit = Toolkit.empty;
const extrakit = Extra.emptyKit;

/** The conversation counted: messages of both sides, text characters, and tools called. */
interface Summary {
  readonly turns: number;
  readonly messages: number;
  readonly characters: number;
  readonly toolCalls: Readonly<Record<string, number>>;
}

const prompt = (text: string) => Trajectory.promptPart(extrakit)(Prompt.make(text));
const makeResponse = Trajectory.responsePart({ toolkit, extrakit, stream: false });

const turn = (id: string, city: string, answer: string) => [
  makeResponse(
    Response.anyToolCallPart({
      id,
      name: "get_weather",
      params: { city },
      providerExecuted: false,
    }),
  ),
  makeResponse(Response.makePart("text", { text: answer })),
];

const trajStream = Stream.fromArray([
  prompt("What is the weather in Paris?"),
  ...turn("call_1", "Paris", "It is sunny."),
  prompt("And in Berlin?"),
  ...turn("call_2", "Berlin", "It is raining."),
]) satisfies Trajectory.TrajectoryStream<Trajectory.AnyConfig>;

const main = async (): Promise<Summary> => {
  const turns = Array.from(
    await View.promptTurns(trajStream).pipe(Stream.runCollect, Effect.runPromise),
  );

  let messages = 0;
  let characters = 0;
  const toolCalls: Record<string, number> = {};

  for (const promptTurn of turns) {
    messages += promptTurn.prompt.messages.length;

    for (const part of promptTurn.response) {
      messages += 1;

      if (part.type === "text") {
        characters += part.text.length;
      } else if (part.type === "tool-call") {
        toolCalls[part.name] = (toolCalls[part.name] ?? 0) + 1;
      }
    }
  }

  return { turns: turns.length, messages, characters, toolCalls };
};

it("main", () =>
  expect(main()).resolves.toEqual({
    turns: 2,
    messages: 6,
    characters: 26,
    toolCalls: { get_weather: 2 },
  }));
