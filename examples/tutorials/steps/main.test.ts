import { expect, it } from "@effect/vitest";
import { Cache, Prompt, Response, Session, Trajectory, View } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Effect, Match, Stream } from "effect";

const config = Config.config();

interface Report {
  readonly steps: number;
  readonly prompts: number;
  readonly responses: number;
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

  // Parts are flat. View.steps emits one prompt, then the responses before the next prompt.
  return yield* View.steps(session.stream).pipe(
    Stream.runFold(
      (): Report => ({
        steps: 0,
        prompts: 0,
        responses: 0,
        messages: 0,
        characters: 0,
        toolCalls: {},
      }),
      (report, step) => {
        const counted = { ...report, steps: report.steps + 1 };

        return Match.value(step).pipe(
          Match.tag("Prompt", ({ prompt }) => ({
            ...counted,
            prompts: counted.prompts + 1,
            messages: counted.messages + prompt.messages.length,
          })),
          Match.tag("Response", ({ response }) => {
            let folded = { ...counted, responses: counted.responses + 1 };

            for (const responsePart of response) {
              const withMessage = { ...folded, messages: folded.messages + 1 };

              folded = Match.value(responsePart).pipe(
                Match.when({ type: "text" }, ({ text }) => ({
                  ...withMessage,
                  characters: withMessage.characters + text.length,
                })),
                Match.when({ type: "tool-call" }, ({ name }) => ({
                  ...withMessage,
                  toolCalls: {
                    ...withMessage.toolCalls,
                    [name]: (withMessage.toolCalls[name] ?? 0) + 1,
                  },
                })),
                Match.orElse(() => withMessage),
              );
            }

            return folded;
          }),
          Match.orElse(() => counted),
        );
      },
    ),
  );
});

it.effect("main", () =>
  main().pipe(
    Effect.map((report) =>
      expect(report).toEqual({
        steps: 4,
        prompts: 2,
        responses: 2,
        messages: 6,
        characters: 26,
        toolCalls: { get_weather: 2 },
      } satisfies Report),
    ),
    // Session.main reads parts from Cache. This layer keeps them in memory.
    // Cache.layerFsTemp keeps them in a temporary directory instead.
    Effect.provide(Cache.layer()),
  ),
);
