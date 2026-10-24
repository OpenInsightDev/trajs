import { expect, it } from "@effect/vitest";
import {
  Cache,
  EventKit,
  ExtraKit,
  MetricKit,
  Prompt,
  Response,
  Session,
  Toolkit,
  Trajectory,
  View,
} from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Effect, Stream } from "effect";

const config = Config.config({
  stream: false,
  toolkit: Toolkit.empty,
  eventkit: EventKit.empty,
  metrickit: MetricKit.empty,
  extrakit: ExtraKit.empty,
});

interface Summary {
  readonly turns: number;
  readonly messages: number;
  readonly characters: number;
  readonly toolCalls: Readonly<Record<string, number>>;
}

const part = Trajectory.parts(config);

const makeTurn = (id: string, { city, answer }: { city: string; answer: string }) => [
  part.response(
    Response.anyToolCallPart({
      id,
      name: "get_weather",
      params: { city },
      providerExecuted: false,
    }),
  ),
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

  const turns = yield* View.promptTurns(session.stream).pipe(Stream.runCollect);

  let messages = 0;
  let characters = 0;
  const toolCalls: Record<string, number> = {};

  for (const { prompt, response } of turns) {
    messages += prompt.messages.length;

    for (const part of response) {
      messages += 1;

      if (part.type === "text") {
        characters += part.text.length;
      } else if (part.type === "tool-call") {
        toolCalls[part.name] = (toolCalls[part.name] ?? 0) + 1;
      }
    }
  }

  return { turns: turns.length, messages, characters, toolCalls } satisfies Summary;
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
    Effect.provide(Cache.Cache.layer()),
  ),
);
