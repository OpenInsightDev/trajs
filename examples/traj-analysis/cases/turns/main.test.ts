import { expect, it } from "@effect/vitest";
import { Cache, Prompt, Response, Session, Trajectory, View } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Effect, Match, Stream } from "effect";

const config = Config.config({ stream: false });

interface Report {
  readonly prompts: number;
  readonly messages: number;
  readonly characters: number;
  readonly toolCalls: Readonly<Record<string, number>>;
}

const part = Trajectory.parts(config);

const trajectory = Trajectory.make(config)(
  Stream.fromArray([
    part.prompt(Prompt.make("What is the weather in Paris?")),
    part.response(
      Response.anyToolCallPart({ id: "call_1", name: "get_weather", params: { city: "Paris" } }),
    ),
    part.response(Response.makePart("text", { text: "It is sunny." })),
    part.prompt(Prompt.make("And in Berlin?")),
    part.response(
      Response.anyToolCallPart({ id: "call_2", name: "get_weather", params: { city: "Berlin" } }),
    ),
    part.response(Response.makePart("text", { text: "It is raining." })),
  ]),
);

const main = Effect.fn(function* () {
  const session = yield* Session.main(trajectory);

  return yield* View.steps(session.stream).pipe(
    Stream.runFold(
      (): Report => ({ prompts: 0, messages: 0, characters: 0, toolCalls: {} }),
      (report, step) =>
        Match.value(step).pipe(
          Match.tag("Prompt", ({ prompt }) => ({
            ...report,
            prompts: report.prompts + 1,
            messages: report.messages + prompt.messages.length,
          })),
          Match.tag("Response", ({ response }) =>
            response.reduce(
              (report, responsePart) =>
                Match.value(responsePart).pipe(
                  Match.when({ type: "text" }, ({ text }) => ({
                    ...report,
                    characters: report.characters + text.length,
                  })),
                  Match.when({ type: "tool-call" }, ({ name }) => ({
                    ...report,
                    toolCalls: {
                      ...report.toolCalls,
                      [name]: (report.toolCalls[name] ?? 0) + 1,
                    },
                  })),
                  Match.orElse(() => report),
                ),
              report,
            ),
          ),
          Match.orElse(() => report),
        ),
    ),
  );
});

it.effect("main", () =>
  main().pipe(
    Effect.map((report) =>
      expect(report).toEqual({
        prompts: 2,
        messages: 2,
        characters: 26,
        toolCalls: { get_weather: 2 },
      } satisfies Report),
    ),
    Effect.provide(Cache.layer()),
  ),
);
