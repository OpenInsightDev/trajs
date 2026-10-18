/**
 * A short conversation, read as the turns it was produced in and summarised. The
 * trajectory is built here rather than read from a `.trajs` file so the case stands on
 * its own; a real analysis reads the same parts with `Exchange`.
 */

import { Extra, Prompt, Response, Toolkit, Trajectory, View } from "@trajs/core";
import { Effect, Stream } from "effect";
import { expect, it } from "vite-plus/test";

const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057";

const extrakit = Extra.makeKit();

const response = Trajectory.ResponsePart({ toolkit: Toolkit.empty, extrakit, stream: false });

interface Summary {
  readonly turns: number;
  readonly messages: number;
  readonly characters: number;
  readonly toolCalls: Readonly<Record<string, number>>;
}

// A trajectory is a stream of parts and a stream is read once, so the sample is built
// on each call and read by the one call that asks for it.
const main = async (): Promise<Summary> => {
  const trajectory = Stream.make(
    Trajectory.promptPart(extrakit)({
      prompt: Prompt.make("What is the weather in Paris?"),
      sessionId,
    }),
    response.make({
      response: Response.anyToolCallPart({
        id: "call_1",
        name: "get_weather",
        params: { city: "Paris" },
        providerExecuted: false,
      }),
      sessionId,
      extra: {},
    }),
    response.make({
      response: Response.makePart("text", { text: "It is sunny." }),
      sessionId,
      extra: {},
    }),
    Trajectory.promptPart(extrakit)({
      prompt: Prompt.make("And in Berlin?"),
      sessionId,
    }),
    response.make({
      response: Response.anyToolCallPart({
        id: "call_2",
        name: "get_weather",
        params: { city: "Berlin" },
        providerExecuted: false,
      }),
      sessionId,
      extra: {},
    }),
    response.make({
      response: Response.makePart("text", { text: "It is raining." }),
      sessionId,
      extra: {},
    }),
  );

  const turns = Array.from(
    await Effect.runPromise(Stream.runCollect(View.promptTurns(trajectory))),
  );

  let messages = 0;
  let characters = 0;
  const toolCalls: Record<string, number> = {};

  for (const turn of turns) {
    messages += turn.prompt.messages.length;

    for (const part of turn.response) {
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

it("main", async () => {
  await expect(main()).resolves.toEqual({
    turns: 2,
    messages: 6,
    characters: 26,
    toolCalls: { get_weather: 2 },
  });
});
