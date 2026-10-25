import { expect, it } from "@effect/vitest";
import { Cache, Prompt, Response, Session, Trajectory, View } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Effect, Stream } from "effect";

const config = Config.config({ stream: false });

interface Summary {
  readonly turns: number;
  readonly messages: number;
  readonly characters: number;
  readonly toolCalls: Readonly<Record<string, number>>;
}

const part = Trajectory.parts(config);

const makeTurn = (id: string, { city, answer }: { city: string; answer: string }) => [
  part.response(Response.anyToolCallPart({ id, name: "get_weather", params: { city } })),
  part.response(Response.makePart("text", { text: answer })),
];

const trajectory = Trajectory.make(config)(
  Stream.fromArray([
    part.prompt(Prompt.make("What is the weather in Paris?")),
    ...makeTurn("call_1", { city: "Paris", answer: "It is sunny." }),
    part.prompt(Prompt.make("And in Berlin?")),
    ...makeTurn("call_2", { city: "Berlin", answer: "It is raining." }),
  ]),
);

const main = Effect.fn(function* () {
  const session = yield* Session.main(trajectory);

  const steps = yield* View.steps(session.stream).pipe(Stream.runCollect);

  let turns = 0;
  let messages = 0;
  let characters = 0;
  const toolCalls: Record<string, number> = {};

  for (const step of steps) {
    if (step._tag === "Prompt") {
      turns += 1;
      messages += step.prompt.messages.length;

      continue;
    }

    if (step._tag !== "Response") continue;

    for (const responsePart of step.response) {
      messages += 1;

      if (responsePart.type === "text") {
        characters += responsePart.text.length;
      } else if (responsePart.type === "tool-call") {
        toolCalls[responsePart.name] = (toolCalls[responsePart.name] ?? 0) + 1;
      }
    }
  }

  return { turns, messages, characters, toolCalls } satisfies Summary;
});

it.effect("main", () =>
  main().pipe(
    Effect.map((summary) =>
      expect(summary).toEqual({
        turns: 2,
        messages: 6,
        characters: 26,
        toolCalls: { get_weather: 2 },
      } satisfies Summary),
    ),
    Effect.provide(Cache.layer()),
  ),
);
